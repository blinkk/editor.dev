import {ApiBaseComponent, addApiRoute, apiErrorHandler} from '../api';
import {GrowPartialData} from '@blinkk/editor/dist/src/editor/api';
import {StorageManager} from '../../storage/storage';
import express from 'express';

export const COMMITTER_EMAIL = 'bot@editor.dev';
export const COMMITTER_NAME = 'editor.dev bot';
export const DEFAULT_AUTHOR_EMAIL = 'hello@blinkk.com';
export const DEFAULT_AUTHOR_NAME = 'editor.dev';

export class GrowApi implements ApiBaseComponent {
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

      addApiRoute(router, '/partials.get', this.getPartials.bind(this));

      // Error handler needs to be last.
      router.use(apiErrorHandler);

      this._apiRouter = router;
    }

    return this._apiRouter;
  }

  async getPartials(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressRequest: express.Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expressResponse: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: GetPartialsRequest
  ): Promise<Array<GrowPartialData>> {
    // TODO: Read all the partial configurations.
    return Promise.resolve([
      {
        key: 'test',
      },
    ]);
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetPartialsRequest {}
