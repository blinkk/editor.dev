import {
  COMMITTER_EMAIL,
  COMMITTER_NAME,
  DEFAULT_AUTHOR_EMAIL,
  DEFAULT_AUTHOR_NAME,
} from '../api/githubApi';
import {
  FileNotFoundError,
  ProjectTypeApiComponent,
  ProjectTypeApiStorageComponent,
  expandPath,
} from './storage';

import {FileData} from '@blinkk/editor.dev-ui/dist/editor/api';
import {Octokit} from '@octokit/core';
import {PromiseCache} from '../utility/promiseCache';
import {promises as fs} from 'fs';
import path from 'path';

/**
 * GitHub storage uses a local cache for the files.
 * Pulls from the github service when the cache is out of date.
 */
export class GitHubStorage implements ProjectTypeApiStorageComponent {
  api: Octokit;
  /**
   * Cache to store the promises for loading files.
   *
   * Normally the storage class is created with each request so the
   * cache is not long-lived and should be separate for each request.
   */
  cache: PromiseCache;
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
    this.cache = new PromiseCache();

    fs.mkdir(this.root, {recursive: true})
      .then(() => {})
      .catch(err => {
        throw err;
      });
  }

  async deleteFile(filePath: string, sha?: string): Promise<void> {
    const remotePath = filePath.replace(/^\/*/, '');

    if (!sha) {
      // Retrieve the existing file information.
      const fileResponse = await this.api.request(
        'GET /repos/{owner}/{repo}/contents/{path}',
        {
          owner: this.meta?.owner,
          repo: this.meta?.repo,
          path: remotePath,
          ref: this.meta?.branch,
        }
      );
      sha = (fileResponse.data as any).sha;

      // TODO: Throw an error in the future when we start passing the sha.
      // throw new ShaNotFoundError(
      //   'Sha was not provided and is required for deleting.',
      //   {
      //     message: 'Sha was not provided when deleting a file.',
      //     description: `Unable to find the sha for ${filePath} which is required to delete a file on github.`,
      //   }
      // );
    }

    // Request for delete of the file.
    const user = await this.meta?.getUser(this.api);
    await this.api.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
      owner: this.meta?.owner,
      repo: this.meta?.repo,
      message: 'Deleted file on editor.dev.',
      branch: this.meta?.branch,
      sha: sha as string,
      path: remotePath,
      author: {
        name: user.name || DEFAULT_AUTHOR_NAME,
        email: user.email || DEFAULT_AUTHOR_EMAIL,
      },
      committer: {
        name: COMMITTER_NAME,
        email: COMMITTER_EMAIL,
      },
    });

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
  }

  async ensureFileDir(fullPath: string): Promise<string | undefined> {
    const fullDirectory = path.dirname(fullPath);
    return fs.mkdir(fullDirectory, {recursive: true});
  }

  async existsFile(filePath: string): Promise<boolean> {
    const remotePath = filePath.replace(/^\/*/, '');
    const etag = await this.etagFile(filePath);
    const headers: Record<string, string> = {};
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    try {
      if (!this.cache.has(filePath)) {
        this.cache.set(
          filePath,
          this.api.request('GET /repos/{owner}/{repo}/contents/{path}', {
            headers: headers,
            owner: this.meta?.owner,
            repo: this.meta?.repo,
            path: remotePath,
            ref: this.meta?.branch,
          })
        );
      }
      const cached = this.cache.get(filePath);
      const response = await cached;

      // Write the file contents to the local cache.
      const fullPath = expandPath(this.root, filePath);
      const fileContents = Buffer.from(
        (response.data as any).content || '',
        'base64'
      );

      await this.ensureFileDir(fullPath);
      await fs.writeFile(fullPath, fileContents.toString('utf-8'));

      // Etag uses the commit sha, so store it for use in etag.
      await fs.writeFile(`${fullPath}.etag`, response.headers.etag || '');

      return true;
    } catch (err: any) {
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
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return '';
      } else {
        throw error;
      }
    }
  }

  protected async getFilesRecursive(
    filePath: string,
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
      const fullPath = `${root}/${treeObj.path}`;
      if (treeObj.type === 'blob') {
        if (fullPath.startsWith(filePath || '/')) {
          files.push({
            path: fullPath,
          });
        }
      } else if (treeObj.type === 'tree') {
        if (
          fullPath.startsWith(filePath || '/') ||
          filePath.startsWith(fullPath)
        ) {
          // Collect the promises so they can be done async.
          folderPromises.push(
            this.getFilesRecursive(filePath, owner, repo, treeObj.sha, fullPath)
          );
        }
      }
    }

    // Wait for all of the sub folder promises before adding to files.
    const subFolderResults = await Promise.all(folderPromises);
    for (const subFolderResult of subFolderResults) {
      files = [...files, ...subFolderResult];
    }

    return files;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async readDir(filePath: string): Promise<Array<any>> {
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
      filePath,
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
      if (!this.cache.has(filePath)) {
        this.cache.set(
          filePath,
          this.api.request('GET /repos/{owner}/{repo}/contents/{path}', {
            headers: headers,
            owner: this.meta?.owner,
            repo: this.meta?.repo,
            path: remotePath,
            ref: this.meta?.branch,
          })
        );
      }
      const cached = this.cache.get(filePath);
      const response = await cached;

      // Write the file contents to the local cache.
      const fileContents = Buffer.from(
        (response.data as any).content || '',
        'base64'
      );

      await this.ensureFileDir(fullPath);
      await fs.writeFile(fullPath, fileContents.toString('utf-8'));

      // Etag uses the commit sha, so store it for use in etag.
      await fs.writeFile(`${fullPath}.etag`, response.headers.etag || '');

      return fileContents.toString('utf-8');
    } catch (err: any) {
      // Check for unmodified file.
      if (err.status === 304) {
        return (await fs.readFile(fullPath)).toString('utf-8');
      }

      // Check for missing file.
      if (err.status === 404) {
        throw new FileNotFoundError('File not found', {
          message: 'File was not found.',
          description: `Unable to find ${filePath} in the ${this.meta?.branch} branch.`,
          errorCode: 'FileNotFound',
        });
      }

      throw err;
    }
  }

  async writeFile(
    filePath: string,
    content: string,
    sha?: string
  ): Promise<void> {
    const remotePath = filePath.replace(/^\/*/, '');
    const fullPath = expandPath(this.root, filePath);
    const contentBuffer = Buffer.from(content);

    try {
      await this.api.request('PUT /repos/{owner}/{repo}/contents/{path}', {
        owner: this.meta?.owner,
        repo: this.meta?.repo,
        path: remotePath,
        content: contentBuffer.toString('base64'),
        message: 'Update file on editor.dev.',
        branch: this.meta?.branch,
        sha: sha,
      });

      // Write the file contents to the local cache.
      await this.ensureFileDir(fullPath);
      await fs.writeFile(fullPath, content);
    } catch (err: any) {
      // File was created.
      if (err.status === 201) {
        return;
      }

      throw err;
    }
  }
}
