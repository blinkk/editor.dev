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
} from './api';
import {ConnectorStorage, StorageManager} from '../storage/storage';
import {
  DeviceData,
  EditorFileData,
  EditorFileSettings,
  FileData,
  ProjectData,
  PublishResult,
  RepoCommit,
  WorkspaceData,
} from '@blinkk/editor/dist/src/editor/api';
import {ConnectorComponent} from '../connector/connector';
import {FeatureFlags} from '@blinkk/editor/dist/src/editor/features';
import {GrowConnector} from '../connector/grow';
import {ReadCommitResult} from 'isomorphic-git';
import express from 'express';
// TODO: FS promises does not work with isomorphic-git?
import fs from 'fs';
import git from 'isomorphic-git';
import yaml from 'js-yaml';

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

      // TODO: Use auth middleware for non-local apis.
      // router.use(...);

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

      this._apiRouter = router;
    }

    return this._apiRouter;
  }

  async copyFile(
    expressRequest: express.Request,
    request: CopyFileRequest
  ): Promise<FileData> {
    const storage = await this.getStorage(expressRequest);
    await storage.writeFile(
      request.path,
      await storage.readFile(request.originalPath)
    );
    return {
      path: request.path,
    };
  }

  async createFile(
    expressRequest: express.Request,
    request: CreateFileRequest
  ): Promise<FileData> {
    const storage = await this.getStorage(expressRequest);
    await storage.writeFile(request.path, request.content || '');
    return {
      path: request.path,
    };
  }

  async createWorkspace(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: CreateWorkspaceRequest
  ): Promise<WorkspaceData> {
    throw new Error('Unable to create new workspace locally.');
  }

  async deleteFile(
    expressRequest: express.Request,
    request: DeleteFileRequest
  ): Promise<void> {
    const storage = await this.getStorage(expressRequest);
    return storage.deleteFile(request.file.path);
  }

  /**
   * Retrieve the commits that have the file by looking through all commits.
   *
   * Not the best performance.
   *
   * @see https://isomorphic-git.org/docs/en/snippets#git-log-path-to-file
   *
   * @param filePath File path to
   * @param depth
   * @returns Array of commits that match the file.
   */
  async fileHistory(
    repoDir: string,
    filePath: string,
    depth = 10
  ): Promise<Array<ReadCommitResult>> {
    // Remove preceding slash.
    filePath = filePath.replace(/^\/*/, '');

    const commits = await git.log({
      fs: fs,
      dir: repoDir,
    });
    let lastSHA = null;
    let lastCommit = null;
    const commitsThatMatter: Array<ReadCommitResult> = [];
    for (const commit of commits) {
      if (commitsThatMatter.length >= depth) {
        break;
      }

      try {
        const o = await git.readObject({
          fs: fs,
          dir: repoDir,
          oid: commit.oid,
          filepath: filePath,
        });
        if (o.oid !== lastSHA) {
          if (lastSHA !== null) {
            commitsThatMatter.push(lastCommit as ReadCommitResult);
          }
          lastSHA = o.oid;
        }
      } catch (err) {
        // File no longer there.
        if (lastCommit !== null) {
          commitsThatMatter.push(lastCommit as ReadCommitResult);
        }
        break;
      }
      lastCommit = commit;
    }
    return commitsThatMatter;
  }

  async getConnector(
    expressRequest: express.Request
  ): Promise<ConnectorComponent> {
    const storage = await this.getStorage(expressRequest);
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetDevicesRequest
  ): Promise<Array<DeviceData>> {
    const editorConfig = (await this.readEditorConfig(
      expressRequest
    )) as EditorFileSettings;
    return Promise.resolve(editorConfig.devices || []);
  }

  async getFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFileRequest
  ): Promise<EditorFileData> {
    const storage = await this.getStorage(expressRequest);
    const connector = await this.getConnector(expressRequest);
    const connectorResult = await connector.getFile(expressRequest, request);

    const history = await this.fileHistory(storage.root, request.file.path);
    const commitHistory: Array<RepoCommit> = [];
    for (const commit of history) {
      commitHistory.push({
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
        },
        hash: commit.oid,
        summary: commit.commit.message,
        timestamp: new Date(
          // TODO: Use commit.commit.author.timezoneOffset ?
          commit.commit.author.timestamp * 1000
        ).toISOString(),
      });
    }

    // TODO: Pull the git history for the file to enrich the connector result.
    return Object.assign({}, connectorResult, {
      history: commitHistory,
    });
  }

  async getFiles(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFilesRequest
  ): Promise<Array<FileData>> {
    const storage = await this.getStorage(expressRequest);
    const connector = await this.getConnector(expressRequest);
    const files = await storage.readDir('/');
    let filteredFiles = files;
    if (connector.fileFilter) {
      filteredFiles = files.filter(file =>
        connector.fileFilter?.matches(file.path)
      );
    } else {
      // TODO: Default file filter for api.
    }

    // Convert to the correct FileDate interface.
    const responseFiles: Array<FileData> = [];
    for (const file of filteredFiles) {
      responseFiles.push({
        path: file.path,
      });
    }
    return responseFiles;
  }

  async getProject(
    expressRequest: express.Request,
    request: GetProjectRequest
  ): Promise<ProjectData> {
    const connector = await this.getConnector(expressRequest);
    const connectorResult = await connector.getProject(expressRequest, request);
    const editorConfig = await this.readEditorConfig(expressRequest);
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

    // Local api does not currently allow creating workspaces.
    connectorResult.features[FeatureFlags.WorkspaceCreate] = false;

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

  async getStorage(expressRequest: express.Request): Promise<ConnectorStorage> {
    return this.storageManager.storageForBranch(
      expressRequest.params.organization,
      expressRequest.params.project,
      expressRequest.params.branch
    );
  }

  async getWorkspace(
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetWorkspaceRequest
  ): Promise<WorkspaceData> {
    const storage = await this.getStorage(expressRequest);
    const currentBranch = await git.currentBranch({
      fs: fs,
      dir: storage.root,
    });

    const commits = await git.log({
      fs: fs,
      dir: storage.root,
      depth: 1,
    });

    const commit = commits[0];

    return {
      branch: {
        name: currentBranch || '',
        commit: {
          author: {
            name: commit.commit.author.name,
            email: commit.commit.author.email,
          },
          hash: commit.oid,
          summary: commit.commit.message,
          timestamp: new Date(
            // TODO: Use commit.commit.author.timezoneOffset ?
            commit.commit.author.timestamp * 1000
          ).toISOString(),
        },
      },
      name: (currentBranch || '').replace(/^workspace\//, ''),
    };
  }

  async getWorkspaces(
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetWorkspacesRequest
  ): Promise<Array<WorkspaceData>> {
    const storage = await this.getStorage(expressRequest);

    // Only list the current branch as a workspace for local.
    const currentBranch = await git.currentBranch({
      fs: fs,
      dir: storage.root,
    });

    const commits = await git.log({
      fs: fs,
      dir: storage.root,
      depth: 1,
    });

    const commit = commits[0];

    return [
      {
        branch: {
          name: currentBranch || '',
          commit: {
            author: {
              name: commit.commit.author.name,
              email: commit.commit.author.email,
            },
            hash: commit.oid,
            summary: commit.commit.message,
            timestamp: new Date(
              // TODO: Use commit.commit.author.timezoneOffset ?
              commit.commit.author.timestamp * 1000
            ).toISOString(),
          },
        },
        name: (currentBranch || '').replace(/^workspace\//, ''),
      },
    ];
  }

  async readEditorConfig(
    expressRequest: express.Request
  ): Promise<EditorFileSettings> {
    const storage = await this.getStorage(expressRequest);
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
    request: PublishRequest
  ): Promise<PublishResult> {
    // TODO: Publish process.
    throw new Error('Publish workflow not available for local.');
  }

  async saveFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: SaveFileRequest
  ): Promise<EditorFileData> {
    return (await this.getConnector(expressRequest)).saveFile(
      expressRequest,
      request
    );
  }

  async uploadFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: UploadFileRequest
  ): Promise<FileData> {
    return (await this.getConnector(expressRequest)).uploadFile(
      expressRequest,
      request
    );
  }
}
