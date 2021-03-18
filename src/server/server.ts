import {StorageManager, StorageManagerDevConfig} from '../storage/storage';
import {GithubApi} from '../api/github';
import {GithubStorage} from '../storage/github';
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

let devConfig: StorageManagerDevConfig | undefined = undefined;
let rootDir = './sites';

if (MODE === 'dev') {
  const args = process.argv.slice(2);
  devConfig = {
    useSingleDirectory: true,
  };
  rootDir = args.length ? args[0] : rootDir;
}

// Site files are managed by the storage manager to separate out the
// different projects and branches.
const storageManager = new StorageManager({
  dev: devConfig,
  rootDir: rootDir,
  storageCls: GithubStorage,
});

const githubApi = new GithubApi(storageManager);
app.use('/gh/:organization/:project/:branch', githubApi.apiRouter);

app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
});
