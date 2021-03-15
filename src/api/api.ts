import {
  ApiError,
  DeviceData,
  FileData,
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

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetFilesRequest {}

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
