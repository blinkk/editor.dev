#!/usr/bin/env node

/**
 * CLI for serving project files for consumption by editor.dev.
 *
 * This command is made available as `npx @blinkk/editor.dev`.
 */

import {Command, Option} from 'commander';
import {LocalApi, LocalApiOptions} from './api/localApi';
import {LocalStorage} from './storage/localStorage';
import {StorageManager} from './storage/storage';
import cors from 'cors';
import express from 'express';

const PORT = process.env.PORT || 9090;
const ORIGIN_HOSTS = [
  'https://editor.dev',
  'https://beta.editor.dev',
  'http://localhost:3000',
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
program.arguments('[path]');
program.addOption(
  new Option(
    '-p, --port <number>',
    'port to serve the local API from.'
  ).default(PORT)
);
program.addOption(
  new Option('--server <url>', 'preview server url for custom preview serving')
);
program.addOption(
  new Option(
    '--server-config <url>',
    'preview server url for custom config json'
  )
);
program.action((path, options) => {
  // Site files are managed by the storage manager.
  const storageManager = new StorageManager({
    rootDir: path,
    storageCls: LocalStorage,
  });

  const apiOptions: LocalApiOptions = {};

  // Allow specifying a custom preview server for local development.
  // @see https://editor.dev/api/ui/interfaces/editor_api.editorpreviewsettings.html
  if (options.server) {
    apiOptions.preview = {
      baseUrl: options.server,
    };
    console.log('Using custom preview server:', options.server);

    if (options.serverConfig) {
      apiOptions.preview.configUrl = options.serverConfig;
      console.log('Using custom preview server config:', options.serverConfig);
    }
  }

  // Running as a command uses the local storage and api.
  const localApi = new LocalApi(storageManager, apiOptions);
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
