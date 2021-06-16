import {
  ApiBaseComponent,
  GetStorage,
  addApiRoute,
  apiErrorHandler,
} from '../api';
import {
  EditorFileConfig,
  PartialData,
} from '@blinkk/editor.dev-ui/dist/src/editor/api';
import {
  ImportYaml,
  asyncYamlLoad,
  createImportSchema,
} from '../../utility/yamlSchemas';
import {FrontMatter} from '../../utility/frontMatter';
import express from 'express';
import path from 'path';
import yaml from 'js-yaml';

export class GrowApi implements ApiBaseComponent {
  protected _apiRouter?: express.Router;
  getStorage: GetStorage;

  constructor(getStorage: GetStorage) {
    this.getStorage = getStorage;
  }

  get apiRouter() {
    if (!this._apiRouter) {
      const router = express.Router({
        mergeParams: true,
      });
      router.use(express.json());

      addApiRoute(router, '/partials.get', this.getPartials.bind(this));
      addApiRoute(router, '/strings.get', this.getStrings.bind(this));

      // Error handler needs to be last.
      router.use(apiErrorHandler);

      this._apiRouter = router;
    }

    return this._apiRouter;
  }

  async getPartials(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetPartialsRequest
  ): Promise<Record<string, PartialData>> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    const importSchema = createImportSchema(storage);
    const partials: Record<string, PartialData> = {};
    const viewFiles = await storage.readDir('/views/partials/');

    const partialInfos: Array<PendingPartialInfo> = [];
    for (const viewFile of viewFiles) {
      partialInfos.push({
        partial: path.basename(viewFile.path).split('.')[0],
        promise: storage.readFile(viewFile.path),
      });
    }

    // Read the editor config from each view file, if available.
    for (const partialInfo of partialInfos) {
      const rawViewFile = await partialInfo.promise;
      const splitParts = FrontMatter.split(rawViewFile);
      if (splitParts.frontMatter) {
        let fields = yaml.load(splitParts.frontMatter as string, {
          schema: importSchema,
        }) as Record<string, any>;

        // Async yaml operations (like file loading) cannot be done natively in
        // js-yaml, instead uses placeholders that can handle the async operations
        // to resolve the value.
        fields = await asyncYamlLoad(fields, importSchema, [ImportYaml]);

        if (fields.editor) {
          partials[partialInfo.partial] = {
            partial: partialInfo.partial,
            editor: fields.editor as EditorFileConfig,
          };
        } else {
          partials[partialInfo.partial] = {
            partial: partialInfo.partial,
          };
        }
      } else {
        partials[partialInfo.partial] = {
          partial: partialInfo.partial,
        };
      }
    }

    return partials;
  }

  async getStrings(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetStringsRequest
  ): Promise<Record<string, any>> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    const importSchema = createImportSchema(storage);
    const strings: Record<string, any> = {};
    const podFiles = await storage.readDir('/content/strings/');

    const stringInfos: Array<PendingStringsInfo> = [];
    for (const podFile of podFiles) {
      stringInfos.push({
        podPath: podFile.path,
        promise: storage.readFile(podFile.path),
      });
    }

    // Read the editor config from each view file, if available.
    for (const stringInfo of stringInfos) {
      const rawStringsFile = await stringInfo.promise;
      const fields = yaml.load(rawStringsFile as string, {
        schema: importSchema,
      }) as Record<string, any>;

      // Async yaml operations (like file loading) cannot be done natively in
      // js-yaml, instead uses placeholders that can handle the async operations
      // to resolve the value.
      strings[stringInfo.podPath] = await asyncYamlLoad(fields, importSchema, [
        ImportYaml,
      ]);
    }

    return strings;
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetPartialsRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetStringsRequest {}

interface PendingPartialInfo {
  partial: string;
  promise: Promise<any>;
}

interface PendingStringsInfo {
  podPath: string;
  promise: Promise<any>;
}
