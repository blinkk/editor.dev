import {
  ApiError,
  DeviceData,
  EditorFileData,
  FileData,
  ProjectData,
  WorkspaceData,
} from '@blinkk/editor/dist/src/editor/api';
import {ConnectorStorage} from '../storage/storage';
import express from 'express';

export interface ApiComponent {
  apiRouter: express.Router;
  storage: ConnectorStorage;

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

export function handleError(
  err: Error,
  req: express.Request,
  res: express.Response
) {
  console.error(err);
  if (err.stack) {
    console.error(err.stack);
  }
  return res.status(500).json({
    message: err.toString(),
  } as ApiError);
}
