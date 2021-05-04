import {ANY_SCHEMA, ImportYaml, UnknownTag} from './yamlSchemas';
import {MemoryStorage} from '../storage/memoryStorage';
import test from 'ava';
import yaml from 'js-yaml';

test('import yaml functionality', t => {
  const importYaml = new ImportYaml(
    new MemoryStorage(),
    '/foo/bar.yaml?baz',
    {}
  );

  t.is(importYaml.rawPath, '/foo/bar.yaml?baz');
  t.is(importYaml.deepPath, 'baz');
  t.is(importYaml.path, '/foo/bar.yaml');
});

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
