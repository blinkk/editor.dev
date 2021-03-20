import {
  ApiComponent,
  CopyFileRequest,
  CreateFileRequest,
  CreateWorkspaceRequest,
  DeleteFileRequest,
  GetDevicesRequest,
  GetFileRequest,
  GetFilesRequest,
  GetProjectRequest,
  GetWorkspaceRequest,
  GetWorkspacesRequest,
  PublishRequest,
  SaveFileRequest,
  UploadFileRequest,
  addApiRoute,
  apiErrorHandler,
  isWorkspaceBranch,
  shortenWorkspaceName,
} from './api';
import {
  ApiError,
  DeviceData,
  EditorFileData,
  EditorFileSettings,
  FileData,
  ProjectData,
  PublishResult,
  RepoCommit,
  WorkspaceData,
} from '@blinkk/editor/dist/src/editor/api';
import {ConnectorStorageComponent, StorageManager} from '../storage/storage';
import {ConnectorComponent} from '../connector/connector';
import {Datastore} from '@google-cloud/datastore';
import {GrowConnector} from '../connector/grow';
import {Octokit} from '@octokit/core';
import bent from 'bent';
import express from 'express';
// TODO: FS promises does not work with isomorphic-git?
import fs from 'fs';
import git from 'isomorphic-git';
import yaml from 'js-yaml';

const clientId = 'Iv1.e422a5bfa1197db1';
const clientSecret = fs
  .readFileSync('./secrets/client-secret.secret')
  .toString();

// TODO: Shared cache between docker instances and with old auth cleanup.
const authCache: Record<string, AuthPromiseMeta> = {};
const datastore = new Datastore();
const AUTH_KIND = 'AuthGH';

const postJSON = bent('POST', 'json', {
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'editor.dev',
});

export interface GHRequest {
  /**
   * Github state value used to retrieve the code.
   */
  githubState: string;
  /**
   * Github code used for retrieving the token.
   */
  githubCode: string;
}

export interface GHError {
  /**
   * Github error identifier.
   */
  error: string;
  /**
   * Github error description
   */
  error_description: string;
  /**
   * Github error reference
   */
  error_uri: string;
}

export interface GHAccessToken {
  access_token: string;
  expires_in: string;
  refresh_token: string;
  refresh_token_expires_in: string;
}

