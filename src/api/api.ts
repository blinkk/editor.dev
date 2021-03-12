import {ApiError, WorkspaceData} from '@blinkk/editor/dist/src/editor/api';
import {ConnectorStorage} from '../storage/storage';
import express from 'express';

export interface ApiComponent {
  apiRouter: express.Router;
  storage: ConnectorStorage;

  createWorkspace(
    expressRequest: express.Request,
    request: CreateWorkspaceRequest
  ): Promise<WorkspaceData>;
}

export interface CreateWorkspaceRequest {
  base: WorkspaceData;
  workspace: string;
}

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
