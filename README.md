# Live Editor Server

Experimental.

Provides an API server for the live editor to connect to and request project files and perform operations.

Supports generic editor fields and ability to use specialized editor fields for `grow` and `amagaki`.

[![codecov](https://codecov.io/gh/blinkkcode/live-edit-server/branch/main/graph/badge.svg?token=ZzekLnqLhc)](https://codecov.io/gh/blinkkcode/live-edit-server)

## Usage

To use `editor.dev` with your local project run the following in your project directory (does not need to be added to your node dependencies):

```sh
npx @blinkk/editor-server
```

## Deployment

The live editor server is built for production using a Docker image and Google Cloud Run.
Every commit to master builds the docker image with a `:main` tag and updates the cloud run image for `api.beta.editor.dev`.
Every tag builds the docker image with a version tag (ex: `v1.0.5`) and the `:latest` tag then updates the cloud run image for `api.editor.dev`.

If there is an issue with the latest release for the prod api you can roll back to an earlier version.

To switch the production deployment run `make deploy-prod tag=<VERSION>` where `<VERSION>` is the desired version to roll back to.
For example: `make deploy-prod tag=v1.0.5`.

## Development

To develop on the live editor server for local projects, run the following command:

```sh
# ex: yarn run serve ~/code/project
yarn run serve <project_dir>
```

If you are developing the hosted version of the server (that provides access to github, etc) then run the following command:

```sh
yarn run hosted
```
