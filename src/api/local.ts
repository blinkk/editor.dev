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
import {
  DeviceData,
  EditorFileData,
  EditorFileSettings,
  FileData,
  ProjectData,
  PublishResult,
  WorkspaceData,
} from '@blinkk/editor/dist/src/editor/api';
import {ConnectorComponent} from '../connector/connector';
import {ConnectorStorage} from '../storage/storage';
import {GrowConnector} from '../connector/grow';
import express from 'express';
import yaml from 'js-yaml';

export class LocalApi implements ApiComponent {
  protected _connector?: ConnectorComponent;
  protected _apiRouter?: express.Router;
  storage: ConnectorStorage;

  constructor(storage: ConnectorStorage) {
    this.storage = storage;
  }

  get apiRouter() {
    if (!this._apiRouter) {
      const router = express.Router();
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
    await this.storage.writeFile(
      request.path,
      await this.storage.readFile(request.originalPath)
    );
    return {
      path: request.path,
    };
  }

  async createFile(
    expressRequest: express.Request,
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
    request: CreateWorkspaceRequest
  ): Promise<WorkspaceData> {
    throw new Error('Unable to create new workspace locally.');
  }

  async deleteFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    request: DeleteFileRequest
  ): Promise<void> {
    return this.storage.deleteFile(request.file.path);
  }

  async getConnector(): Promise<ConnectorComponent> {
    if (!this._connector) {
      // Check for specific features of the supported connectors.
      if (await GrowConnector.canApply(this.storage)) {
        this._connector = new GrowConnector(this.storage);
      } else {
        // TODO: use generic connector.
        throw new Error('Unable to determine connector.');
      }
    }

    return Promise.resolve(this._connector as ConnectorComponent);
  }

  async getDevices(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetDevicesRequest
  ): Promise<Array<DeviceData>> {
    const editorConfig = (await this.readEditorConfig()) as EditorFileSettings;
    return Promise.resolve(editorConfig.devices || []);
  }

  async getFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFileRequest
  ): Promise<EditorFileData> {
    const connector = await this.getConnector();
    const connectorResult = await connector.getFile(expressRequest, request);

    // TODO: Pull the git history for the file to enrich the connector result.
    return Object.assign({}, connectorResult, {
      history: [
        {
          author: {
            name: 'Example User',
            email: 'example@example.com',
          },
          hash: 'db29a258dacdd416bb24bb63c689d669df08d409',
          summary: 'Example commit summary.',
          timestamp: new Date(
            new Date().getTime() - 1 * 60 * 60 * 1000
          ).toISOString(),
        },
        {
          author: {
            name: 'Example User',
            email: 'example@example.com',
          },
          hash: 'f36d7c0d556e30421a7a8f22038234a9174f0e04',
          summary: 'Example commit summary.',
          timestamp: new Date(
            new Date().getTime() - 2 * 60 * 60 * 1000
          ).toISOString(),
        },
        {
          author: {
            name: 'Example User',
            email: 'example@example.com',
          },
          hash: '6dda2682901bf4f2f03f936267169454120f1806',
          summary:
            'Example commit summary. With a long summary. Like really too long for a summary. Probably should use a shorter summary.',
          timestamp: new Date(
            new Date().getTime() - 4 * 60 * 60 * 1000
          ).toISOString(),
        },
        {
          author: {
            name: 'Example User',
            email: 'example@example.com',
          },
          hash: '465e3720c050f045d9500bd9bc7c7920f192db78',
          summary: 'Example commit summary.',
          timestamp: new Date(
            new Date().getTime() - 14 * 60 * 60 * 1000
          ).toISOString(),
        },
      ],
    });
  }

  async getFiles(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFilesRequest
  ): Promise<Array<FileData>> {
    const connector = await this.getConnector();
    const files = await this.storage.readDir('/');
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetProjectRequest
  ): Promise<ProjectData> {
    const connector = await this.getConnector();
    const connectorResult = await connector.getProject(expressRequest, request);
    const editorConfig = await this.readEditorConfig();
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

  async getWorkspace(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetWorkspaceRequest
  ): Promise<WorkspaceData> {
    // TODO: Read workspace information from git.
    return {
      branch: {
        name: 'main',
        commit: {
          author: {
            name: 'Example User',
            email: 'example@example.com',
          },
          hash: '951c206e5f10ba99d13259293b349e321e4a6a9e',
          summary: 'Example commit summary.',
          timestamp: new Date().toISOString(),
        },
      },
      name: 'main',
    };
  }

  async getWorkspaces(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetWorkspacesRequest
  ): Promise<Array<WorkspaceData>> {
    // TODO: Read workspace information from git.
    return [
      {
        branch: {
          name: 'main',
          commit: {
            author: {
              name: 'Example User',
              email: 'example@example.com',
            },
            hash: '951c206e5f10ba99d13259293b349e321e4a6a9e',
            summary: 'Example commit summary.',
            timestamp: new Date().toISOString(),
          },
        },
        name: 'main',
      },
    ];
  }

  async readEditorConfig(): Promise<EditorFileSettings> {
    let rawFile = null;
    try {
      rawFile = await this.storage.readFile('editor.yaml');
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
    return (await this.getConnector()).saveFile(expressRequest, request);
  }

  async uploadFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: UploadFileRequest
  ): Promise<FileData> {
    return (await this.getConnector()).uploadFile(expressRequest, request);
  }
}
