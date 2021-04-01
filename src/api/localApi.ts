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
  WorkspaceData,
} from '@blinkk/editor/dist/src/editor/api';
import {FeatureFlags} from '@blinkk/editor/dist/src/editor/features';
import {GrowProjectType} from '../projectType/growProjectType';
import {LocalStorage} from '../storage/localStorage';
import {ProjectTypeComponent} from '../projectType/projectType';
import {ReadCommitResult} from 'isomorphic-git';
import express from 'express';
// TODO: FS promises does not work with isomorphic-git?
import fs from 'fs';
import git from 'isomorphic-git';
import yaml from 'js-yaml';
import {FileNotFoundError} from '../storage/storage';

export class LocalApi implements ApiComponent {
  protected _projectType?: ProjectTypeComponent;
  protected _apiRouter?: express.Router;
  storage: LocalStorage;

  constructor(storage: LocalStorage) {
    this.storage = storage;
  }

  get apiRouter() {
    if (!this._apiRouter) {
      const router = express.Router();
      router.use(express.json());

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

      router.use(apiErrorHandler);

      this._apiRouter = router;
    }

    return this._apiRouter;
  }

  async copyFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    request: CopyFileRequest
  ): Promise<FileData> {
    await this.storage.writeFile(
      request.path,
      await this.storage.readFile(request.originalPath)
    );
    return {
      path: request.path,
    };
  }

  async createFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    request: CreateFileRequest
  ): Promise<FileData> {
    await this.storage.writeFile(request.path, request.content || '');
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
    throw new Error('Unable to create new workspace locally.');
  }

  async deleteFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: DeleteFileRequest
  ): Promise<EmptyData> {
    await this.storage.deleteFile(request.file.path);
    return {};
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
    filePath: string,
    depth = 10
  ): Promise<Array<ReadCommitResult>> {
    // Remove preceding slash.
    filePath = filePath.replace(/^\/*/, '');

    const commits = await git.log({
      fs: fs,
      dir: this.storage.root,
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
          dir: this.storage.root,
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

  async getProjectType(): Promise<ProjectTypeComponent> {
    if (!this._projectType) {
      // Check for specific features of the supported projectTypes.
      if (await GrowProjectType.canApply(this.storage)) {
        this._projectType = new GrowProjectType(this.storage);
      } else {
        // TODO: use generic projectType.
        throw new Error('Unable to determine projectType.');
      }
    }

    return Promise.resolve(this._projectType as ProjectTypeComponent);
  }

  async getDevices(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetDevicesRequest
  ): Promise<Array<DeviceData>> {
    const editorConfig = (await this.readEditorConfig()) as EditorFileSettings;
    return Promise.resolve(editorConfig.devices || []);
  }

  async getFile(
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    request: GetFileRequest
  ): Promise<EditorFileData> {
    const projectType = await this.getProjectType();
    const projectTypeResult = await projectType.getFile(
      expressRequest,
      request
    );

    const history = await this.fileHistory(request.file.path);
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

    // TODO: Pull the git history for the file to enrich the projectType result.
    return Object.assign({}, projectTypeResult, {
      history: commitHistory,
    });
  }

  async getFiles(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFilesRequest
  ): Promise<Array<FileData>> {
    const projectType = await this.getProjectType();
    const files = await this.storage.readDir('/');
    let filteredFiles = files;
    if (projectType.fileFilter) {
      filteredFiles = files.filter(file =>
        projectType.fileFilter?.matches(file.path)
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    request: GetProjectRequest
  ): Promise<ProjectData> {
    const projectType = await this.getProjectType();
    const projectTypeResult = await projectType.getProject(
      expressRequest,
      request
    );
    const editorConfig = await this.readEditorConfig();
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

    // Local api does not currently allow creating workspaces.
    projectTypeResult.features[FeatureFlags.WorkspaceCreate] = false;

    // ProjectType config take precedence over editor config.
    return Object.assign(
      {},
      {
        site: editorConfig.site,
        projectType: projectType.type,
        title: editorConfig.title,
      },
      projectTypeResult
    );
  }

  async getWorkspace(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetWorkspaceRequest
  ): Promise<WorkspaceData> {
    const currentBranch = await git.currentBranch({
      fs: fs,
      dir: this.storage.root,
    });

    const commits = await git.log({
      fs: fs,
      dir: this.storage.root,
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
      name: shortenWorkspaceName(currentBranch || ''),
    };
  }

  async getWorkspaces(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetWorkspacesRequest
  ): Promise<Array<WorkspaceData>> {
    // Only list the current branch as a workspace for local.
    const currentBranch = await git.currentBranch({
      fs: fs,
      dir: this.storage.root,
    });

    const commits = await git.log({
      fs: fs,
      dir: this.storage.root,
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
        name: shortenWorkspaceName(currentBranch || ''),
      },
    ];
  }

  async readEditorConfig(): Promise<EditorFileSettings> {
    let rawFile = null;
    try {
      rawFile = await this.storage.readFile('editor.yaml');
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
    // TODO: Publish process.
    throw new Error('Publish workflow not available for local.');
  }

  async saveFile(
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    request: SaveFileRequest
  ): Promise<EditorFileData> {
    return (await this.getProjectType()).saveFile(expressRequest, request);
  }

  async uploadFile(
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    request: UploadFileRequest
  ): Promise<FileData> {
    return (await this.getProjectType()).uploadFile(expressRequest, request);
  }
}
