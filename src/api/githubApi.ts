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
import {ConnectorStorageComponent, StorageManager} from '../storage/storage';
import {
  DeviceData,
  EditorFileData,
  EditorFileSettings,
  EmptyData,
  FileData,
  ProjectData,
  PublishResult,
  RepoCommit,
  WorkspaceData,
} from '@blinkk/editor/dist/src/editor/api';
import {ConnectorComponent} from '../connector/connector';
import {GrowConnector} from '../connector/growConnector';
import {Octokit} from '@octokit/core';
import express from 'express';
import {githubAuthMiddleware} from '../auth/githubAuth';
import yaml from 'js-yaml';

const DEFAULT_AUTHOR_NAME = 'editor.dev';
const DEFAULT_AUTHOR_EMAIL = 'hello@blinkk.com';

export class GithubApi implements ApiComponent {
  protected _connector?: ConnectorComponent;
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
          url: newBranchResponse.data.commit.url,
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

  async getConnector(
    expressRequest: express.Request,
    expressResponse: express.Response
  ): Promise<ConnectorComponent> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    if (!this._connector) {
      // Check for specific features of the supported connectors.
      if (await GrowConnector.canApply(storage)) {
        this._connector = new GrowConnector(storage);
      } else {
        // TODO: use generic connector.
        throw new Error('Unable to determine connector.');
      }
    }

    return Promise.resolve(this._connector as ConnectorComponent);
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
    const connector = await this.getConnector(expressRequest, expressResponse);
    const connectorResult = await connector.getFile(expressRequest, request);

    // Add git history for file.
    return Object.assign({}, connectorResult, {
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
        url: commit.url,
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
    const api = this.getApi(expressResponse);

    const branchResponse = await api.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        branch: expandWorkspaceBranch(expressRequest.params.branch),
      }
    );

    // Find the tree for the the last commit on branch.
    const commitResponse = await api.request(
      'GET /repos/{owner}/{repo}/git/commits/{commitSha}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        commitSha: branchResponse.data.commit.sha,
      }
    );

    return await this.getFilesRecursive(
      api,
      expressRequest.params.organization,
      expressRequest.params.project,
      commitResponse.data.tree.sha
    );
  }

  protected async getFilesRecursive(
    api: Octokit,
    owner: string,
    repo: string,
    treeSha: string,
    root?: string
  ): Promise<Array<FileData>> {
    root = root || '';
    const treeResponse = await api.request(
      'GET /repos/{owner}/{repo}/git/trees/{treeSha}',
      {
        owner: owner,
        repo: repo,
        treeSha: treeSha,
      }
    );

    let files: Array<FileData> = [];
    const folderPromises: Array<Promise<any>> = [];

    for (const treeObj of treeResponse.data.tree) {
      if (treeObj.type === 'blob') {
        files.push({
          path: `${root}/${treeObj.path}`,
        });
      } else if (treeObj.type === 'tree') {
        // Collect the promises so they can be done async.
        folderPromises.push(
          this.getFilesRecursive(
            api,
            owner,
            repo,
            treeObj.sha,
            `${root}/${treeObj.path}`
          )
        );
      }
    }

    // Wait for all of the sub folder promises before adding to files.
    const subFolderResults = await Promise.all(folderPromises);
    for (const subFolderResult of subFolderResults) {
      files = [...files, ...subFolderResult];
    }

    return files;
  }

  async getProject(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: GetProjectRequest
  ): Promise<ProjectData> {
    const connector = await this.getConnector(expressRequest, expressResponse);
    const connectorResult = await connector.getProject(expressRequest, request);
    const editorConfig = await this.readEditorConfig(
      expressRequest,
      expressResponse
    );
    connectorResult.experiments = connectorResult.experiments || {};
    connectorResult.features = connectorResult.features || {};

    // Pull in editor configuration for experiments.
    if (editorConfig.experiments) {
      connectorResult.experiments = Object.assign(
        {},
        editorConfig.experiments,
        connectorResult.experiments
      );
    }

    // Pull in editor configuration for features.
    if (editorConfig.features) {
      connectorResult.features = Object.assign(
        {},
        editorConfig.features,
        connectorResult.features
      );
    }

    // Connector config take precedence over editor config.
    return Object.assign(
      {},
      {
        site: editorConfig.site,
        title: editorConfig.title,
      },
      connectorResult
    );
  }

  async getStorage(
    expressRequest: express.Request,
    expressResponse: express.Response
  ): Promise<ConnectorStorageComponent> {
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
    const branchResponse = await api.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        branch: expandWorkspaceBranch(expressRequest.params.branch),
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

    return {
      branch: {
        name: branchResponse.data.name,
        commit: {
          hash: branchResponse.data.commit.sha,
          url: branchResponse.data.commit.url,
          author: {
            name: commitResponse.data.commit.author.name,
            email: commitResponse.data.commit.author.email,
          },
          timestamp: commitResponse.data.commit.author.date,
        },
      },
      name: shortenWorkspaceName(branchResponse.data.name || ''),
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
      if (error.code === 'ENOENT') {
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
    // TODO: Publish process.
    throw new Error('Publish workflow not available for local.');
  }

  async saveFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: SaveFileRequest
  ): Promise<EditorFileData> {
    return (await this.getConnector(expressRequest, expressResponse)).saveFile(
      expressRequest,
      request
    );
  }

  async uploadFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: UploadFileRequest
  ): Promise<FileData> {
    return (
      await this.getConnector(expressRequest, expressResponse)
    ).uploadFile(expressRequest, request);
  }
}
