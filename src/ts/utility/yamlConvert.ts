import {
  DeepWalk,
  DeepWalkConfig,
  TransformFunction,
} from '@blinkk/editor.dev-ui/dist/utility/deepWalk';

import {DataType} from '@blinkk/selective-edit/dist/utility/dataType';

export interface JsonYamlTypeStructure {
  _type: string;
  _data: any;
}

export interface YamlTypeComponent {
  /**
   * Controls how the yaml dumper represents the value in the yaml.
   */
  represent(): any;
  type: string;
}

export interface YamlTypeConstructor {
  new (type: string, value: any): YamlTypeComponent;
}

class YamlConvertDeepWalk extends DeepWalk {
  options?: YamlConvertOptions;
  constructorMap: Record<string, YamlTypeConstructor>;

  constructor(
    config?: DeepWalkConfig,
    constructorMap?: Record<string, YamlTypeConstructor>,
    options?: YamlConvertOptions
  ) {
    super(config);
    this.constructorMap = constructorMap || {};
    this.options = options;
  }

  protected async walkRecord(
    originalValue: Record<string, any>,
    transformValue: TransformFunction
  ): Promise<Record<string, any>> {
    originalValue = originalValue as unknown as JsonYamlTypeStructure;
    if (originalValue._type !== undefined) {
      if (originalValue._type in this.constructorMap) {
        return new this.constructorMap[originalValue._type](
          originalValue._type,
          originalValue._data
        );
      }

      // Only convert the unknown types when asked to do so.
      if (this.options?.convertUnknown) {
        if (DataType.isObject(originalValue._data)) {
          return new MappingYamlConstructor(
            originalValue._type,
            originalValue._data
          );
        } else if (DataType.isArray(originalValue._data)) {
          return new SequenceYamlConstructor(
            originalValue._type,
            originalValue._data
          );
        }
        return new ScalarYamlConstructor(
          originalValue._type,
          originalValue._data || ''
        );
      }
    }

    // Fallback to the normal record walking.
    return await super.walkRecord(originalValue, transformValue);
  }
}

export interface YamlConvertOptions {
  convertUnknown?: boolean;
}

/**
 * Convert objects from the editor into JS objects that correspond to
 * the yaml schema objects.
 */
export class YamlConvert {
  constructorMap: Record<string, YamlTypeConstructor>;
  deepWalker: YamlConvertDeepWalk;

  constructor(
    constructorMap: Record<string, YamlTypeConstructor>,
    options?: YamlConvertOptions
  ) {
    this.constructorMap = constructorMap;
    this.deepWalker = new YamlConvertDeepWalk({}, this.constructorMap, options);
  }

  async convert(data: any): Promise<any> {
    return await this.deepWalker.walk(data, async (value: any) => value);
  }
}

export class ScalarYamlConstructor implements YamlTypeComponent {
  static kind(): string {
    return 'scalar';
  }

  type: string;
  data: any;

  constructor(type: string, data: any) {
    this.type = type;
    this.data = data;
  }

  represent() {
    return this.data;
  }
}

export class SequenceYamlConstructor
  extends ScalarYamlConstructor
  implements YamlTypeComponent
{
  static kind(): string {
    return 'sequence';
  }
}

export class MappingYamlConstructor
  extends ScalarYamlConstructor
  implements YamlTypeComponent
{
  static kind(): string {
    return 'mapping';
  }
}
