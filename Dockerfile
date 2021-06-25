FROM node:14

WORKDIR /usr/src/app

ARG GH_CLIENT_SECRET

ENV MODE=prod

# Upgrade base image and cleanup.
RUN apt-get update \
  && apt-get -qq upgrade \
  && apt-get -qq autoremove \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Copy just the node requirement files to take advantage of
# Docker layer caching.
COPY ./package.json ./
COPY ./yarn.lock ./

# Install from the lock file.
RUN yarn install --frozen-lockfile

# Copy files needed for compilation.
COPY ./tsconfig.json ./
COPY ./src ./src

# Compile the production js files.
RUN yarn run compile

# Copy the secrets if available locally.
COPY ./secrets/* ./secrets/

# Write the secret from the arg if it does not exist.
RUN if [ ! -f ./secrets/client-secret.secret ]; then \
      echo "Missing secret file, using GH_CLIENT_SECRET."; \
      printf '%s' "$GH_CLIENT_SECRET" > ./secrets/client-secret.secret; \
    fi \
    && if [ -f ./secrets/client-secret.secret ]; then echo "Secret file exists."; fi

EXPOSE 8080

CMD [ "node", "dist/server/server.js" ]
