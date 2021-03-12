import {FileData, ProjectData} from '@blinkk/editor/dist/src/editor/api';
import {ConnectorStorage} from '../storage/storage';
import express from 'express';

export interface CopyFileRequest {
  originalPath: string;
  path: string;
}

export interface CreateFileRequest {
  path: string;
  content?: string;
}

export interface DeleteFileRequest {
  file: FileData;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetProjectRequest {}

export interface ConnectorComponent {
  copyFile(
    expressRequest: express.Request,
    request: CopyFileRequest
  ): Promise<FileData>;

  createFile(
    expressRequest: express.Request,
    request: CreateFileRequest
  ): Promise<FileData>;

  deleteFile(
    expressRequest: express.Request,
    request: DeleteFileRequest
  ): Promise<void>;

  getProject(
    expressRequest: express.Request,
    request: GetProjectRequest
  ): Promise<ProjectData>;
}

export interface ConnectorConstructor {
  new (storage: ConnectorStorage): ConnectorComponent;
}
