import {ConnectorStorage} from '../storage/storage';
import {FilterComponent} from '@blinkk/editor/dist/src/utility/filter';
import {ProjectData} from '@blinkk/editor/dist/src/editor/api';
import express from 'express';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetProjectRequest {}

export interface ConnectorComponent {
  fileFilter?: FilterComponent;

  getProject(
    expressRequest: express.Request,
    request: GetProjectRequest
  ): Promise<ProjectData>;
}

export interface ConnectorConstructor {
  new (storage: ConnectorStorage): ConnectorComponent;
}