export class GithubApi implements ApiComponent {
  protected _connector?: ConnectorComponent;
  protected _apiRouter?: express.Router;
  storageManager: StorageManager;

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
  }

  get apiRouter() {
    if (!this._apiRouter) {
      const router = express.Router({
        mergeParams: true,
      });
      router.use(express.json());

      // Use auth middleware for authenticating.
      router.use(githubAuthentication);

      addApiRoute(router, '/devices.get', this.getDevices.bind(this));
      addApiRoute(router, '/file.copy', this.copyFile.bind(this));
      addApiRoute(router, '/file.create', this.createFile.bind(this));
      addApiRoute(router, '/file.delete', this.deleteFile.bind(this));
      addApiRoute(router, '/file.get', this.getFile.bind(this));
      addApiRoute(router, '/file.save', this.saveFile.bind(this));
      addApiRoute(router, '/file.upload', this.uploadFile.bind(this));
      addApiRoute(router, '/files.get', this.getFiles.bind(this));
      addApiRoute(router, '/project.get', this.getProject.bind(this));
      addApiRoute(router, '/publish.start', this.publish.bind(this));
      addApiRoute(router, '/workspace.create', this.createWorkspace.bind(this));
      addApiRoute(router, '/workspace.get', this.getWorkspace.bind(this));
      addApiRoute(router, '/workspaces.get', this.getWorkspaces.bind(this));

      router.use(apiErrorHandler);

      this._apiRouter = router;
    }

    return this._apiRouter;
  }

  async copyFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: CopyFileRequest
  ): Promise<FileData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    await storage.writeFile(
      request.path,
      await storage.readFile(request.originalPath)
    );
    return {
      path: request.path,
    };
  }

  async createFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: CreateFileRequest
  ): Promise<FileData> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    await storage.writeFile(request.path, request.content || '');
    return {
      path: request.path,
    };
  }

  async createWorkspace(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: CreateWorkspaceRequest
  ): Promise<WorkspaceData> {
    throw new Error('Unable to create new workspace yet.');
  }

  async deleteFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: DeleteFileRequest
  ): Promise<void> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    return storage.deleteFile(request.file.path);
  }

  getApi(expressResponse: express.Response): Octokit {
    return new Octokit({auth: expressResponse.locals.access.access_token});
  }

  async getConnector(
    expressRequest: express.Request,
    expressResponse: express.Response
  ): Promise<ConnectorComponent> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    if (!this._connector) {
      // Check for specific features of the supported connectors.
      if (await GrowConnector.canApply(storage)) {
        this._connector = new GrowConnector(storage);
      } else {
        // TODO: use generic connector.
        throw new Error('Unable to determine connector.');
      }
    }

    return Promise.resolve(this._connector as ConnectorComponent);
  }

  async getDevices(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetDevicesRequest
  ): Promise<Array<DeviceData>> {
    const editorConfig = (await this.readEditorConfig(
      expressRequest,
      expressResponse
    )) as EditorFileSettings;
    return Promise.resolve(editorConfig.devices || []);
  }

  async getFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFileRequest
  ): Promise<EditorFileData> {
    const connector = await this.getConnector(expressRequest, expressResponse);
    const connectorResult = await connector.getFile(expressRequest, request);

    // TODO: Git history for file.

    return Object.assign({}, connectorResult, {
      history: [],
    });
  }

  async getFiles(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetFilesRequest
  ): Promise<Array<FileData>> {
    const api = this.getApi(expressResponse);

    const branchResponse = await api.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        branch: expressRequest.params.branch,
      }
    );

    // Find the tree for the the last commit on branch.
    const commitResponse = await api.request(
      'GET /repos/{owner}/{repo}/git/commits/{commitSha}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        commitSha: branchResponse.data.commit.sha,
      }
    );

    return await this.getFilesRecursive(
      api,
      expressRequest.params.organization,
      expressRequest.params.project,
      commitResponse.data.tree.sha
    );
  }

  protected async getFilesRecursive(
    api: Octokit,
    owner: string,
    repo: string,
    treeSha: string,
    root?: string
  ): Promise<Array<FileData>> {
    root = root || '';
    const treeResponse = await api.request(
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
            api,
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

  async getProject(
    expressRequest: express.Request,
    expressResponse: express.Response,
    request: GetProjectRequest
  ): Promise<ProjectData> {
    const connector = await this.getConnector(expressRequest, expressResponse);
    const connectorResult = await connector.getProject(expressRequest, request);
    const editorConfig = await this.readEditorConfig(
      expressRequest,
      expressResponse
    );
    connectorResult.experiments = connectorResult.experiments || {};
    connectorResult.features = connectorResult.features || {};

    // Pull in editor configuration for experiments.
    if (editorConfig.experiments) {
      connectorResult.experiments = Object.assign(
        {},
        editorConfig.experiments,
        connectorResult.experiments
      );
    }

    // Pull in editor configuration for features.
    if (editorConfig.features) {
      connectorResult.features = Object.assign(
        {},
        editorConfig.features,
        connectorResult.features
      );
    }

    // Connector config take precedence over editor config.
    return Object.assign(
      {},
      {
        site: editorConfig.site,
        title: editorConfig.title,
      },
      connectorResult
    );
  }

  async getStorage(
    expressRequest: express.Request,
    expressResponse: express.Response
  ): Promise<ConnectorStorageComponent> {
    return this.storageManager.storageForBranch(
      expressRequest.params.organization,
      expressRequest.params.project,
      expressRequest.params.branch,
      this.getApi(expressResponse)
    );
  }

  async getWorkspace(
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetWorkspaceRequest
  ): Promise<WorkspaceData> {
    const api = this.getApi(expressResponse);
    const branchResponse = await api.request(
      'GET /repos/{owner}/{repo}/branches/{branch}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        branch: expressRequest.params.branch,
      }
    );

    const commitResponse = await api.request(
      'GET /repos/{owner}/{repo}/commits/{commit}',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
        commit: branchResponse.data.commit.sha,
      }
    );

    return {
      branch: {
        name: branchResponse.data.name,
        commit: {
          hash: branchResponse.data.commit.sha,
          url: branchResponse.data.commit.url,
          author: {
            name: commitResponse.data.commit.author.name,
            email: commitResponse.data.commit.author.email,
          },
          timestamp: commitResponse.data.commit.author.date,
        },
      },
      name: shortenWorkspaceName(branchResponse.data.name || ''),
    };
  }

  async getWorkspaces(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetWorkspacesRequest
  ): Promise<Array<WorkspaceData>> {
    const api = this.getApi(expressResponse);
    const branchesResponse = await api.request(
      'GET /repos/{owner}/{repo}/branches',
      {
        owner: expressRequest.params.organization,
        repo: expressRequest.params.project,
      }
    );
    const resultBranches: Array<WorkspaceData> = [];

    for (const branchInfo of branchesResponse.data) {
      if (!isWorkspaceBranch(branchInfo.name)) {
        continue;
      }

      resultBranches.push({
        branch: {
          name: branchInfo.name,
          commit: {
            hash: branchInfo.commit.sha,
            url: branchInfo.commit.url,
          },
        },
        name: shortenWorkspaceName(branchInfo.name || ''),
      });
    }
    return resultBranches;
  }

  async readEditorConfig(
    expressRequest: express.Request,
    expressResponse: express.Response
  ): Promise<EditorFileSettings> {
    const storage = await this.getStorage(expressRequest, expressResponse);
    let rawFile = null;
    try {
      rawFile = await storage.readFile('editor.yaml');
    } catch (error) {
      if (error.code === 'ENOENT') {
        rawFile = Promise.resolve('');
      } else {
        throw error;
      }
    }
    return (yaml.load(rawFile) || {}) as EditorFileSettings;
  }

  async publish(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: PublishRequest
  ): Promise<PublishResult> {
    // TODO: Publish process.
    throw new Error('Publish workflow not available for local.');
  }

  async saveFile(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: SaveFileRequest
  ): Promise<EditorFileData> {
    return (await this.getConnector(expressRequest, expressResponse)).saveFile(
      expressRequest,
      request
    );
  }

  async uploadFile(
    expressRequest: express.Request,
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: UploadFileRequest
  ): Promise<FileData> {
    return (
      await this.getConnector(expressRequest, expressResponse)
    ).uploadFile(expressRequest, request);
  }
}

