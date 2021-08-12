import {ApiError} from '@blinkk/editor.dev-ui/dist/editor/api';
import {Datastore} from '@google-cloud/datastore';
import {GenericApiError} from '../api/api';
import bent from 'bent';
import express from 'express';
import fs from 'fs';

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

export interface GHAuthAccessMeta {
  access_token: string;
  expires_in: string;
  refresh_token: string;
  refresh_token_expires_in: string;
}

export interface GHAuthError {
  /**
   * GitHub error identifier.
   */
  error: string;
  /**
   * GitHub error description
   */
  error_description: string;
  /**
   * GitHub error reference
   */
  error_uri: string;
}

export interface GHAuthRequest {
  /**
   * GitHub state value used to retrieve the code.
   */
  githubState: string;
  /**
   * GitHub code used for retrieving the token.
   */
  githubCode: string;
}

export interface AuthPromiseMeta {
  /**
   * Promise from the auth request.
   */
  promise: Promise<GHAuthAccessMeta>;
  /**
   * If the promise is for a refresh, keep track of the time it was expiring.
   */
  expiresOn?: Date;
}

// TODO: Make this an async middleware when express.js 5 is released.
export function githubAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  // Reset the access in case the response is reused in memory.
  res.locals.access = undefined;
  authenticateGitHub(req.body as GHAuthRequest)
    .then(accessInfo => {
      res.locals.access = accessInfo;
      next();
    })
    .catch((err: any) => {
      next(err);
    });
}

async function authenticateGitHub(
  request: GHAuthRequest
): Promise<GHAuthAccessMeta> {
  // Fail when not provided the code and state.
  if (!request.githubCode || !request.githubState) {
    throw new Error('No authentication information provided.');
  }

  const cacheKey = `${request.githubCode}---${request.githubState}`;
  const key = datastore.key([AUTH_KIND, cacheKey]);
  const [entity] = await datastore.get(key);

  if (entity === undefined) {
    // Check for in-process authentication.
    let authMeta = authCache[cacheKey];
    if (!authMeta) {
      // No in-progress authentication, authenticate!
      authMeta = {
        promise: postJSON('https://github.com/login/oauth/access_token', {
          client_id: clientId,
          client_secret: clientSecret,
          code: request.githubCode,
          state: request.githubState,
        }),
      };
      authCache[cacheKey] = authMeta;

      // Only update datastore in the original request.
      let response: GHAuthAccessMeta | GHAuthError = await authMeta.promise;

      // Clear out the auth cache after the request.
      delete authCache[cacheKey];

      verifyAuthResponse(
        response,
        'Unable to confirm authentication with GitHub.'
      );

      response = response as GHAuthAccessMeta;

      // Persist the access token info.
      const dates = tokenDates(
        parseInt(response.expires_in),
        parseInt(response.refresh_token_expires_in)
      );
      await datastore.save({
        key: key,
        data: {
          auth: response,
          createdOn: dates.now,
          lastUsedOn: dates.now,
          expiresOn: dates.expiresOn,
          refreshExpiresOn: dates.refreshExpiresOn,
        },
      });
      return response;
    }

    const response: GHAuthAccessMeta | GHAuthError = await authMeta.promise;

    // Clear out the auth cache after the request.
    delete authCache[cacheKey];

    verifyAuthResponse(
      response,
      'Unable to confirm authentication with GitHub.'
    );

    return response as GHAuthAccessMeta;
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
      let response: GHAuthAccessMeta | GHAuthError = await authMeta.promise;

      // Clear out the auth cache after the request.
      delete authCache[cacheKey];

      verifyAuthResponse(
        response,
        'Unable to refresh authentication with GitHub.'
      );

      response = response as GHAuthAccessMeta;

      // Persist the access token info.
      const dates = tokenDates(
        parseInt(response.expires_in),
        parseInt(response.refresh_token_expires_in)
      );
      await datastore.upsert({
        key: key,
        data: {
          auth: response,
          createdOn: entity.createdOn,
          lastUsedOn: dates.now,
          expiresOn: dates.expiresOn,
          refreshExpiresOn: dates.refreshExpiresOn,
        },
      });
      return response;
    }

    const response: GHAuthAccessMeta | GHAuthError = await authMeta.promise;
    verifyAuthResponse(
      response,
      'Unable to refresh authentication with GitHub.'
    );

    // Request continues after the promise.
    return response as GHAuthAccessMeta;
  }

  // Update the usage for the auth token.
  entity.lastUsedOn = new Date();
  await datastore.save(entity);

  return entity.auth;
}

export async function clearAuthGitHub(request: GHAuthRequest): Promise<void> {
  // Fail when not provided the code and state.
  if (!request.githubCode || !request.githubState) {
    throw new Error('No authentication information provided.');
  }

  const cacheKey = `${request.githubCode}---${request.githubState}`;
  const key = datastore.key([AUTH_KIND, cacheKey]);
  datastore.delete(key);
}

/**
 * Check the api response from GitHub for an error.
 *
 * @param response Response from GitHub API.
 * @param errorMessage General message if there is an error response.
 */
function verifyAuthResponse(
  response: GHAuthAccessMeta | GHAuthError,
  errorMessage = 'Unable to verify authentication with GitHub.'
) {
  if ((response as GHAuthError).error) {
    response = response as unknown as GHAuthError;
    throw new GenericApiError(errorMessage, {
      message: errorMessage,
      description: response.error_description || response.error,
      details: {
        error: response.error,
        uri: response.error_uri,
      },
    } as ApiError);
  }
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
