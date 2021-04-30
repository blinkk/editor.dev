import {
  JsonYamlTypeStructure,
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
