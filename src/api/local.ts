import {ApiComponent, handleError} from './api';
import {ConnectorComponent} from '../connector/connector';
import {ConnectorStorage} from '../storage/storage';
import {GrowConnector} from '../connector/grow';
import express from 'express';

export class LocalApi implements ApiComponent {
  protected _connector?: ConnectorComponent;
  protected _apiRouter?: express.Router;
  storage: ConnectorStorage;

  constructor(storage: ConnectorStorage) {
    this.storage = storage;
  }

  get apiRouter() {
    if (!this._apiRouter) {
      this._apiRouter = express.Router();

      // TODO: Use auth middleware.
      // router.use(...);

      this._apiRouter.get('/project', (req, res) => {
        this.getConnector()
          .then(connector => {
            connector
              .getProject(req, req.body)
              .then(response => {
                res.json(response);
              })
              .catch(e => {
                handleError(e, req, res);
              });
          })
          .catch(e => {
            handleError(e, req, res);
          });
      });
    }

    return this._apiRouter;
  }

  async getConnector(): Promise<ConnectorComponent> {
    if (!this._connector) {
      // Check for specific features of the supported connectors.
      if (await GrowConnector.canApply(this.storage)) {
        this._connector = new GrowConnector(this.storage);
      } else {
        // TODO: use generic connector.
        throw new Error('Unable to determine connector.');
      }
    }

    return Promise.resolve(this._connector);
  }
}
