FROM node:18.17.0-bullseye-slim as base

ENV PATH=/app/node_modules/.bin:$PATH
WORKDIR /app
ENV INIT_BEFORE Docker
ENV PORT 3000
ENV PUBLIC_PATH ./public
ENV MONGO_DB InstanceManager
ENV NODEEWEB_DB Idehweb
ENV JOB_MAX_ATTEMPTS 3
ENV SSH_PRIVATE_KEY_PATH /root/.ssh/host-private
EXPOSE ${PORT}

# install curl
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Health check
HEALTHCHECK --interval=1m --timeout=15s --retries=3 --start-period=2m \
    CMD curl -fk http://localhost:${PORT}/health || exit 1


FROM base as build

COPY package*.json ./

# install npm packages
RUN npm i

# Copy Modules
COPY . .

# Build
RUN npm run full:build


FROM base as pro
ENV NODE_ENV production
COPY --from=build /app/dist /app/
# COPY ./docker-entrypoint.sh /usr/local/bin
# ENTRYPOINT [ "docker-entrypoint.sh" ]
CMD [ "--enable-source-maps" ,"index.cjs" ]
