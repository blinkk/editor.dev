import {ConnectorStorage} from './storage';
import {promises as fs} from 'fs';
import {constants as fsConstants} from 'fs';
import path from 'path';

export class LocalStorage implements ConnectorStorage {
  cwd: string;

  constructor(cwd?: string) {
    this.cwd = path.resolve(cwd || process.cwd());
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.expandPath(filePath);
    await fs.rm(fullPath);
  }

  async existsFile(filePath: string): Promise<boolean> {
    const fullPath = this.expandPath(filePath);

    try {
      await fs.access(fullPath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  expandPath(filePath: string): string {
    // TODO: More security around file access?
    filePath = path.join(this.cwd, filePath);
    const fullPath = path.resolve(this.cwd, filePath);

    if (!fullPath.startsWith(this.cwd)) {
      throw new Error(
        `Cannot work with files outside of '${this.cwd}'. '${filePath}' resolved to '${fullPath}'`
      );
    }

    return fullPath;
  }

  async readDir(filePath: string): Promise<Array<any>> {
    const fullPath = this.expandPath(filePath);
    return this.readDirRecursive(fullPath);
  }

  async readDirRecursive(path: string) {
    const entries = await fs.readdir(path, {withFileTypes: true});

    // Get files within the current directory and add a path key to the file objects
    const files = entries
      .filter(file => !file.isDirectory())
      .map(file => ({
        ...file,
        path: `${path}/${file.name}`.slice(this.cwd.length),
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
    const fullPath = this.expandPath(filePath);
    return fs.readFile(fullPath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.expandPath(filePath);
    return fs.writeFile(fullPath, content);
  }
}
