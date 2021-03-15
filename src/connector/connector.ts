import {EditorFileData, ProjectData} from '@blinkk/editor/dist/src/editor/api';
import {GetFileRequest, GetProjectRequest} from '../api/api';
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
}

export interface ConnectorConstructor {
  new (storage: ConnectorStorage): ConnectorComponent;
}
