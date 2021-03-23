import {
  ConnectorStorageComponent,
  FileNotFoundError,
  expandPath,
} from './storage';
import {promises as fs} from 'fs';
import {constants as fsConstants} from 'fs';
import path from 'path';

export class LocalStorage implements ConnectorStorageComponent {
  root: string;

  constructor(root?: string) {
    this.root = path.resolve(root || process.cwd());
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
      return fs.readFile(fullPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new FileNotFoundError('File not found', {
          message: 'File was not found.',
          description: `Unable to find ${filePath}`,
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
