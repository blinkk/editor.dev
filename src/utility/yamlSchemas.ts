import {DeepObject} from '@blinkk/selective-edit/dist/src/utility/deepObject';
import {DeepWalk} from '@blinkk/editor/dist/src/utility/deepWalk';
import {ProjectTypeStorageComponent} from '../storage/storage';
import yaml from 'js-yaml';

type TagKinds = 'scalar' | 'sequence' | 'mapping';

const deepWalker = new DeepWalk();

export interface AsyncYamlTagComponent {
  resolve(
    schema: yaml.Schema,
    asyncTagClasses: Array<AsyncYamlTagConstructor>
  ): Promise<any>;
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

  constructor(storage: ProjectTypeStorageComponent, path: string) {
    this.rawPath = path;
    this.storage = storage;
  }

  get deepPath() {
    return this.rawPath.split('?')[1] || '';
  }

  get path() {
    return this.rawPath.split('?')[0];
  }

  async resolve(
    schema: yaml.Schema,
    asyncTagClasses: Array<AsyncYamlTagConstructor>
  ): Promise<any> {
    const importFile = await this.storage.readFile(this.path);
    let importData = yaml.load(importFile as string, {
      schema: schema,
    });
    importData = await asyncYamlLoad(importData, schema, asyncTagClasses);
    const deepImportData = new DeepObject(importData as any);
    return deepImportData.get(this.deepPath);
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

export function createImportSchema(
  storage: ProjectTypeStorageComponent
): yaml.Schema {
  const importTags: Array<yaml.Type> = [
    new yaml.Type('!a.yaml', {
      kind: 'scalar',
      construct: function (data: any): any {
        return new ImportYaml(storage, data);
      },
    }),
    new yaml.Type('!g.yaml', {
      kind: 'scalar',
      construct: function (data: any): any {
        return new ImportYaml(storage, data);
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
  // TODO: Figure out a way to do all tags async since the await would make
  // it a syncronous to process.

  // Walk the data looking for instances of the async tag placeholders
  // with the replaced async values.
  return deepWalker.walk(data, async (value: any) => {
    for (const asyncTagClass of asyncTagClasses) {
      if (value instanceof asyncTagClass) {
        return await value.resolve(schema, asyncTagClasses);
      }
    }
    return value;
  });
}
