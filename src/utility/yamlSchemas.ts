import yaml from 'js-yaml';

type TagKinds = 'scalar' | 'sequence' | 'mapping';

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
      return object.type;
    },
    represent: function (object: any) {
      return object.data;
    },
    instanceOf: UnknownTag,
    construct: function (data: any, type?: string): any {
      return new UnknownTag(type as string, data);
    },
  });
});

export const ANY_SCHEMA = yaml.DEFAULT_SCHEMA.extend(anyTags);
