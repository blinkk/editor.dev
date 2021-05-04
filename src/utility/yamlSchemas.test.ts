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
  t.plan(4);
  const storage = new MemoryStorage();
  storage.writeFile('/other.yaml', 'baz: 42\nbar: 84');
  const schema = createImportSchema(storage);
  const source = `foo: bar
grow: !g.yaml /other.yaml?baz
amagaki: !pod.yaml /other.yaml?bar`;

  const loadedYaml = yaml.load(source, {
    schema: schema,
  }) as any;

  t.is(loadedYaml.foo, 'bar');
  t.true(loadedYaml.grow instanceof ImportYaml);
  t.true(loadedYaml.amagaki instanceof ImportYaml);

  const loadedAsync = await asyncYamlLoad(loadedYaml, schema, [ImportYaml]);

  t.deepEqual(loadedAsync, {
    foo: 'bar',
    grow: 42,
    amagaki: 84,
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
