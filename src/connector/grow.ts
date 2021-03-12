import {ConnectorComponent, GetProjectRequest} from './connector';
import {ConnectorStorage} from '../storage/storage';
import {ProjectData} from '@blinkk/editor/dist/src/editor/api';
import express from 'express';
import yaml from 'js-yaml';

export class GrowConnector implements ConnectorComponent {
  storage: ConnectorStorage;

  constructor(storage: ConnectorStorage) {
    this.storage = storage;
  }

  static async canApply(storage: ConnectorStorage): Promise<boolean> {
    return storage.exists('podspec.yaml');
  }

  async getProject(
    expressRequest: express.Request,
    request: GetProjectRequest
  ): Promise<ProjectData> {
    const podspec = (await this.readPodspec()) as PodspecConfig;
    return {
      title: podspec.title,
    } as ProjectData;
  }

  async readPodspec() {
    const rawPodspec = await this.storage.read('podspec.yaml');
    return yaml.load(rawPodspec);
  }
}

export interface PodspecConfig {
  title: string;
}
