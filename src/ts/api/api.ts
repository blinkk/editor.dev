import {
  ApiError,
  DeviceData,
  EditorFileData,
  EmptyData,
  FileData,
  ProjectData,
  PublishResult,
  WorkspaceData,
} from '@blinkk/editor.dev-ui/dist/editor/api';
import {ErrorReporting} from '@google-cloud/error-reporting';
import {ProjectTypeStorageComponent} from '../storage/storage';
import express from 'express';

const MODE = process.env.MODE || 'dev';

const errorReporting = new ErrorReporting({
  reportMode: MODE === 'prod' ? 'always' : 'never',
});

export interface ApiBaseComponent {
  apiRouter: express.Router;
}

export interface ApiComponent extends ApiBaseComponent {
  copyFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: CopyFileRequest
  ): Promise<FileData>;

  createFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: CreateFileRequest
  ): Promise<FileData>;

  createWorkspace(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: CreateWorkspaceRequest
  ): Promise<WorkspaceData>;

  deleteFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: DeleteFileRequest
  ): Promise<EmptyData>;

  getDevices(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: GetDevicesRequest
  ): Promise<Array<DeviceData>>;

  getFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: GetFileRequest
  ): Promise<EditorFileData>;

  getFiles(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: GetFilesRequest
  ): Promise<Array<FileData>>;

  getProject(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: GetProjectRequest
  ): Promise<ProjectData>;

  getWorkspace(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: GetWorkspaceRequest
  ): Promise<WorkspaceData>;

  getWorkspaces(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: GetWorkspacesRequest
  ): Promise<Array<WorkspaceData>>;

  publish(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: PublishRequest
  ): Promise<PublishResult>;

  saveFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: SaveFileRequest
  ): Promise<EditorFileData>;

  uploadFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: UploadFileRequest
  ): Promise<FileData>;
}

/**
 * Method for retrieving the storage component.
 *
 * Different services require different ways to manage the storage component.
 * To keep things consistent, allow the service to determine the best way
 * to retrieve the service component.
 */
export type GetStorage = (
  expressRequest: express.Request,
  expressResponse: express.Response
) => Promise<ProjectTypeStorageComponent>;

export interface CopyFileRequest {
  originalPath: string;
  path: string;
}

export interface CreateFileRequest {
  path: string;
  content?: string;
}

export interface CreateWorkspaceRequest {
  base: WorkspaceData;
  workspace: string;
}

export interface DeleteFileRequest {
  file: FileData;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetDevicesRequest {}

export interface GetFileRequest {
  file: FileData;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetFilesRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetProjectRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetWorkspaceRequest {}

export interface GetWorkspacesRequest {
  org?: string;
  repo?: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PingRequest {}

export interface PublishRequest {
  workspace: WorkspaceData;
  data?: Record<string, any>;
}

export interface SaveFileRequest {
  file: EditorFileData;
  isRawEdit: boolean;
}

export interface UploadFileRequest {
  file: File;
  options?: Record<string, any>;
}

export class GenericApiError extends Error {
  apiError: ApiError;

  constructor(message: string, apiError: ApiError) {
    super(message);
    this.name = 'ApiError';
    this.apiError = apiError;
    this.stack = (<any>new Error()).stack;
  }
}

/**
 * Shortcut for adding an api route to the router with error handling
 * to keep the api result in a consistent format.
 *
 * @param router Router for api.
 * @param route Route path for the endpoint.
 * @param apiMethod Method to handle the request.
 */
export function addApiRoute(
  router: express.Router,
  route: string,
  apiMethod: (
    req: express.Request,
    res: express.Response,
    request: any
  ) => Promise<any>
): void {
  router.post(route, (req, res) => {
    apiMethod(req, res, req.body)
      .then(response => res.json(response))
      .catch(err => apiErrorHandler(err, req, res));
  });
}

export function apiErrorHandler(
  err: any,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  req: express.Request,
  res: express.Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next?: express.NextFunction
) {
  // Cloud error reporting
  errorReporting.report(err);
  console.error(err);

  res.status(500);

  if (err.apiError) {
    // Handle as an GenericApiError response.
    res.json((err as GenericApiError).apiError);
  } else if (err.message && err.description) {
    // Handle as an ApiError response.
    res.json(err as ApiError);
  } else if (err.name === 'ApiError') {
    // Handle as an ApiError response.
    res.json((err as GenericApiError).apiError);
  } else {
    // Handle as a generic error.
    res.json({
      message: err.message || err,
    } as ApiError);
  }
}
