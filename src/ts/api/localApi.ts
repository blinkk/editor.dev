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
  PingRequest,
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
  EditorPreviewSettings,
  EmptyData,
  FileData,
  PingResult,
  ProjectData,
  PublishResult,
  RepoCommit,
  WorkspaceData,
} from '@blinkk/editor.dev-ui/dist/editor/api';
import {
  FileNotFoundError,
  ProjectTypeStorageComponent,
} from '../storage/storage';
import {
  GitignoreFilter,
  GlobFilter,
} from '@blinkk/editor.dev-ui/dist/utility/filter';

import {AmagakiApi} from './projectType/amagakiApi';
import {AmagakiProjectType} from '../projectType/amagakiProjectType';
import {FeatureFlags} from '@blinkk/editor.dev-ui/dist/editor/features';
import {GrowApi} from './projectType/growApi';
import {GrowProjectType} from '../projectType/growProjectType';
import {ProjectTypeComponent} from '../projectType/projectType';
import {ReadCommitResult} from 'isomorphic-git';
import {StorageManager} from '../storage/storage';
import express from 'express';
// TODO: FS promises does not work with isomorphic-git?
import fs from 'fs';
import git from 'isomorphic-git';
import {shortenWorkspaceName} from '@blinkk/editor.dev-ui/dist/editor/workspace';
import yaml from 'js-yaml';

export interface LocalApiOptions {
  preview?: EditorPreviewSettings;
}

export class LocalApi implements ApiComponent {
  options?: LocalApiOptions;
  storageManager: StorageManager;
  protected _apiRouter?: express.Router;

  constructor(storageManager: StorageManager, options?: LocalApiOptions) {
    this.storageManager = storageManager;
    this.options = options;
  }

  get apiRouter() {
    if (!this._apiRouter) {
      const router = express.Router();
      router.use(express.json({limit: '5mb'}));

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
      addApiRoute(router, '/ping', this.ping.bind(this));

      // Add project type specific routes.
      const amagakiApi = new AmagakiApi(this.getStorage.bind(this));
      router.use('/amagaki', amagakiApi.apiRouter);
      const growApi = new GrowApi(this.getStorage.bind(this));
      router.use('/grow', growApi.apiRouter);

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
    const storage = await this.getStorage(expressRequest, expressResponse);
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
    expressResponse: express.Response,
    request: CreateFileRequest
  ): Promise<FileData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    await storage.writeFile(request.path, request.content || '');
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
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: DeleteFileRequest
  ): Promise<EmptyData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    await storage.deleteFile(request.file.path);
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
    storage: ProjectTypeStorageComponent,
    filePath: string,
    depth = 10
  ): Promise<Array<ReadCommitResult>> {
    // Remove preceding slash.
    filePath = filePath.replace(/^\/*/, '');

    const commits = await git.log({
      fs: fs,
      dir: storage.root,
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
          dir: storage.root,
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

  async getDevices(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetDevicesRequest
  ): Promise<Array<DeviceData>> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    const editorConfig = (await this.readEditorConfig(
      storage
    )) as EditorFileSettings;
    return Promise.resolve(editorConfig.devices || []);
  }

  async getFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: GetFileRequest
  ): Promise<EditorFileData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    const projectType = await this.getProjectType(storage);
    const projectTypeResult = await projectType.getFile(
      expressRequest,
      request
    );

    const history = await this.fileHistory(storage, request.file.path);
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
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFilesRequest
  ): Promise<Array<FileData>> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    const projectType = await this.getProjectType(storage);
    const files = await storage.readDir('/');
    let filteredFiles = files;

    // Globally ignored files.
    const ignoreFilter = new GlobFilter({
      negate: true,
      patterns: ['/.git/**', '**/.*', '**/_*'],
    });
    filteredFiles = filteredFiles.filter(file =>
      ignoreFilter.matches(file.path)
    );

    // Check for project type specific filtering.
    if (projectType.fileFilter) {
      filteredFiles = filteredFiles.filter(file =>
        projectType.fileFilter?.matches(file.path)
      );
    }

    // Ignore files that are in .gitignore.
    try {
      const gitIgnoreFile = await storage.readFile('.gitignore');
      const ignorePatterns = gitIgnoreFile
        .split(/\r?\n/)
        .filter((value: string) => {
          value = value.trim();
          if (value.startsWith('#')) {
            return false;
          }
          if (value.length === 0) {
            return false;
          }
          return true;
        });

      const gitIgnoreFilter = new GitignoreFilter({
        patterns: ignorePatterns,
      });

      filteredFiles = filteredFiles.filter(file =>
        gitIgnoreFilter.matches(file.path)
      );
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        // pass.
      } else {
        throw error;
      }
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
    expressResponse: express.Response,
    request: GetProjectRequest
  ): Promise<ProjectData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    const projectType = await this.getProjectType(storage);
    const projectTypeResult = await projectType.getProject(
      expressRequest,
      request
    );
    const editorConfig = await this.readEditorConfig(storage);
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

    // Check for overrides, such as from CLI.
    const overrides: Record<string, any> = {
      type: projectType.type,
      source: {
        identifier: 'local',
        label: 'Local',
        source: 'Local',
      },
    };

    if (this.options?.preview) {
      overrides.preview = this.options.preview;
    }

    // ProjectType config take precedence over editor config.
    return Object.assign(
      {
        title: storage.root,
      },
      editorConfig,
      projectTypeResult,
      overrides
    );
  }

  async getStorage(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response
  ): Promise<ProjectTypeStorageComponent> {
    return this.storageManager.storageForPath();
  }

  async getWorkspace(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetWorkspaceRequest
  ): Promise<WorkspaceData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
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
      name: shortenWorkspaceName(currentBranch || ''),
    };
  }

  async getWorkspaces(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetWorkspacesRequest
  ): Promise<Array<WorkspaceData>> {
    const storage = await this.getStorage(expressRequest, expressResponse);
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
        name: shortenWorkspaceName(currentBranch || ''),
      },
    ];
  }

  async ping(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: PingRequest
  ): Promise<PingResult> {
    return {
      status: 'Ok',
    };
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

  async readEditorConfig(
    storage: ProjectTypeStorageComponent
  ): Promise<EditorFileSettings> {
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

  async saveFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: SaveFileRequest
  ): Promise<EditorFileData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    return (await this.getProjectType(storage)).saveFile(
      expressRequest,
      request
    );
  }

  async uploadFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: UploadFileRequest
  ): Promise<FileData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    return (await this.getProjectType(storage)).uploadFile(
      expressRequest,
      request
    );
  }
}
