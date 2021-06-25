import {FileNotFoundError} from './storage';
import {MemoryStorage} from './memoryStorage';
import test from 'ava';

test('storage operations', async t => {
  t.plan(6);
  const storage = new MemoryStorage();

  t.false(await storage.existsFile('/foo.yaml'));
  await storage.writeFile('/foo.yaml', 'bar: baz\n');
  t.true(await storage.existsFile('/foo.yaml'));
  t.is(await storage.readFile('/foo.yaml'), 'bar: baz\n');
  await storage.deleteFile('/foo.yaml');
  t.false(await storage.existsFile('/foo.yaml'));

  await t.throwsAsync(
    async () => {
      await storage.readFile('/foo.yaml');
    },
    {
      instanceOf: FileNotFoundError,
    }
  );

  await t.throwsAsync(async () => {
    await storage.readDir('/');
  });
});
