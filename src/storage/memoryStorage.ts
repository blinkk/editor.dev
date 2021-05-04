import {FileNotFoundError, ProjectTypeStorageComponent} from './storage';

/**
 * In memory storage class for use in tests.
 */
export class MemoryStorage implements ProjectTypeStorageComponent {
  protected files: Record<string, string>;
  root: string;

  constructor(root?: string) {
    this.files = {};
    this.root = root || '';
  }

  async deleteFile(filePath: string): Promise<void> {
    delete this.files[filePath];
  }

  async existsFile(filePath: string): Promise<boolean> {
    return filePath in this.files;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async readDir(filePath: string): Promise<Array<any>> {
    throw new Error('Unable to read dir for memory storage.');
  }

  async readFile(filePath: string): Promise<any> {
    if (!(filePath in this.files)) {
      throw new FileNotFoundError('File not found', {
        message: 'File was not found.',
        description: `Unable to find ${filePath}`,
      });
    }

    return this.files[filePath];
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.files[filePath] = content;
  }
}
