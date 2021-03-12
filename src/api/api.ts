import {
  ApiError,
  DeviceData,
  WorkspaceData,
} from '@blinkk/editor/dist/src/editor/api';
import {ConnectorStorage} from '../storage/storage';
import express from 'express';

export interface ApiComponent {
  apiRouter: express.Router;
  storage: ConnectorStorage;

  createWorkspace(
    expressRequest: express.Request,
    request: CreateWorkspaceRequest
  ): Promise<WorkspaceData>;

  getDevices(
    expressRequest: express.Request,
    request: GetDevicesRequest
  ): Promise<Array<DeviceData>>;
}

export interface CreateWorkspaceRequest {
  base: WorkspaceData;
  workspace: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetDevicesRequest {}

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

export const DEFAULT_DEVICES = [
  {
    label: 'Mobile',
    width: 411,
    height: 731,
    canRotate: true,
  } as DeviceData,
  {
    label: 'Tablet',
    width: 1024,
    height: 768,
    canRotate: true,
  } as DeviceData,
  {
    label: 'Desktop',
    width: 1440,
  } as DeviceData,
];
