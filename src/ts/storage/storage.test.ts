import {StorageManager, cleanDirectory, expandPath} from './storage';
import {MemoryStorage} from './memoryStorage';
import test from 'ava';

test('storage manager storage for path', t => {
  const manager = new StorageManager({
    rootDir: '/',
    storageCls: MemoryStorage,
  });

  t.true(manager.storageForPath() instanceof MemoryStorage);
});

test('storage manager storage for service', t => {
  const manager = new StorageManager({
    rootDir: '/',
    storageCls: MemoryStorage,
  });

  const storage = manager.storageForBranch('org', 'project', 'branch');

  t.true(storage instanceof MemoryStorage);
  t.is(storage.root, '/org/project/branch/');
});

test('clean directory', t => {
  t.is(cleanDirectory(''), '');
  t.is(cleanDirectory('foo'), 'foo');
  t.throws(() => {
    cleanDirectory('/foo');
  });
  t.throws(() => {
    cleanDirectory('../foo');
  });
});

test('expand path', t => {
  t.is(expandPath('/dir/root/', '/path.yaml'), '/dir/root/path.yaml');
  t.is(expandPath('/dir/root/', 'path.yaml'), '/dir/root/path.yaml');
  t.is(expandPath('/dir/root', '/path.yaml'), '/dir/root/path.yaml');
  t.is(
    expandPath('/dir/root/', '/sub/dir/path.yaml'),
    '/dir/root/sub/dir/path.yaml'
  );
  t.throws(() => {
    expandPath('/dir/root/', '/../../path.yaml');
  });
});
