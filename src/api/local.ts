import {
  ApiComponent,
  CopyFileRequest,
  CreateFileRequest,
  CreateWorkspaceRequest,
  DeleteFileRequest,
  GetDevicesRequest,
  GetFilesRequest,
  handleError,
} from './api';
import {
  DeviceData,
  EditorFileSettings,
  FileData,
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
      this._apiRouter = express.Router();
      this._apiRouter.use(express.json());

      // TODO: Use auth middleware for non-local apis.
      // this._apiRouter.use(...);

      this._apiRouter.post('/devices.get', (req, res) => {
        this.getDevices(req, req.body)
          .then(response => res.json(response))
          .catch(e => handleError(e, req, res));
      });

      this._apiRouter.post('/file.copy', (req, res) => {
        this.copyFile(req, req.body)
          .then(response => res.json(response))
          .catch(e => handleError(e, req, res));
      });

      this._apiRouter.post('/file.create', (req, res) => {
        this.createFile(req, req.body)
          .then(response => res.json(response))
          .catch(e => handleError(e, req, res));
      });

      this._apiRouter.post('/file.delete', (req, res) => {
        this.deleteFile(req, req.body)
          .then(response => res.json(response))
          .catch(e => handleError(e, req, res));
      });

      this._apiRouter.post('/files.get', (req, res) => {
        this.getFiles(req, req.body)
          .then(response => res.json(response))
          .catch(e => handleError(e, req, res));
      });

      this._apiRouter.post('/project.get', (req, res) => {
        this.getConnector()
          .then(connector => {
            connector
              .getProject(req, req.body)
              .then(response => {
                // TODO: Project publish settings.

                // Add the editor config data to the connector response.
                this.readEditorConfig().then(editorConfig => {
                  res.json(
                    Object.assign(
                      {},
                      {
                        site: editorConfig.site,
                        title: editorConfig.title,
                      },
                      response
                    )
                  );
                });
              })
              .catch(e => handleError(e, req, res));
          })
          .catch(e => handleError(e, req, res));
      });

      this._apiRouter.post('/workspace.create', (req, res) => {
        this.createWorkspace(req, req.body)
          .then(response => res.json(response))
          .catch(e => handleError(e, req, res));
      });
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
}
