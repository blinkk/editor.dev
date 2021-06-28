import {
  EditorFileData,
  FileData,
  ProjectData,
} from '@blinkk/editor.dev-ui/dist/editor/api';
import {
  GetFileRequest,
  GetProjectRequest,
  SaveFileRequest,
  UploadFileRequest,
} from '../api/api';
import {FilterComponent} from '@blinkk/editor.dev-ui/dist/utility/filter';
import {ProjectTypeStorageComponent} from '../storage/storage';
import express from 'express';

export interface ProjectTypeComponent {
  fileFilter?: FilterComponent;
  type: string;

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

export interface ProjectTypeConstructor {
  new (storage: ProjectTypeStorageComponent): ProjectTypeComponent;
}
