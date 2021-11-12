import {
  ApiComponent,
  CopyFileRequest,
  CreateFileRequest,
  CreateWorkspaceRequest,
  DeleteFileRequest,
  GenericApiError,
  GetDevicesRequest,
  GetFileRequest,
  GetFilesRequest,
  GetProjectRequest,
  GetWorkspaceRequest,
  GetWorkspacesRequest,
  PublishRequest,
  SaveFileRequest,
  UploadFileRequest,
  addApiRoute,
  apiErrorHandler,
} from './api';
import {
  DeviceData,
  EditorFileData,
  EditorFileSettings,
  EmptyData,
  FileData,
  GitHubInstallationInfo,
  GitHubOrgInstallationInfo,
  ProjectData,
  PublishResult,
  RepoCommit,
  UrlConfig,
  WorkspaceData,
  WorkspacePublishConfig,
} from '@blinkk/editor.dev-ui/dist/editor/api';
import {
  FileNotFoundError,
  ProjectTypeStorageComponent,
  StorageManager,
} from '../storage/storage';
import {
  GHAuthRequest,
  clearAuthGitHub,
  githubAuthMiddleware,
} from '../auth/githubAuth';
import {
  expandWorkspaceBranch,
  isWorkspaceBranch,
  shortenWorkspaceName,
} from '@blinkk/editor.dev-ui/dist/editor/workspace';

import {AmagakiApi} from './projectType/amagakiApi';
import {AmagakiProjectType} from '../projectType/amagakiProjectType';
import {GrowApi} from './projectType/growApi';
import {GrowProjectType} from '../projectType/growProjectType';
import {Octokit} from '@octokit/core';
import {ProjectTypeComponent} from '../projectType/projectType';
import express from 'express';
import yaml from 'js-yaml';

/**
 * Normalized error for missing files in the storage classes.
 */
export class ApiNotFoundError extends GenericApiError {}

