import {
  EditorFileData,
  FileData,
  ProjectData,
} from '@blinkk/editor/dist/src/editor/api';
import {
  FilterComponent,
  IncludeExcludeFilter,
} from '@blinkk/editor/dist/src/utility/filter';
import {
  GetFileRequest,
  GetProjectRequest,
  SaveFileRequest,
  UploadFileRequest,
} from '../api/api';
import {ProjectTypeComponent} from './projectType';
import {ProjectTypeStorageComponent} from '../storage/storage';
import express from 'express';
import yaml from 'js-yaml';

export const GROW_TYPE = 'grow';

/**
 * ProjectType for working with a Grow website.
 *
 * @see https://grow.dev
 */
export class GrowProjectType implements ProjectTypeComponent {
  storage: ProjectTypeStorageComponent;
  fileFilter?: FilterComponent;

  constructor(storage: ProjectTypeStorageComponent) {
    this.storage = storage;

    // TODO: Make the file filter configurable for grow projects.
    this.fileFilter = new IncludeExcludeFilter({
      includes: [/^\/(content|static)/],
      excludes: [/\/[_.]/],
    });
  }

  static async canApply(
    storage: ProjectTypeStorageComponent
  ): Promise<boolean> {
    return storage.existsFile('podspec.yaml');
  }

  async getFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFileRequest
  ): Promise<EditorFileData> {
    return {
      content: 'Example content.',
      data: {
        title: 'Testing',
      },
      dataRaw: 'title: Testing',
      file: {
        path: '/content/pages/index.yaml',
      },
      editor: {
        fields: [
          {
            type: 'text',
            key: 'title',
            label: 'Title',
            validation: [
              {
                type: 'require',
                message: 'Title is required.',
              },
            ],
          },
          {
            type: 'text',
            key: 'desc',
            label: 'Title',
            validation: [
              {
                type: 'require',
                message: 'Title is required.',
              },
            ],
          },
        ],
      },
    };
  }

  async getProject(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetProjectRequest
  ): Promise<ProjectData> {
    const podspec = await this.readPodspecConfig();
    return {
      title: podspec.title,
    };
  }

  async readPodspecConfig(): Promise<PodspecConfig> {
    const rawFile = await this.storage.readFile('podspec.yaml');
    return yaml.load(rawFile) as PodspecConfig;
  }

  async saveFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: SaveFileRequest
  ): Promise<EditorFileData> {
    return {
      content: 'Example content.',
      data: {
        title: 'Testing',
      },
      dataRaw: 'title: Testing',
      file: {
        path: '/content/pages/index.yaml',
      },
      editor: {
        fields: [
          {
            type: 'text',
            key: 'title',
            label: 'Title',
            validation: [
              {
                type: 'require',
                message: 'Title is required.',
              },
            ],
          },
          {
            type: 'text',
            key: 'desc',
            label: 'Title',
            validation: [
              {
                type: 'require',
                message: 'Title is required.',
              },
            ],
          },
        ],
      },
    };
  }

  get type(): string {
    return GROW_TYPE;
  }

  async uploadFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: UploadFileRequest
  ): Promise<FileData> {
    return {
      path: '/unsupported',
    };
  }
}

export interface PodspecConfig {
  title: string;
}
