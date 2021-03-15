import {
  EditorFileData,
  FileData,
  ProjectData,
} from '@blinkk/editor/dist/src/editor/api';
import {
  GetFileRequest,
  GetProjectRequest,
  SaveFileRequest,
  UploadFileRequest,
} from '../api/api';
import {ConnectorStorage} from '../storage/storage';
import {FilterComponent} from '@blinkk/editor/dist/src/utility/filter';
import express from 'express';

export interface ConnectorComponent {
  fileFilter?: FilterComponent;

  getFile(
    expressRequest: express.Request,
    request: GetFileRequest
  ): Promise<EditorFileData>;

  getProject(
    expressRequest: express.Request,
    request: GetProjectRequest
  ): Promise<ProjectData>;

  saveFile(
    expressRequest: express.Request,
    request: SaveFileRequest
  ): Promise<EditorFileData>;

  uploadFile(
    expressRequest: express.Request,
    request: UploadFileRequest
  ): Promise<FileData>;
}

export interface ConnectorConstructor {
  new (storage: ConnectorStorage): ConnectorComponent;
}
