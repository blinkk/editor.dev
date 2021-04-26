#!/usr/bin/env node
import * as packageData from '../package.json';
import {Command, Option} from 'commander';
import {LocalApi} from './api/localApi';
import {LocalStorage} from './storage/localStorage';
import cors from 'cors';
import express from 'express';

const PORT = process.env.PORT || 9090;
const ORIGIN_HOSTS = [
  'https://editor.dev',
  'https://beta.editor.dev',
  'http://localhost:8080',
];

// App
const app = express();

// Cors for communicating with editor.dev.
app.use(
  cors({
    origin: ORIGIN_HOSTS,
  })
);

const program = new Command('npx @blinkk/editor.dev');
program.version(packageData.version);
program.arguments('[path]');
program.addOption(
  new Option('-p, --port', 'port to serve the local API from.').default(PORT)
);
program.action((path, options) => {
  // Running as a command uses the local storage and api.
  const storage = new LocalStorage(path);
  const localApi = new LocalApi(storage);
  const port = options.port || PORT;
  app.use('/', localApi.apiRouter);

  app.listen(port, () => {
    if (port !== PORT) {
      console.log(`Running on port ${port}`);
    }
    console.log(
      `Visit https://editor.dev/local/${
        port === PORT ? '' : `${port}/`
      } to start editing.`
    );
  });
});
program.parse(process.argv);
