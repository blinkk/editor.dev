import {
  DeepWalk,
  DeepWalkConfig,
  TransformFunction,
} from '@blinkk/editor/dist/src/utility/deepWalk';

export interface JsonYamlTypeStructure {
  _type: string;
  _data: any;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface YamlTypeComponent {
  /**
   * Controls how the yaml dumper represents the value in the yaml.
   */
  represent(): any;
}

export interface YamlTypeConstructor {
  new (type: string, value: any): YamlTypeComponent;
}

class YamlConvertDeepWalk extends DeepWalk {
  constructorMap: Record<string, YamlTypeConstructor>;

  constructor(
    config?: DeepWalkConfig,
    constructorMap?: Record<string, YamlTypeConstructor>
  ) {
    super(config);
    this.constructorMap = constructorMap || {};
  }

  protected async walkRecord(
    originalValue: Record<string, any>,
    transformValue: TransformFunction
  ): Promise<Record<string, any>> {
    originalValue = (originalValue as unknown) as JsonYamlTypeStructure;
    if (
      originalValue._type !== undefined &&
      originalValue._data !== undefined &&
      originalValue._type in this.constructorMap
    ) {
      console.log(
        'Converting.',
        new this.constructorMap[originalValue._type](
          originalValue._type,
          originalValue._data
        )
      );

      return new this.constructorMap[originalValue._type](
        originalValue._type,
        originalValue._data
      );
    }

    // Fallback to the normal record walking.
    return await super.walkRecord(originalValue, transformValue);
  }
}

/**
 * Convert objects from the editor into JS objects that correspond to
 * the yaml schema objects.
 */
export class YamlConvert {
  constructorMap: Record<string, YamlTypeConstructor>;
  deepWalker: YamlConvertDeepWalk;

  constructor(constructorMap: Record<string, YamlTypeConstructor>) {
    this.constructorMap = constructorMap;
    this.deepWalker = new YamlConvertDeepWalk({}, this.constructorMap);
  }

  async convert(data: any): Promise<any> {
    return await this.deepWalker.walk(data, async (value: any) => value);
  }
}

export class ScalarYamlConstructor implements YamlTypeComponent {
  type: string;
  data: any;

  constructor(type: string, data: any) {
    this.type = type;
    this.data = data;
  }

  static kind(): string {
    return 'scalar';
  }

  represent() {
    return this.data;
  }
}

export class SequenceYamlConstructor
  extends ScalarYamlConstructor
  implements YamlTypeComponent {
  static kind(): string {
    return 'sequence';
  }
}

export class MappingYamlConstructor
  extends ScalarYamlConstructor
  implements YamlTypeComponent {
  static kind(): string {
    return 'mapping';
  }
}
