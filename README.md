# editor.dev Connector

Provides an API server for the editor to connect to and request project files and perform operations.

See the [docs][docs] or [typescript docs][tsdocs].

[docs]: https://editor.dev/docs/
[tsdocs]: https://editor.dev/api/connector/

![Main build](https://github.com/blinkk/editor.dev/actions/workflows/push_main.yaml/badge.svg)

## Usage

To use `editor.dev` with your local project run the following in your project directory (does not need to be added to your node dependencies):

```sh
# Requires Node 14+.
npx @blinkk/editor.dev
```

## Deployment

The editor server is built for production using a Docker image and Google Cloud Run.

Every commit to `main` builds the docker image with a `:main` tag and updates the cloud run image for `api.beta.editor.dev`.
Every tag builds the docker image with a version tag (ex: `v1.0.5`) and the `:latest` tag then updates the cloud run image for `api.editor.dev`.

If there is an issue with the latest release for the prod api you can roll back to an earlier version.

To switch the production deployment run `make deploy-prod tag=<VERSION>` where `<VERSION>` is the
desired version to roll back to. For example: `make deploy-prod tag=v1.0.5`.

## Development

To develop on the editor server for local projects, run the following command:

```sh
# ex: yarn run local --server http://localhost:8787/ ~/code/project
yarn run local --server <preview_server_url> <project_dir>
```

The local preview server url should point to a locally running development server (ex: `npx @amagaki/amagaki serve --port 8787`).

If you are developing the hosted version of the server (that provides access to github, etc) then run the following command:

```sh
yarn run hosted
```

**Note:** Developing for the hosted version requires private keys to be able to communicate with GitHub as the app and are not available to non-core developers.
