import {
  ApiError,
  DeviceData,
  EditorFileData,
  FileData,
  ProjectData,
  PublishResult,
  WorkspaceData,
} from '@blinkk/editor/dist/src/editor/api';
import express from 'express';

export interface ApiComponent {
  apiRouter: express.Router;

  copyFile(
    expressRequest: express.Request,
    request: CopyFileRequest
  ): Promise<FileData>;

  createFile(
    expressRequest: express.Request,
    request: CreateFileRequest
  ): Promise<FileData>;

  createWorkspace(
    expressRequest: express.Request,
    request: CreateWorkspaceRequest
  ): Promise<WorkspaceData>;

  deleteFile(
    expressRequest: express.Request,
    request: DeleteFileRequest
  ): Promise<void>;

  getDevices(
    expressRequest: express.Request,
    request: GetDevicesRequest
  ): Promise<Array<DeviceData>>;

  getFile(
    expressRequest: express.Request,
    request: GetFileRequest
  ): Promise<EditorFileData>;

  getFiles(
    expressRequest: express.Request,
    request: GetFilesRequest
  ): Promise<Array<FileData>>;

  getProject(
    expressRequest: express.Request,
    request: GetProjectRequest
  ): Promise<ProjectData>;

  getWorkspace(
    expressRequest: express.Request,
    request: GetWorkspaceRequest
  ): Promise<WorkspaceData>;

  getWorkspaces(
    expressRequest: express.Request,
    request: GetWorkspacesRequest
  ): Promise<Array<WorkspaceData>>;

  publish(
    expressRequest: express.Request,
    request: PublishRequest
  ): Promise<PublishResult>;

  saveFile(
    expressRequest: express.Request,
    request: SaveFileRequest
  ): Promise<EditorFileData>;

  uploadFile(
    expressRequest: express.Request,
    request: UploadFileRequest
  ): Promise<FileData>;
}

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

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetWorkspacesRequest {}

export interface PublishRequest {
  workspace: WorkspaceData;
  data?: Record<string, any>;
}

export interface SaveFileRequest {
  file: EditorFileData;
}

export interface UploadFileRequest {
  file: File;
  meta: Record<string, any>;
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
  apiMethod: (req: express.Request, data: any) => Promise<any>
): void {
  router.post(route, (req, res) => {
    apiMethod(req, req.body)
      .then(response => res.json(response))
      .catch(err => {
        console.error(err);
        if (err.stack) {
          console.error(err.stack);
        }
        return res.status(500).json({
          message: err.toString(),
        } as ApiError);
      });
  });
}
