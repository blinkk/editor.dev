import {
  JsonYamlTypeStructure,
  MappingYamlConstructor,
  ScalarYamlConstructor,
  SequenceYamlConstructor,
  YamlConvert,
  YamlTypeComponent,
} from './yamlConvert';
import test from 'ava';

test('convert from json format to object', async t => {
  const converter = new YamlConvert({
    test: TestYamlType,
  });
  const from: JsonYamlTypeStructure = {
    _type: 'test',
    _data: 'foo',
  };
  const expected = new TestYamlType('test', 'foo');
  const actual = await converter.convert(from);
  t.true(actual instanceof TestYamlType);
  t.deepEqual(actual.value, expected.value);
});

test('ignore unknown type', async t => {
  const converter = new YamlConvert({});
  const from: JsonYamlTypeStructure = {
    _type: 'foo',
    _data: 'bar',
  };
  const expected = from;
  const actual = await converter.convert(from);
  t.deepEqual(actual, expected);
});

test('convert unknown type - scalar', async t => {
  const converter = new YamlConvert(
    {},
    {
      convertUnknown: true,
    }
  );
  const from: JsonYamlTypeStructure = {
    _type: 'foo',
    _data: 'bar',
  };
  const expected = new ScalarYamlConstructor('foo', 'bar');
  const actual = await converter.convert(from);
  t.deepEqual(actual, expected);
});

test('convert unknown type - mapping', async t => {
  const converter = new YamlConvert(
    {},
    {
      convertUnknown: true,
    }
  );
  const from: JsonYamlTypeStructure = {
    _type: 'foo',
    _data: {
      bar: 'foobar',
    },
  };
  const expected = new MappingYamlConstructor('foo', {
    bar: 'foobar',
  });
  const actual = await converter.convert(from);
  t.deepEqual(actual, expected);
});

test('convert unknown type - sequence', async t => {
  const converter = new YamlConvert(
    {},
    {
      convertUnknown: true,
    }
  );
  const from: JsonYamlTypeStructure = {
    _type: 'foo',
    _data: ['foobar'],
  };
  const expected = new SequenceYamlConstructor('foo', ['foobar']);
  const actual = await converter.convert(from);
  t.deepEqual(actual, expected);
});

test('class types', async t => {
  t.is(ScalarYamlConstructor.kind(), 'scalar');
  t.is(SequenceYamlConstructor.kind(), 'sequence');
  t.is(MappingYamlConstructor.kind(), 'mapping');
});

test('constructor functionality', async t => {
  const scalarConstructor = new ScalarYamlConstructor('test', 'foo');
  t.is(scalarConstructor.type, 'test');
  t.is(scalarConstructor.data, 'foo');
  t.is(scalarConstructor.represent(), 'foo');
});

class TestYamlType implements YamlTypeComponent {
  type: string;
  value: string;

  constructor(type: string, value: any) {
    this.type = type;
    this.value = value;
  }

  represent() {
    return this.value;
  }
}
