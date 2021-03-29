import {
  FileNotFoundError,
  ProjectTypeApiComponent,
  ProjectTypeApiStorageComponent,
  expandPath,
} from './storage';
import {FileData} from '@blinkk/editor/dist/src/editor/api';
import {Octokit} from '@octokit/core';
import {promises as fs} from 'fs';
import path from 'path';

/**
 * Github storage uses a local cache for the files.
 * Pulls from the github service when the cache is out of date.
 */
export class GithubStorage implements ProjectTypeApiStorageComponent {
  api: Octokit;
  meta?: Record<string, any>;
  root: string;

  constructor(
    root: string,
    api?: ProjectTypeApiComponent,
    meta?: Record<string, any>
  ) {
    this.root = path.resolve(root);
    this.api = api as Octokit;
    this.meta = meta;

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
          owner: this.meta?.owner,
          repo: this.meta?.repo,
          path: remotePath,
          ref: this.meta?.branch,
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

  protected async getFilesRecursive(
    owner: string,
    repo: string,
    treeSha: string,
    root?: string
  ): Promise<Array<FileData>> {
    root = root || '';
    const treeResponse = await this.api.request(
      'GET /repos/{owner}/{repo}/git/trees/{treeSha}',
      {
        owner: owner,
        repo: repo,
        treeSha: treeSha,
      }
    );

    let files: Array<FileData> = [];
    const folderPromises: Array<Promise<any>> = [];

    for (const treeObj of treeResponse.data.tree) {
      if (treeObj.type === 'blob') {
        files.push({
          path: `${root}/${treeObj.path}`,
        });
      } else if (treeObj.type === 'tree') {
        // Collect the promises so they can be done async.
        folderPromises.push(
          this.getFilesRecursive(
            owner,
            repo,
            treeObj.sha,
            `${root}/${treeObj.path}`
          )
        );
      }
    }

    // Wait for all of the sub folder promises before adding to files.
    const subFolderResults = await Promise.all(folderPromises);
    for (const subFolderResult of subFolderResults) {
      files = [...files, ...subFolderResult];
    }

    return files;
  }

  async readDir(filePath: string): Promise<Array<any>> {
    // TODO: Use the filePath to just return files from
    // a specific directory.

    // Pull the branch information.
    const branchResponse = await this.api.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: this.meta?.owner,
        repo: this.meta?.repo,
        branch: this.meta?.branch,
      }
    );

    // Find the tree for the the last commit on branch.
    const commitResponse = await this.api.request(
      'GET /repos/{owner}/{repo}/git/commits/{commitSha}',
      {
        owner: this.meta?.owner,
        repo: this.meta?.repo,
        commitSha: branchResponse.data.commit.sha,
      }
    );

    return await this.getFilesRecursive(
      this.meta?.owner,
      this.meta?.repo,
      commitResponse.data.tree.sha
    );
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
          owner: this.meta?.owner,
          repo: this.meta?.repo,
          path: remotePath,
          ref: this.meta?.branch,
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
