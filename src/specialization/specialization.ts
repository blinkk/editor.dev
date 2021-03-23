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
import {SpecializationStorageComponent} from '../storage/storage';
import {FilterComponent} from '@blinkk/editor/dist/src/utility/filter';
import express from 'express';

export interface SpecializationComponent {
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

export interface SpecializationConstructor {
  new (storage: SpecializationStorageComponent): SpecializationComponent;
}