export const COMMITTER_EMAIL = 'bot@editor.dev';
export const COMMITTER_NAME = 'editor.dev bot';
export const DEFAULT_AUTHOR_EMAIL = 'hello@blinkk.com';
export const DEFAULT_AUTHOR_NAME = 'editor.dev';
const PER_PAGE = 100;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ClearAuthRequest extends GHAuthRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ClearAuthResponse {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetOrganizationsRequest {}

export interface GetRepositoriesRequest {
  installationId: number;
}

export class GitHubApi implements ApiComponent {
  storageManager: StorageManager;
  protected _projectType?: ProjectTypeComponent;
  protected _apiRouter?: express.Router;
  protected _apiGenericRouter?: express.Router;

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
  }

  get apiRouter() {
    if (!this._apiRouter) {
      const router = express.Router({
        mergeParams: true,
      });
      router.use(express.json({limit: '5mb'}));

      // Use auth middleware for authenticating.
      router.use(githubAuthMiddleware);

      addApiRoute(router, '/auth.clear', this.clearAuth.bind(this));
      addApiRoute(router, '/devices.get', this.getDevices.bind(this));
      addApiRoute(router, '/file.copy', this.copyFile.bind(this));
      addApiRoute(router, '/file.create', this.createFile.bind(this));
      addApiRoute(router, '/file.delete', this.deleteFile.bind(this));
      addApiRoute(router, '/file.get', this.getFile.bind(this));
      addApiRoute(router, '/file.save', this.saveFile.bind(this));
      addApiRoute(router, '/file.upload', this.uploadFile.bind(this));
      addApiRoute(router, '/files.get', this.getFiles.bind(this));
      addApiRoute(router, '/project.get', this.getProject.bind(this));
      addApiRoute(router, '/publish.start', this.publish.bind(this));
      addApiRoute(router, '/workspace.create', this.createWorkspace.bind(this));
      addApiRoute(router, '/workspace.get', this.getWorkspace.bind(this));
      addApiRoute(router, '/workspaces.get', this.getWorkspaces.bind(this));

      // Add project type specific routes.
      const amagakiApi = new AmagakiApi(this.getStorage.bind(this));
      router.use('/amagaki', amagakiApi.apiRouter);
      const growApi = new GrowApi(this.getStorage.bind(this));
      router.use('/grow', growApi.apiRouter);

      // Error handler needs to be last.
      router.use(apiErrorHandler);

      this._apiRouter = router;
    }

    return this._apiRouter;
  }

  /**
   * Generic api routes for talking with GitHub without a specific
   * repository and branch.
   */
  get apiGenericRouter() {
    if (!this._apiGenericRouter) {
      const router = express.Router({
        mergeParams: true,
      });
      router.use(express.json({limit: '5mb'}));

      // Use auth middleware for authenticating.
      router.use(githubAuthMiddleware);
      addApiRoute(
        router,
        '/organizations.get',
        this.getOrganizations.bind(this)
      );
      addApiRoute(router, '/repositories.get', this.getRepositories.bind(this));
      addApiRoute(router, '/workspaces.get', this.getWorkspaces.bind(this));

      // Error handler needs to be last.
      router.use(apiErrorHandler);

      this._apiGenericRouter = router;
    }

    return this._apiGenericRouter;
  }

  /**
   * Log the user out of the github account by removing the stored
   * authentication information.
   */
  async clearAuth(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    request: ClearAuthRequest
  ): Promise<ClearAuthResponse> {
    await clearAuthGitHub(request);
    return {};
  }

  async copyFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: CopyFileRequest
  ): Promise<FileData> {
    const api = this.getApi(expressResponse);
    const remoteOriginalPath = request.originalPath.replace(/^\/*/, '');
    const remotePath = request.path.replace(/^\/*/, '');
    const fileResponse = await api.request(
      'GET /repos/{owner}/{repo}/contents/{path}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        ref: expandWorkspaceBranch(expressRequest.params.branch),
        path: remoteOriginalPath,
      }
    );

    const user = await this.getUser(api);
    await api.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: expressRequest.params.organization,
      repo: expressRequest.params.project,
      branch: expandWorkspaceBranch(expressRequest.params.branch),
      path: remotePath,
      message: `Copied file on editor.dev.\n\nCopied from \`${request.originalPath}\``,
      content: (fileResponse.data as any).content || '',
      author: {
        name: user.name || DEFAULT_AUTHOR_NAME,
        email: user.email || DEFAULT_AUTHOR_EMAIL,
      },
      committer: {
        name: COMMITTER_NAME,
        email: COMMITTER_EMAIL,
      },
    });

    return {
      path: request.path,
    };
  }

  async createFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: CreateFileRequest
  ): Promise<FileData> {
    const api = this.getApi(expressResponse);
    const user = await this.getUser(api);
    const remotePath = request.path.replace(/^\/*/, '');
    const fileContents = Buffer.from(request.content || '');

    await api.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: expressRequest.params.organization,
      repo: expressRequest.params.project,
      branch: expandWorkspaceBranch(expressRequest.params.branch),
      path: remotePath,
      message: 'New file on editor.dev.',
      content: fileContents.toString('base64'),
      author: {
        name: user.name || DEFAULT_AUTHOR_NAME,
        email: user.email || DEFAULT_AUTHOR_EMAIL,
      },
      committer: {
        name: COMMITTER_NAME,
        email: COMMITTER_EMAIL,
      },
    });

    return {
      path: request.path,
    };
  }

  async createWorkspace(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: CreateWorkspaceRequest
  ): Promise<WorkspaceData> {
    const api = this.getApi(expressResponse);

    // Find the information from the original branch.
    const branchResponse = await api.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        branch: expandWorkspaceBranch(request.base.branch.name),
      }
    );

    const commitResponse = await api.request(
      'GET /repos/{owner}/{repo}/commits/{commit}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        commit: branchResponse.data.commit.sha,
      }
    );

    // Create the new branch ref.
    await api.request('POST /repos/{owner}/{repo}/git/refs', {
      owner: expressRequest.params.organization,
      repo: expressRequest.params.project,
      ref: `refs/heads/${expandWorkspaceBranch(request.workspace)}`,
      sha: branchResponse.data.commit.sha,
    });

    // Retrieve the information for the new branch.
    const newBranchResponse = await api.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        branch: expandWorkspaceBranch(request.workspace),
      }
    );

    return {
      branch: {
        name: newBranchResponse.data.name,
        commit: {
          hash: newBranchResponse.data.commit.sha,
          url: newBranchResponse.data.commit.html_url,
          author: {
            name: commitResponse.data.commit.author.name,
            email: commitResponse.data.commit.author.email,
          },
          timestamp: commitResponse.data.commit.author.date,
        },
      },
      name: shortenWorkspaceName(newBranchResponse.data.name || ''),
    };
  }

  async deleteFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: DeleteFileRequest
  ): Promise<EmptyData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    await storage.deleteFile(request.file.path);
    return {};
  }

  getApi(expressResponse: express.Response): Octokit {
    return new Octokit({auth: expressResponse.locals.access.access_token});
  }

  async getDevices(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetDevicesRequest
  ): Promise<Array<DeviceData>> {
    const editorConfig = (await this.readEditorConfig(
      expressRequest,
      expressResponse
    )) as EditorFileSettings;
    return Promise.resolve(editorConfig.devices || []);
  }

  async getFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFileRequest
  ): Promise<EditorFileData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    const api = this.getApi(expressResponse);
    const projectType = await this.getProjectType(storage);
    const projectTypeResult = await projectType.getFile(
      expressRequest,
      request
    );

    // Add git history for file.
    return Object.assign({}, projectTypeResult, {
      history: await this.getFileHistory(
        api,
        expressRequest.params.organization,
        expressRequest.params.project,
        expandWorkspaceBranch(expressRequest.params.branch),
        request.file.path
      ),
      sha: await this.getFileSha(
        api,
        expressRequest.params.organization,
        expressRequest.params.project,
        expandWorkspaceBranch(expressRequest.params.branch),
        request.file.path
      ),
    });
  }

  async getFileHistory(
    api: Octokit,
    owner: string,
    repo: string,
    branch: string,
    path: string
  ): Promise<Array<RepoCommit>> {
    const fileHistory: Array<RepoCommit> = [];
    const commitsResponse = await api.request(
      'GET /repos/{owner}/{repo}/commits',
      {
        owner: owner,
        repo: repo,
        sha: branch,
        path: path,
        per_page: 10,
      }
    );

    for (const commit of commitsResponse.data) {
      fileHistory.push({
        hash: commit.sha,
        url: commit.html_url,
        author: {
          name: commit.commit.author?.name || 'Unknown',
          email: commit.commit.author?.email || 'unknown',
        },
        timestamp: commit.commit.author?.date,
      });
    }

    return fileHistory;
  }

  async getFileSha(
    api: Octokit,
    owner: string,
    repo: string,
    branch: string,
    path: string
  ): Promise<String> {
    const remotePath = path.replace(/^\/*/, '');

    // Retrieve the existing file information.
    const fileResponse = await api.request(
      'GET /repos/{owner}/{repo}/contents/{path}',
      {
        owner: owner,
        repo: repo,
        path: remotePath,
        ref: branch,
      }
    );

    return (fileResponse.data as any).sha;
  }

  async getFiles(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFilesRequest
  ): Promise<Array<FileData>> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    return (await storage.readDir('/')) as Array<FileData>;
  }

  async getOrganizations(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetOrganizationsRequest
  ): Promise<Array<GitHubInstallationInfo>> {
    const api = this.getApi(expressResponse);
    const installations: Array<GitHubInstallationInfo> = [];
    const rawResponse = (
      await api.request('GET /user/installations', {
        per_page: PER_PAGE,
      })
    ).data;

    for (const rawInstallation of rawResponse.installations) {
      installations.push({
        id: rawInstallation.id,
        org: rawInstallation.account?.login || '',
        url: rawInstallation.html_url,
        avatarUrl: rawInstallation.account?.avatar_url,
      });
    }

    return installations;
  }

  async getProject(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: GetProjectRequest
  ): Promise<ProjectData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    const projectType = await this.getProjectType(storage);
    const projectTypeResult = await projectType.getProject(
      expressRequest,
      request
    );
    const editorConfig = await this.readEditorConfig(
      expressRequest,
      expressResponse
    );
    projectTypeResult.experiments = projectTypeResult.experiments || {};
    projectTypeResult.features = projectTypeResult.features || {};

    // Pull in editor configuration for experiments.
    if (editorConfig.experiments) {
      projectTypeResult.experiments = Object.assign(
        {},
        editorConfig.experiments,
        projectTypeResult.experiments
      );
    }

    // Pull in editor configuration for features.
    if (editorConfig.features) {
      projectTypeResult.features = Object.assign(
        {},
        editorConfig.features,
        projectTypeResult.features
      );
    }

    // ProjectType config take precedence over editor config.
    return Object.assign(
      {},
      editorConfig,
      {
        type: projectType.type,
        publish: {
          fields: [],
        },
        source: {
          source: 'GitHub',
          label: `${expressRequest.params.organization}/${expressRequest.params.project}`,
          identifier: `${expressRequest.params.organization}/${expressRequest.params.project}`,
        },
        ui: {
          labels: {
            publishNotStarted: 'Create PR',
            publishPending: 'Pending PR',
          },
        },
      },
      projectTypeResult
    );
  }

  async getProjectType(
    storage: ProjectTypeStorageComponent
  ): Promise<ProjectTypeComponent> {
    // Check for specific features of the supported projectTypes.
    // Prefer amagaki over grow.
    if (await AmagakiProjectType.canApply(storage)) {
      return new AmagakiProjectType(storage);
    } else if (await GrowProjectType.canApply(storage)) {
      return new GrowProjectType(storage);
    }
    // TODO: use generic projectType.
    throw new Error('Unable to determine projectType.');
  }

  async getStorage(
    expressRequest: express.Request,
    expressResponse: express.Response
  ): Promise<ProjectTypeStorageComponent> {
    return this.storageManager.storageForBranch(
      expressRequest.params.organization,
      expressRequest.params.project,
      expressRequest.params.branch,
      this.getApi(expressResponse),
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        branch: expandWorkspaceBranch(expressRequest.params.branch),
        getUser: this.getUser.bind(this),
      }
    );
  }

  async getRepositories(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetRepositoriesRequest
  ): Promise<Array<GitHubOrgInstallationInfo>> {
    const api = this.getApi(expressResponse);
    const installations: Array<GitHubOrgInstallationInfo> = [];
    let hasMore = true;
    let page = 1;

    while (hasMore) {
      const rawResponse = (
        await api.request(
          'GET /user/installations/{installation_id}/repositories',
          {
            installation_id: request.installationId,
            per_page: PER_PAGE,
            page: page,
          }
        )
      ).data;

      hasMore = page++ * PER_PAGE < rawResponse.total_count;

      for (const rawRepository of rawResponse.repositories) {
        installations.push({
          repo: rawRepository.name,
          org: rawRepository.owner?.login || '',
          url: rawRepository.html_url,
          description: rawRepository.description || '',
          updatedAt: rawRepository.updated_at || undefined,
        });
      }
    }

    return installations;
  }

  async getUser(api: Octokit) {
    return (await api.request('GET /user')).data;
  }

  async getWorkspace(
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetWorkspaceRequest
  ): Promise<WorkspaceData> {
    const api = this.getApi(expressResponse);
    const fullBranch = expandWorkspaceBranch(expressRequest.params.branch);
    const publishMeta: WorkspacePublishConfig = {
      status: 'NotStarted',
      urls: [],
    };

    // Find the default branch for the repo.
    // Start the request before the sequential requests.
    const repoPromise = api.request('GET /repos/{owner}/{repo}', {
      owner: expressRequest.params.organization,
      repo: expressRequest.params.project,
    });

    const branchResponse = await api.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        branch: fullBranch,
      }
    );

    // Get the commit details.
    const commitResponse = await api.request(
      'GET /repos/{owner}/{repo}/commits/{commit}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        commit: branchResponse.data.commit.sha,
      }
    );

    const repoResponse = await repoPromise;

    // Check for no changes between default and branch.
    const baseBranchResponse = await api.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        branch: repoResponse.data.default_branch,
      }
    );

    // Do not allow publishing on default branch.
    if (fullBranch === repoResponse.data.default_branch) {
      publishMeta.status = 'NotAllowed';
    } else if (
      branchResponse.data.commit.sha === baseBranchResponse.data.commit.sha
    ) {
      publishMeta.status = 'NoChanges';
    } else {
      // Check for open pull requests for the branch.
      const prsResponse = await api.request('GET /repos/{owner}/{repo}/pulls', {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        state: 'open',
      });

      for (const pullRequest of prsResponse.data) {
        if (pullRequest.head.ref === fullBranch) {
          publishMeta.status = 'Pending';
          (publishMeta.urls as Array<UrlConfig>).push({
            url: pullRequest.html_url,
            label: 'Pull request',
            level: 'Private',
          });
          break;
        }
      }
    }

    return {
      branch: {
        name: branchResponse.data.name,
        commit: {
          hash: branchResponse.data.commit.sha,
          url: branchResponse.data.commit.html_url,
          author: {
            name: commitResponse.data.commit.author.name,
            email: commitResponse.data.commit.author.email,
          },
          timestamp: commitResponse.data.commit.author.date,
        },
        url: branchResponse.data._links.html,
      },
      name: shortenWorkspaceName(branchResponse.data.name || ''),
      publish: publishMeta,
    };
  }

  async getWorkspaces(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetWorkspacesRequest
  ): Promise<Array<WorkspaceData>> {
    const api = this.getApi(expressResponse);
    const owner = expressRequest.params.organization || request.org;
    const repo = expressRequest.params.project || request.repo;

    if (!owner || !repo) {
      throw new Error('Missing organization or repository');
    }

    const resultBranches: Array<WorkspaceData> = [];
    let hasMore = true;
    let page = 1;

    while (hasMore) {
      try {
        const branchesResponse = (
          await api.request('GET /repos/{owner}/{repo}/branches', {
            owner: owner,
            repo: repo,
            page: page,
            per_page: PER_PAGE,
          })
        ).data;

        // Branches response does not include the count so try the next
        // page if the number of results is maxed out.
        hasMore = PER_PAGE <= branchesResponse.length;
        page += 1;

        for (const branchInfo of branchesResponse) {
          if (!isWorkspaceBranch(branchInfo.name)) {
            continue;
          }

          resultBranches.push({
            branch: {
              name: branchInfo.name,
              commit: {
                hash: branchInfo.commit.sha,
                url: branchInfo.commit.url,
              },
            },
            name: shortenWorkspaceName(branchInfo.name || ''),
          });
        }
      } catch (err: any) {
        if (err.status && err.status === 404) {
          throw new ApiNotFoundError(
            'Unable to find workspaces from the GitHub api',
            {
              message: `Unable to retrieve the list of workspaces for ${repo}`,
              details: err.message,
            }
          );
        } else {
          throw err;
        }
      }
    }
    return resultBranches;
  }

  async readEditorConfig(
    expressRequest: express.Request,
    expressResponse: express.Response
  ): Promise<EditorFileSettings> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    let rawFile = null;
    try {
      rawFile = await storage.readFile('editor.yaml');
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        rawFile = Promise.resolve('');
      } else {
        throw error;
      }
    }
    return (yaml.load(rawFile) || {}) as EditorFileSettings;
  }

  async publish(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: PublishRequest
  ): Promise<PublishResult> {
    const api = this.getApi(expressResponse);
    const fullBranch = expandWorkspaceBranch(expressRequest.params.branch);

    // Find the default branch and use as a base for the publish.
    // Start the request before the sequential requests.
    const repoPromise = api.request('GET /repos/{owner}/{repo}', {
      owner: expressRequest.params.organization,
      repo: expressRequest.params.project,
    });

    const branchPromise = api.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        branch: fullBranch,
      }
    );

    // Check for already open pull request.
    const prsResponse = await api.request('GET /repos/{owner}/{repo}/pulls', {
      owner: expressRequest.params.organization,
      repo: expressRequest.params.project,
      state: 'open',
    });

    for (const pullRequest of prsResponse.data) {
      if (pullRequest.head.ref === fullBranch) {
        return {
          status: 'Pending',
          urls: [
            {
              url: pullRequest.html_url,
              label: 'Pull request',
              level: 'Private',
            },
          ],
        };
      }
    }

    // Find the default branch and use as a base for the publish.
    const repoResponse = await repoPromise;

    // Do not allow publishing to the default branch.
    if (fullBranch === repoResponse.data.default_branch) {
      return {
        status: 'NotAllowed',
      };
    }

    // Check for no changes between default and branch.
    const baseBranchResponse = await api.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        branch: repoResponse.data.default_branch,
      }
    );
    const branchResponse = await branchPromise;

    if (branchResponse.data.commit.sha === baseBranchResponse.data.commit.sha) {
      return {
        status: 'NoChanges',
      };
    }

    // Create a new pull request.
    const createPrResponse = await api.request(
      'POST /repos/{owner}/{repo}/pulls',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        title: `Publish ${expressRequest.params.branch} workspace.`,
        head: fullBranch,
        base: repoResponse.data.default_branch,
        body: `Please review and publish the ${expressRequest.params.branch} workspace.\n\nInitiated from editor.dev.`,
      }
    );

    return {
      status: 'Pending',
      urls: [
        {
          url: createPrResponse.data.html_url,
          label: 'Pull request',
          level: 'Private',
        },
      ],
    };
  }

  async saveFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: SaveFileRequest
  ): Promise<EditorFileData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    const api = this.getApi(expressResponse);
    const projectType = await this.getProjectType(storage);
    const projectTypeResult = await projectType.saveFile(
      expressRequest,
      request
    );

    // Add git history for file.
    return Object.assign({}, projectTypeResult, {
      history: await this.getFileHistory(
        api,
        expressRequest.params.organization,
        expressRequest.params.project,
        expandWorkspaceBranch(expressRequest.params.branch),
        request.file.file.path
      ),
      sha: await this.getFileSha(
        api,
        expressRequest.params.organization,
        expressRequest.params.project,
        expandWorkspaceBranch(expressRequest.params.branch),
        request.file.file.path
      ),
    });
  }

  async uploadFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: UploadFileRequest
  ): Promise<FileData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    return (await this.getProjectType(storage)).uploadFile(
      expressRequest,
      request
    );
  }
}
