import {FileData, ProjectData} from '@blinkk/editor/dist/src/editor/api';
import {ConnectorStorage} from '../storage/storage';
import express from 'express';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetProjectRequest {}

export interface ConnectorComponent {
  getProject(
    expressRequest: express.Request,
    request: GetProjectRequest
  ): Promise<ProjectData>;
}

export interface ConnectorConstructor {
  new (storage: ConnectorStorage): ConnectorComponent;
}
