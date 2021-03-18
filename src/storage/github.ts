import * as fsSync from 'fs';
import {
  ConnectorApiComponent,
  ConnectorApiStorageComponent,
  expandPath,
} from './storage';
import {Octokit} from '@octokit/core';
import crypto from 'crypto';
import {promises as fs} from 'fs';
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

    fs.mkdir(this.root, {recursive: true})
      .then(() => {})
      .catch(err => {
        throw err;
      });
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = expandPath(this.root, filePath);
    await fs.rm(fullPath);
  }

  async existsFile(filePath: string): Promise<boolean> {
    const remotePath = filePath.replace(/^\/*/, '');
    const etag = await this.etagFile(filePath);
    const headers: Record<string, string> = {};
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    try {
      const response = await this.api.request(
        'GET /repos/{owner}/{repo}/contents/{path}',
        {
          headers: headers,
          owner: 'blinkkcode',
          repo: 'starter',
          path: remotePath,
          ref: 'main',
        }
      );

      // Write the file contents to the local cache.
      const fullPath = expandPath(this.root, filePath);
      const fileContents = Buffer.from(
        (response.data as any).content || '',
        'base64'
      );
      await fs.writeFile(fullPath, fileContents.toString());

      // Etag uses the commit sha, so store it for use in etag.
      await fs.writeFile(`${fullPath}.etag`, response.headers.etag || '');

      return true;
    } catch (err) {
      // Check for unmodified file.
      if (err.status === 304) {
        return true;
      }

      // Check for missing file.
      if (err.status === 404) {
        // When 404, remove local cache.
        const fullPath = expandPath(this.root, filePath);
        try {
          await fs.rm(fullPath);
        } catch (err) {
          // Ignore failed deletes.
        }
        try {
          await fs.rm(`${fullPath}.etag`);
        } catch (err) {
          // Ignore failed deletes.
        }
        return false;
      }

      throw err;
    }
  }

  async etagFile(filePath: string): Promise<string> {
    // Read the etag file from the last request if available.
    const fullPath = expandPath(this.root, filePath);
    try {
      return (await fs.readFile(`${fullPath}.etag`)).toString();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return '';
      } else {
        throw error;
      }
    }
  }

  async readDir(filePath: string): Promise<Array<any>> {
    // const fullPath = expandPath(this.root, filePath);
    return [];
  }

  async readFile(filePath: string): Promise<any> {
    const remotePath = filePath.replace(/^\/*/, '');
    const fullPath = expandPath(this.root, filePath);
    const etag = await this.etagFile(filePath);
    const headers: Record<string, string> = {};
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    try {
      const response = await this.api.request(
        'GET /repos/{owner}/{repo}/contents/{path}',
        {
          headers: headers,
          owner: 'blinkkcode',
          repo: 'starter',
          path: remotePath,
          ref: 'main',
        }
      );

      // Write the file contents to the local cache.
      const fileContents = Buffer.from(
        (response.data as any).content || '',
        'base64'
      );
      await fs.writeFile(fullPath, fileContents.toString());

      // Etag uses the commit sha, so store it for use in etag.
      await fs.writeFile(`${fullPath}.etag`, response.headers.etag || '');

      return fileContents;
    } catch (err) {
      // Check for unmodified file.
      if (err.status === 304) {
        return fs.readFile(fullPath);
      }

      // Check for missing file.
      if (err.status === 404) {
        const err = new Error('File not found.');
        // Hack for not found error.
        (err as any).code = 'ENOENT';
        throw err;
      }

      throw err;
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = expandPath(this.root, filePath);
    return fs.writeFile(fullPath, content);
  }
}
