import {EditorFileData, ProjectData} from '@blinkk/editor/dist/src/editor/api';
import {
  FilterComponent,
  IncludeExcludeFilter,
} from '@blinkk/editor/dist/src/utility/filter';
import {GetFileRequest, GetProjectRequest} from '../api/api';
import {ConnectorComponent} from './connector';
import {ConnectorStorage} from '../storage/storage';
import express from 'express';
import yaml from 'js-yaml';

/**
 * Connector for working with a Grow website.
 *
 * @see https://grow.dev
 */
export class GrowConnector implements ConnectorComponent {
  storage: ConnectorStorage;
  fileFilter?: FilterComponent;

  constructor(storage: ConnectorStorage) {
    this.storage = storage;

    // TODO: Make the file filter configurable for grow projects.
    this.fileFilter = new IncludeExcludeFilter({
      includes: [/^\/(content|static)/],
      excludes: [/\/[_.]/],
    });
  }

  static async canApply(storage: ConnectorStorage): Promise<boolean> {
    return storage.existsFile('podspec.yaml');
  }

  async getFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFileRequest
  ): Promise<EditorFileData> {
    return new Promise<EditorFileData>((resolve, reject) => {
      resolve({
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
      });
    });
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
}

export interface PodspecConfig {
  title: string;
}

//   async getWorkspace(): Promise<WorkspaceData> {
//     return new Promise<WorkspaceData>((resolve, reject) => {
//       resolve(currentWorkspace);
//     });
//   }

//   async getWorkspaces(): Promise<Array<WorkspaceData>> {
//     return new Promise<Array<WorkspaceData>>((resolve, reject) => {
//       resolve([...currentWorkspaces]);
//     });
//   }

//   async loadWorkspace(workspace: WorkspaceData): Promise<WorkspaceData> {
//     return new Promise<WorkspaceData>((resolve, reject) => {
//       currentWorkspace = workspace;
//       resolve(currentWorkspace);
//     });
//   }

//   async publish(
//     workspace: WorkspaceData,
//     data?: Record<string, any>
//   ): Promise<PublishResult> {
//     return new Promise<PublishResult>((resolve, reject) => {
//       const status: PublishStatus = PublishStatus.Complete;

//       resolve({
//         status: status,
//         workspace: currentWorkspace,
//       });
//     });
//   }

//   async saveFile(file: EditorFileData): Promise<EditorFileData> {
//     return new Promise<EditorFileData>((resolve, reject) => {
//       resolve(DEFAULT_EDITOR_FILE);
//     });
//   }

//   async uploadFile(file: File, meta?: Record<string, any>): Promise<FileData> {
//     return new Promise<FileData>((resolve, reject) => {
//       resolve({
//         path: '/static/img/portrait.png',
//         url: 'image-portrait.png',
//       } as FileData);
//     });
//   }
