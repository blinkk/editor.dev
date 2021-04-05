import {ANY_SCHEMA, UnknownTag} from './yamlSchemas';
import test from 'ava';
import yaml from 'js-yaml';

test('any schema parses unknown tags', t => {
  t.deepEqual(
    yaml.load('test: !something foo', {
      schema: ANY_SCHEMA,
    }),
    {
      test: new UnknownTag('!something', 'foo'),
    }
  );
});
