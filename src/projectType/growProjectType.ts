import {
  EditorFileConfig,
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
import {FrontMatter} from '../utility/frontMatter';
import {ProjectTypeComponent} from './projectType';
import {ProjectTypeStorageComponent} from '../storage/storage';
import express, {response} from 'express';
import path from 'path';
import yaml from 'js-yaml';

export const GROW_TYPE = 'grow';
export const MIXED_FRONT_MATTER_EXTS = ['md'];
export const ONLY_FRONT_MATTER_EXTS = ['yaml', 'yml'];

interface DocumentParts {
  body?: string | null;
  fields?: Record<string, any>;
  frontMatter?: string | null;
}

/**
 * Project type for working with a Grow website.
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
    let editorConfig: EditorFileConfig | undefined = undefined;
    const parts = await this.readAndSplitFile(request.file.path);

    if (parts.fields?.$editor) {
      editorConfig = parts.fields.$editor;
    }

    // TODO: Find the editor config from the collection.

    return {
      content: parts.body || undefined,
      data: parts.fields,
      dataRaw: parts.frontMatter || undefined,
      file: {
        path: request.file.path,
      },
      editor: editorConfig,
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

  async readAndSplitFile(filePath: string): Promise<DocumentParts> {
    const rawFile = await this.storage.readFile(filePath);
    const ext = path.extname(filePath);
    const parts: DocumentParts = {
      body: null,
      frontMatter: null,
    };
    if (MIXED_FRONT_MATTER_EXTS.includes(ext)) {
      const splitParts = FrontMatter.split(rawFile);
      parts.body = splitParts.body;
      parts.frontMatter = splitParts.frontMatter;
    } else if (ONLY_FRONT_MATTER_EXTS.includes(ext)) {
      parts.frontMatter = rawFile;
    } else {
      parts.body = rawFile;
    }

    if (parts.frontMatter) {
      parts.fields = yaml.load(parts.frontMatter as string, {
        schema: yaml.FAILSAFE_SCHEMA,
      }) as Record<string, any>;
    }
    return parts;
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
    if (request.isRawEdit) {
      const combinedContents = FrontMatter.combine(
        {
          frontMatter: request.file.dataRaw,
          body: request.file.content,
        },
        {
          trailingNewline: true,
        }
      );
      await this.storage.writeFile(
        request.file.file.path,
        combinedContents,
        request.file.sha
      );
    } else {
      // TODO: Convert json into correct yaml constructors.
    }

    return this.getFile(expressRequest, {
      file: request.file.file,
    });
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
