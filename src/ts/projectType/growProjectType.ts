import {
  ANY_SCHEMA,
  ImportYaml,
  asyncYamlLoad,
  createCustomTypesSchema,
  createImportSchema,
} from '../utility/yamlSchemas';
import {
  EditorFileConfig,
  EditorFileData,
  FileData,
  ProjectData,
} from '@blinkk/editor.dev-ui/dist/editor/api';
import {
  FileNotFoundError,
  ProjectTypeStorageComponent,
} from '../storage/storage';
import {
  FilterComponent,
  IncludeExcludeFilter,
} from '@blinkk/editor.dev-ui/dist/utility/filter';
import {
  GetFileRequest,
  GetProjectRequest,
  SaveFileRequest,
  UploadFileRequest,
} from '../api/api';
import {
  ScalarYamlConstructor,
  YamlConvert,
  YamlTypeConstructor,
} from '../utility/yamlConvert';
import {DeepClean} from '@blinkk/editor.dev-ui/dist/utility/deepClean';
import {FrontMatter} from '../utility/frontMatter';
import {ProjectTypeComponent} from './projectType';
import {createPriorityKeySort} from '@blinkk/editor.dev-ui/dist/utility/prioritySort';
import express from 'express';
import path from 'path';
import yaml from 'js-yaml';

export const GROW_TYPE = 'Grow';
export const MIXED_FRONT_MATTER_EXTS = ['.md'];
export const ONLY_FRONT_MATTER_EXTS = ['.yaml', '.yml'];

class GrowDocumentConstructor extends ScalarYamlConstructor {}
class GrowStaticConstructor extends ScalarYamlConstructor {}

const CONFIG_FILE = '_editor.yaml';
const YAML_PRIORITY_KEYS = [
  '$path',
  '$localization',
  'partial',
  'title',
  'key',
  'id',
];
const YAML_TYPES: Record<string, YamlTypeConstructor> = {
  'g.doc': GrowDocumentConstructor,
  'g.static': GrowStaticConstructor,
};

const yamlCustomSchema = createCustomTypesSchema(YAML_TYPES);
const yamlKeySort = createPriorityKeySort(YAML_PRIORITY_KEYS);

interface DocumentParts {
  body?: string | null;
  fields?: Record<string, any>;
  frontMatter?: string | null;
}

const deepCleaner = new DeepClean({
  protectedKeyPatterns: [/\$path.*/],
  removeEmptyArrays: true,
  removeEmptyObjects: true,
  removeEmptyStrings: true,
  removeNulls: true,
  removeUndefineds: true,
});
const deepWalker = new YamlConvert(YAML_TYPES, {
  convertUnknown: true,
});

/**
 * Project type for working with a Grow website.
 *
 * @see https://grow.dev
 */
export class GrowProjectType implements ProjectTypeComponent {
  static async canApply(
    storage: ProjectTypeStorageComponent
  ): Promise<boolean> {
    return storage.existsFile('podspec.yaml');
  }

  storage: ProjectTypeStorageComponent;
  fileFilter?: FilterComponent;

  constructor(storage: ProjectTypeStorageComponent) {
    this.storage = storage;

    // TODO: Make the file filter configurable for grow projects.
    this.fileFilter = new IncludeExcludeFilter({
      excludes: [/\/[_.]/],
    });
  }

  async getEditorConfigForDirectory(
    directory: string
  ): Promise<EditorFileConfig | undefined> {
    if (!directory) {
      return undefined;
    }

    const importSchema = createImportSchema(this.storage);

    try {
      const configFileName = path.join(directory, CONFIG_FILE);
      const configFile = await this.storage.readFile(configFileName);
      const configData = yaml.load(configFile as string, {
        schema: importSchema,
      }) as EditorFileConfig;

      // Async yaml operations (like file loading) cannot be done natively in
      // js-yaml, instead uses placeholders that can handle the async operations
      // to resolve the value.
      return await asyncYamlLoad(configData, importSchema, [ImportYaml]);
    } catch (err) {
      if (err instanceof FileNotFoundError) {
        if (directory === '/') {
          return undefined;
        }
        return this.getEditorConfigForDirectory(path.dirname(directory));
      }
    }
    return undefined;
  }

  async getEditorConfigForFile(
    filePath: string,
    parts: DocumentParts
  ): Promise<EditorFileConfig | undefined> {
    if (parts.fields?.$editor) {
      // Reparse the fields to use the limited constructors.
      const importSchema = createImportSchema(this.storage);
      const configData = yaml.load(parts.frontMatter as string, {
        schema: importSchema,
      }) as EditorFileConfig;

      // Async yaml operations (like file loading) cannot be done natively in
      // js-yaml, instead uses placeholders that can handle the async operations
      // to resolve the value.
      return await asyncYamlLoad(configData, importSchema, [ImportYaml]);
    }

    // Look for the directory configuration.
    return this.getEditorConfigForDirectory(path.dirname(filePath));
  }

  async getFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    request: GetFileRequest
  ): Promise<EditorFileData> {
    const parts = await this.readAndSplitFile(request.file.path);
    return {
      content: parts.body || undefined,
      data: parts.fields,
      dataRaw: parts.frontMatter || undefined,
      file: {
        path: request.file.path,
      },
      editor: await this.getEditorConfigForFile(request.file.path, parts),
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
        schema: ANY_SCHEMA,
      }) as Record<string, any>;
    }
    return parts;
  }

  async readPodspecConfig(): Promise<PodspecConfig> {
    const rawFile = await this.storage.readFile('podspec.yaml');
    return yaml.load(rawFile, {
      schema: ANY_SCHEMA,
    }) as PodspecConfig;
  }

  async saveFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: SaveFileRequest
  ): Promise<EditorFileData> {
    if (request.isRawEdit) {
      const ext = path.extname(request.file.file.path);
      if (ONLY_FRONT_MATTER_EXTS.includes(ext)) {
        await this.storage.writeFile(
          request.file.file.path,
          request.file.dataRaw as string,
          request.file.sha
        );
      } else {
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
      }
    } else {
      const cleanedFields = deepCleaner.clean(request.file.data);

      // Convert the json into yaml constructors.
      const convertedFields = await deepWalker.convert(cleanedFields);

      await this.storage.writeFile(
        request.file.file.path,
        yaml.dump(convertedFields, {
          noArrayIndent: true,
          noCompatMode: true,
          schema: yamlCustomSchema,
          sortKeys: yamlKeySort,
        }),
        request.file.sha
      );
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
