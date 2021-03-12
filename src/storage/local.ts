import {ConnectorStorage} from './storage';
import {promises as fs} from 'fs';
import {constants as fsConstants} from 'fs';
import path from 'path';

export class LocalStorage implements ConnectorStorage {
  cwd: string;

  constructor(cwd?: string) {
    this.cwd = path.resolve(cwd || process.cwd());
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = this.expandPath(filePath);
    await fs.rm(fullPath);
  }

  async exists(filePath: string): Promise<boolean> {
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

  async read(filePath: string): Promise<any> {
    const fullPath = this.expandPath(filePath);
    return fs.readFile(fullPath);
  }

  async write(filePath: string, content: string): Promise<void> {
    const fullPath = this.expandPath(filePath);
    return fs.writeFile(fullPath, content);
  }
}
