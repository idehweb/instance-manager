FROM node:18.11.0-bullseye as base
ENV PATH=/app/node_modules/.bin:$PATH
WORKDIR /app
ENV INIT_BEFORE Docker
ENV PORT 3000
ENV PUBLIC_PATH ./public
ENV MONGO_URL mongodb://mongomaster:27017,mongoslave1:27017,mongoslave2:27017/InstanceManager?replicaSet=mongoReplica
ENV MONGO_DB InstanceManager
ENV KNOWN_HOSTS nodeeweb,localhost
ENV INTERFACE_URL http://nodeeweb-server/api/v1/instanceManager
ENV JOB_MAX_ATTEMPTS 3
ENV INSTANCE_DEFAULT_IMAGE idehweb/nodeeweb-server:pro-0.1.40
ENV AUTH_SECRET nodeeweb-token
EXPOSE ${PORT}
ENV DOCKER_HUB_USER idehweb
ENV DOCKER_BUILDKIT 1
# install docker engine
RUN curl -fsSL https://get.docker.com | sh

# install git
RUN apt-get update \ 
    && apt-get install -y --no-install-recommends \ 
    git \ 
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# install npm packages
RUN npm ci && npm cache clean --force

FROM base as pro
ENV NODE_ENV production
COPY . .
# COPY ./docker-entrypoint.sh /usr/local/bin
# ENTRYPOINT [ "docker-entrypoint.sh" ]
CMD [ "node","server" ]
