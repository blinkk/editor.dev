import {
  ApiComponent,
  CopyFileRequest,
  CreateFileRequest,
  CreateWorkspaceRequest,
  DeleteFileRequest,
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
  expandWorkspaceBranch,
  isWorkspaceBranch,
  shortenWorkspaceName,
} from './api';
import {
  DeviceData,
  EditorFileData,
  EditorFileSettings,
  EmptyData,
  FileData,
  ProjectData,
  PublishResult,
  RepoCommit,
  UrlConfig,
  WorkspaceData,
  WorkspacePublishConfig,
} from '@blinkk/editor/dist/src/editor/api';
import {
  FileNotFoundError,
  SpecializationStorageComponent,
  StorageManager,
} from '../storage/storage';
import {GrowSpecialization} from '../specialization/growSpecialization';
import {Octokit} from '@octokit/core';
import {SpecializationComponent} from '../specialization/specialization';
import express from 'express';
import {githubAuthMiddleware} from '../auth/githubAuth';
import yaml from 'js-yaml';

const DEFAULT_AUTHOR_NAME = 'editor.dev';
const DEFAULT_AUTHOR_EMAIL = 'hello@blinkk.com';

export class GithubApi implements ApiComponent {
  protected _specialization?: SpecializationComponent;
  protected _apiRouter?: express.Router;
  storageManager: StorageManager;

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
  }

  get apiRouter() {
    if (!this._apiRouter) {
      const router = express.Router({
        mergeParams: true,
      });
      router.use(express.json());

      // Use auth middleware for authenticating.
      router.use(githubAuthMiddleware);

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

      // Error handler needs to be last.
      router.use(apiErrorHandler);

      this._apiRouter = router;
    }

    return this._apiRouter;
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
        name: user.data.name || DEFAULT_AUTHOR_NAME,
        email: user.data.email || DEFAULT_AUTHOR_EMAIL,
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
      message: 'New file from editor.dev.',
      content: fileContents.toString('base64'),
      author: {
        name: user.data.name || DEFAULT_AUTHOR_NAME,
        email: user.data.email || DEFAULT_AUTHOR_EMAIL,
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
    const api = this.getApi(expressResponse);
    const remotePath = request.file.path.replace(/^\/*/, '');
    const user = await this.getUser(api);

    // Retrieve the existing file information.
    const fileResponse = await api.request(
      'GET /repos/{owner}/{repo}/contents/{path}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        path: remotePath,
        ref: expandWorkspaceBranch(expressRequest.params.branch),
      }
    );

    // Request for delete of the file.
    await api.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
      owner: expressRequest.params.organization,
      repo: expressRequest.params.project,
      message: 'Deleting file from editor.dev.',
      branch: expandWorkspaceBranch(expressRequest.params.branch),
      sha: (fileResponse.data as any).sha,
      path: remotePath,
      author: {
        name: user.data.name || DEFAULT_AUTHOR_NAME,
        email: user.data.email || DEFAULT_AUTHOR_EMAIL,
      },
    });

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
    const api = this.getApi(expressResponse);
    const specialization = await this.getSpecialization(
      expressRequest,
      expressResponse
    );
    const specializationResult = await specialization.getFile(
      expressRequest,
      request
    );

    // Add git history for file.
    return Object.assign({}, specializationResult, {
      history: await this.getFileHistory(
        api,
        expressRequest.params.organization,
        expressRequest.params.project,
        expressRequest.params.branch,
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

  async getFiles(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFilesRequest
  ): Promise<Array<FileData>> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    return (await storage.readDir('/')) as Array<FileData>;
  }

  async getProject(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: GetProjectRequest
  ): Promise<ProjectData> {
    const specialization = await this.getSpecialization(
      expressRequest,
      expressResponse
    );
    const specializationResult = await specialization.getProject(
      expressRequest,
      request
    );
    const editorConfig = await this.readEditorConfig(
      expressRequest,
      expressResponse
    );
    specializationResult.experiments = specializationResult.experiments || {};
    specializationResult.features = specializationResult.features || {};

    // Pull in editor configuration for experiments.
    if (editorConfig.experiments) {
      specializationResult.experiments = Object.assign(
        {},
        editorConfig.experiments,
        specializationResult.experiments
      );
    }

    // Pull in editor configuration for features.
    if (editorConfig.features) {
      specializationResult.features = Object.assign(
        {},
        editorConfig.features,
        specializationResult.features
      );
    }

    // Specialization config take precedence over editor config.
    return Object.assign(
      {},
      {
        site: editorConfig.site,
        specialization: specialization.type,
        title: editorConfig.title,
        publish: {
          fields: [],
        },
      },
      specializationResult
    );
  }

  async getSpecialization(
    expressRequest: express.Request,
    expressResponse: express.Response
  ): Promise<SpecializationComponent> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    if (!this._specialization) {
      // Check for specific features of the supported specializations.
      if (await GrowSpecialization.canApply(storage)) {
        this._specialization = new GrowSpecialization(storage);
      } else {
        // TODO: use generic specialization.
        throw new Error('Unable to determine specialization.');
      }
    }

    return Promise.resolve(this._specialization as SpecializationComponent);
  }

  async getStorage(
    expressRequest: express.Request,
    expressResponse: express.Response
  ): Promise<SpecializationStorageComponent> {
    return this.storageManager.storageForBranch(
      expressRequest.params.organization,
      expressRequest.params.project,
      expressRequest.params.branch,
      this.getApi(expressResponse),
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        branch: expandWorkspaceBranch(expressRequest.params.branch),
      }
    );
  }

  async getUser(api: Octokit) {
    return api.request('GET /user');
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
    const branchesResponse = await api.request(
      'GET /repos/{owner}/{repo}/branches',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
      }
    );
    const resultBranches: Array<WorkspaceData> = [];

    for (const branchInfo of branchesResponse.data) {
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
    return (
      await this.getSpecialization(expressRequest, expressResponse)
    ).saveFile(expressRequest, request);
  }

  async uploadFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: UploadFileRequest
  ): Promise<FileData> {
    return (
      await this.getSpecialization(expressRequest, expressResponse)
    ).uploadFile(expressRequest, request);
  }
}
