import {
  FileNotFoundError,
  ProjectTypeStorageComponent,
  expandPath,
} from './storage';
import {promises as fs, constants as fsConstants} from 'fs';

import {PromiseCache} from '../utility/promiseCache';
import path from 'path';

export class LocalStorage implements ProjectTypeStorageComponent {
  root: string;
  /**
   * Cache to store the promises for loading files.
   *
   * Normally the storage class is created with each request so the
   * cache is not long-lived and should be separate for each request.
   */
  cache: PromiseCache;

  constructor(root?: string) {
    this.root = path.resolve(root || process.cwd());
    this.cache = new PromiseCache();
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = expandPath(this.root, filePath);
    await fs.rm(fullPath);
  }

  async existsFile(filePath: string): Promise<boolean> {
    const fullPath = expandPath(this.root, filePath);

    try {
      await fs.access(fullPath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async readDir(filePath: string): Promise<Array<any>> {
    const fullPath = expandPath(this.root, filePath);
    return this.readDirRecursive(fullPath);
  }

  async readDirRecursive(path: string) {
    const entries = await fs.readdir(path, {withFileTypes: true});

    // Get files within the current directory and add a path key to the file objects
    const files = entries
      .filter(file => !file.isDirectory())
      .map(file => ({
        ...file,
        path: `${path}/${file.name}`.slice(this.root.length),
      }));

    // Get directorys within the current directory
    const directories = entries.filter(entry => entry.isDirectory());

    // Recursively list the sub directories.
    for (const directory of directories) {
      files.push(...(await this.readDirRecursive(`${path}/${directory.name}`)));
    }

    return files;
  }

  async readFile(filePath: string): Promise<any> {
    const fullPath = expandPath(this.root, filePath);
    try {
      const cached = this.cache.get(filePath);
      if (cached) {
        return (await cached).toString('utf-8');
      }
      const promise = this.cache.set(filePath, fs.readFile(fullPath));
      return (await promise).toString('utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new FileNotFoundError('File not found', {
          message: 'File was not found.',
          description: `Unable to find ${filePath}`,
          errorCode: 'FileNotFound',
        });
      }
      throw err;
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = expandPath(this.root, filePath);
    return fs.writeFile(fullPath, content);
  }
}
