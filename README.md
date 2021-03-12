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
# ex: yarn run hosted ~/code/project
yarn run hosted <project_dir>
```

For simplicity, the `project_dir` will be used as the local 'source' for the file operations.
This makes it so that the directory structure doesn't have to mimic the url structure.
The `project_dir` should match the service being tested.
For example, `~/code/project` should be a clone of `github.com/org/project` if using the `/gh/org/project/` server and corresponding api.
