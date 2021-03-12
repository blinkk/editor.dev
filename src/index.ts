#!/usr/bin/env node

import {LocalApi} from './api/local';
import {LocalStorage} from './storage/local';
import express from 'express';

const PORT = process.env.PORT || 9090;
const args = process.argv.slice(2);

// App
const app = express();

// Running as a command uses the local storage and api.
const storage = new LocalStorage(args.length ? args[0] : undefined);
const localApi = new LocalApi(storage);
app.use('/api', localApi.apiRouter);

app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
  console.log(`Visit https://editor.dev/local/${PORT}/ to start editing.`);
});