interface AuthPromiseMeta {
  /**
   * Promise from the auth request.
   */
  promise: Promise<GHAccessToken>;
  /**
   * If the promise is for a refresh, keep track of the time it was expiring.
   */
  expiresOn?: Date;
}

// TODO: Make this an async middleware when express.js 5 is released.
function githubAuthentication(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const request = req.body as GHRequest;

  // TODO: Fail when no provided the code and state.
  if (!request.githubCode || !request.githubState) {
    next(new Error('No authentication information provided.'));
    return;
  }

  const cacheKey = `${request.githubCode}-${request.githubState}`;
  const key = datastore.key([AUTH_KIND, cacheKey]);

  datastore
    .get(key)
    .then(entities => {
      const entity = entities[0];

      if (entity === undefined) {
        let authMeta = authCache[cacheKey];
        if (!authMeta) {
          authMeta = {
            promise: postJSON('https://github.com/login/oauth/access_token', {
              client_id: clientId,
              client_secret: clientSecret,
              code: request.githubCode,
              state: request.githubState,
            }),
          };
          authCache[cacheKey] = authMeta;

          // Only update datastore with the original request.
          authMeta.promise
            .then((response: GHAccessToken | GHError) => {
              if ((response as GHError).error) {
                response = response as GHError;
                next({
                  message: 'Unable to confirm authentication with GitHub.',
                  description: response.error_description || response.error,
                  details: {
                    uri: response.error_uri,
                  },
                } as ApiError);
                return;
              }
              response = response as GHAccessToken;
              res.locals.access = response;

              // Persist the access token info.
              const dates = tokenDates(
                parseInt(response.expires_in),
                parseInt(response.refresh_token_expires_in)
              );
              datastore
                .save({
                  key: key,
                  data: {
                    auth: response,
                    createdOn: dates.now,
                    lastUsedOn: dates.now,
                    expiresOn: dates.expiresOn,
                    refreshExpiresOn: dates.refreshExpiresOn,
                  },
                })
                .then(() => {
                  next();
                  return;
                })
                .catch((err: any) => {
                  next(err);
                  return;
                });
            })
            .catch((err: any) => {
              next(err);
              return;
            });

          // Request continues after the datastore save.
          return;
        }

        authMeta.promise
          .then((response: GHAccessToken | GHError) => {
            if ((response as GHError).error) {
              response = response as GHError;
              next({
                message: 'Unable to confirm authentication with GitHub.',
                description: response.error_description || response.error,
                details: {
                  uri: response.error_uri,
                },
              } as ApiError);
              return;
            }
            response = response as GHAccessToken;
            res.locals.access = response;
            next();
            return;
          })
          .catch((err: any) => {
            next(err);
            return;
          });

        // Request continues after the promise.
        return;
      }

      // Refresh a token that is expired.
      if (!entity.expiresOn || entity.expiresOn < new Date()) {
        let authMeta = authCache[cacheKey];
        if (
          !authMeta ||
          (authMeta &&
            authMeta.expiresOn &&
            authMeta.expiresOn.getTime() !== entity.expiresOn.getTime())
        ) {
          authMeta = {
            promise: postJSON('https://github.com/login/oauth/access_token', {
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: entity.auth.refresh_token,
              grant_type: 'refresh_token',
            }),
            expiresOn: entity.expiresOn,
          };
          authCache[cacheKey] = authMeta;

          // Only update datastore with the original request.
          authMeta.promise
            .then((response: GHAccessToken | GHError) => {
              if ((response as GHError).error) {
                response = response as GHError;
                next({
                  message: 'Unable to refresh authentication with GitHub.',
                  description: response.error_description || response.error,
                  details: {
                    uri: response.error_uri,
                  },
                } as ApiError);
                return;
              }
              response = response as GHAccessToken;
              res.locals.access = response;

              // Persist the access token info.
              const dates = tokenDates(
                parseInt(response.expires_in),
                parseInt(response.refresh_token_expires_in)
              );
              datastore
                .upsert({
                  key: key,
                  data: {
                    auth: response,
                    createdOn: entity.createdOn,
                    lastUsedOn: dates.now,
                    expiresOn: dates.expiresOn,
                    refreshExpiresOn: dates.refreshExpiresOn,
                  },
                })
                .then(() => {
                  next();
                  return;
                })
                .catch((err: any) => {
                  next(err);
                  return;
                });
            })
            .catch((err: any) => {
              next(err);
              return;
            });

          // Request continues after the datastore save.
          return;
        }

        authMeta.promise
          .then((response: GHAccessToken | GHError) => {
            if ((response as GHError).error) {
              response = response as GHError;
              next({
                message: 'Unable to refresh authentication with GitHub.',
                description: response.error_description || response.error,
                details: {
                  uri: response.error_uri,
                },
              } as ApiError);
              return;
            }
            response = response as GHAccessToken;
            res.locals.access = response;
            next();
            return;
          })
          .catch((err: any) => {
            next(err);
            return;
          });

        // Request continues after the promise.
        return;
      }

      res.locals.access = entity.auth;

      // Update the usage for the auth token.
      entity.lastUsedOn = new Date();
      datastore
        .save(entity)
        .then(() => {
          next();
          return;
        })
        .catch((err: any) => {
          return;
        });
    })
    .catch((err: any) => {
      next(err);
      return;
    });
}

/**
 * Creates dates for auth tokens.
 *
 * @param expiresIn Seconds until token expires.
 * @param refreshExpiresIn Seconds until refresh token expires.
 * @param buffer Buffer seconds to refresh token before it is expired.
 */
function tokenDates(
  expiresIn: number,
  refreshExpiresIn: number,
  buffer = 60
): Record<string, Date> {
  const dates = {
    now: new Date(),
    expiresOn: new Date(),
    refreshExpiresOn: new Date(),
  };
  dates.expiresOn.setTime(
    dates.expiresOn.getTime() + (expiresIn - buffer) * 1000
  );
  dates.refreshExpiresOn.setTime(
    dates.refreshExpiresOn.getTime() + (refreshExpiresIn - buffer) * 1000
  );
  return dates;
}
