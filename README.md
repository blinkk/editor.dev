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
