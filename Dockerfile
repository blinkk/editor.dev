FROM node:14

WORKDIR /usr/src/app

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

# Compile the production js/css files.
RUN yarn run compile

EXPOSE 8080

CMD [ "node", "dist/src/server/server.js" ]
