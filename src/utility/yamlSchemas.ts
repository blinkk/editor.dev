import {DeepObject} from '@blinkk/selective-edit/dist/src/utility/deepObject';
import {DeepWalk} from '@blinkk/editor/dist/src/utility/deepWalk';
import {ProjectTypeStorageComponent} from '../storage/storage';
import yaml from 'js-yaml';

type TagKinds = 'scalar' | 'sequence' | 'mapping';

interface yamlCacheInfo {
  filePromise?: Promise<any>;
  loadPromise?: Promise<any>;
  value?: DeepObject;
}

const deepWalker = new DeepWalk();

/**
 * Some yaml constructors (ex: `!g.yaml`) need to perform async
 * operations, such as reading files or calling apis. But the js-yaml
 * does not support async operations during the yaml loading. Instead
 * we need to put placeholder classes that can temporarily store
 * the information and post-load perform the async operations.
 */
export interface AsyncYamlTagComponent {
  /**
   * The async yaml tag needs to be resolved after the normal yaml
   * processing. The `resolve` allows for triggering the async
   * processing of the yaml constructor.
   *
   * The promise returned is stored in the `resolvePromise` property
   * and a followup walk of the object will await the promise to allow
   * for async starting of all of the async yaml tags.
   *
   * @param schema Yaml schema to use for any nested yaml documents.
   * @param asyncTagClasses Async tag classes to handle with the
   * async processing.
   */
  resolve(
    schema: yaml.Schema,
    asyncTagClasses: Array<AsyncYamlTagConstructor>
  ): Promise<any>;
  /**
   * The promise from the resolve is stored so that all async tag
   * operations can be started without having to do sync waiting for
   * the async operations to complete.
   */
  resolvePromise?: Promise<any>;
}

export interface AsyncYamlTagConstructor {
  new (...args: any[]): AsyncYamlTagComponent;
}

/**
 * Importing from related yaml file.
 *
 * Use the class to store the import information. Js-yaml does not allow
 * for using async methods, so we cannot wait for the storage to resolve
 * the yaml files and parse them when loading a yaml.
 *
 * Instead need to load with this class as a placeholder then walk the
 * parsed object to do the storage read and replace the value recursively.
 */
export class ImportYaml implements AsyncYamlTagComponent {
  rawPath: string;
  storage: ProjectTypeStorageComponent;
  cache: Record<string, yamlCacheInfo>;

  constructor(
    storage: ProjectTypeStorageComponent,
    path: string,
    cache: Record<string, yamlCacheInfo>
  ) {
    this.rawPath = path;
    this.storage = storage;
    this.cache = cache;
  }

  get deepPath() {
    return this.rawPath.split('?')[1] || '';
  }

  get path() {
    return this.rawPath.split('?')[0];
  }

  async loadData(
    schema: yaml.Schema,
    asyncTagClasses: Array<AsyncYamlTagConstructor>
  ): Promise<any> {
    const cached = this.cache[this.path];
    const importFile = await cached.loadPromise;
    const importData = yaml.load(importFile as string, {
      schema: schema,
    });
    cached.value = new DeepObject(
      await asyncYamlLoad(importData, schema, asyncTagClasses)
    );
    return cached.value;
  }

  async resolve(
    schema: yaml.Schema,
    asyncTagClasses: Array<AsyncYamlTagConstructor>
  ): Promise<any> {
    if (!this.cache[this.path]) {
      this.cache[this.path] = {};
    }
    const cached = this.cache[this.path];

    // If no file has been read, read in the file.
    if (cached.filePromise === undefined) {
      cached.filePromise = this.storage.readFile(this.path);
    }

    if (cached.value === undefined) {
      // If the file has not been yaml loaded, load the file.
      if (cached.loadPromise === undefined) {
        cached.loadPromise = this.loadData(schema, asyncTagClasses);
      }
      await cached.loadPromise;
    }
    if (!cached.value) {
      throw Error('Resolved data without a value.');
    }
    return cached.value.get(this.deepPath);
  }
}

/**
 * Placeholder for unknown yaml tags.
 *
 * Used for parsing unknown constructors for use in editing parsed raw yaml.
 */
export class UnknownTag {
  _type: string;
  _data: any;

  constructor(type: string, data: any) {
    this._type = type;
    this._data = data;
  }
}

const anyTags = ['scalar', 'sequence', 'mapping'].map(kind => {
  // First argument here is a prefix, so this type will handle anything starting with !
  return new yaml.Type('!', {
    kind: kind as TagKinds,
    multi: true,
    representName: function (object: any) {
      return object._type;
    },
    represent: function (object: any) {
      return object._data;
    },
    instanceOf: UnknownTag,
    construct: function (data: any, type?: string): any {
      return new UnknownTag(type as string, data);
    },
  });
});

export const ANY_SCHEMA = yaml.DEFAULT_SCHEMA.extend(anyTags);

/**
 * Create an import schema based off a storage object to allow access
 * to files based on the current storage.
 *
 * @param storage Storage object for accessing files.
 * @returns Yaml schema that can handle imports.
 */
export function createImportSchema(
  storage: ProjectTypeStorageComponent
): yaml.Schema {
  const cache: Record<string, yamlCacheInfo> = {};
  const importTags: Array<yaml.Type> = [
    new yaml.Type('!pod.yaml', {
      kind: 'scalar',
      construct: function (data: any): any {
        return new ImportYaml(storage, data, cache);
      },
    }),
    new yaml.Type('!g.yaml', {
      kind: 'scalar',
      construct: function (data: any): any {
        return new ImportYaml(storage, data, cache);
      },
    }),
  ];

  return yaml.DEFAULT_SCHEMA.extend([...importTags, ...anyTags]);
}

/**
 * When loading yaml that requires async operations need to
 * use a placeholder for the data that is async.
 *
 * This function looks for those placeholders and calls the
 * `resolve` method to correctly finish loading the yaml
 * by performing the async operations and replacing the value.
 */
export async function asyncYamlLoad(
  data: any,
  schema: yaml.Schema,
  asyncTagClasses: Array<AsyncYamlTagConstructor>
): Promise<any> {
  // Walk the data looking for instances of the async tag placeholders.
  // First walk starts the async resolve but does not wait for the
  // promise to resolve before continuing. This allows the async functions
  // to be run in tandem.
  data = await deepWalker.walk(data, async (value: any) => {
    for (const asyncTagClass of asyncTagClasses) {
      if (value instanceof asyncTagClass) {
        value.resolvePromise = value.resolve(schema, asyncTagClasses);
        return value;
      }
    }
    return value;
  });

  // Second walk waits for the promises to resolve and replaces the value.
  return deepWalker.walk(data, async (value: any) => {
    for (const asyncTagClass of asyncTagClasses) {
      if (value instanceof asyncTagClass) {
        return await value.resolvePromise;
      }
    }
    return value;
  });
}
