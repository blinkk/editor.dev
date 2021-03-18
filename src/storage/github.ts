import {
  ConnectorApiComponent,
  ConnectorApiStorageComponent,
  expandPath,
} from './storage';
import {Octokit} from '@octokit/core';
import {promises as fs} from 'fs';
import {constants as fsConstants} from 'fs';
import path from 'path';

/**
 * Github storage uses a local cache for the files.
 * Pulls from the github service when the cache is out of date.
 */
export class GithubStorage implements ConnectorApiStorageComponent {
  api: Octokit;
  root: string;

  constructor(root: string, api?: ConnectorApiComponent) {
    this.root = path.resolve(root);
    this.api = api as Octokit;
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
    // const fullPath = expandPath(this.root, filePath);
    return [];
  }

  async readFile(filePath: string): Promise<any> {
    const fullPath = expandPath(this.root, filePath);
    return fs.readFile(fullPath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = expandPath(this.root, filePath);
    return fs.writeFile(fullPath, content);
  }
}
