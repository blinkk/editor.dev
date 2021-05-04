import {
  ANY_SCHEMA,
  ImportYaml,
  UnknownTag,
  asyncYamlLoad,
  createImportSchema,
} from './yamlSchemas';
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

test('async load yaml', async t => {
  t.plan(3);
  const storage = new MemoryStorage();
  storage.writeFile('/other.yaml', 'baz: 42');
  const schema = createImportSchema(storage);
  const source = `foo: bar
remote: !g.yaml /other.yaml?baz`;

  const loadedYaml = yaml.load(source, {
    schema: schema,
  }) as any;

  t.is(loadedYaml.foo, 'bar');
  t.true(loadedYaml.remote instanceof ImportYaml);

  const loadedAsync = await asyncYamlLoad(loadedYaml, schema, [ImportYaml]);

  t.deepEqual(loadedAsync, {
    foo: 'bar',
    remote: 42,
  });
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
