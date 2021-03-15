import {LocalApi} from '../api/local';
import {LocalStorage} from '../storage/local';
import cors from 'cors';
import express from 'express';

const PORT = process.env.PORT || 9090;
const MODE = process.env.MODE || 'dev';
const originHosts = ['https://editor.dev', 'https://beta.editor.dev'];

// Only allow access from localhost when running in a dev environment.
if (MODE === 'dev') {
  originHosts.push('http://localhost:8080');
}

// App
const app = express();

// Cors for communicating with editor.dev.
app.use(
  cors({
    origin: originHosts,
  })
);

// Services use a local cache for the files, but pull from the
// remote service when the cache is out of date.

// TODO: Figure out how the storage is going to work for
// hosted docker image.
const args = process.argv.slice(2);
const storage = new LocalStorage(args.length ? args[0] : undefined);
// TODO: Create a github api.
const localApi = new LocalApi(storage);
app.use('/gh/:organization/:project/:branch', localApi.apiRouter);

app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
});
