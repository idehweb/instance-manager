FROM node:18.11.0-bullseye as base
ENV PATH=/app/node_modules/.bin:$PATH
WORKDIR /app
ENV INIT_BEFORE Docker
ENV PORT 3000
ENV PUBLIC_PATH ./public
ENV MONGO_URL mongodb://mongomaster:27017,mongoslave1:27017,mongoslave2:27017/?replicaSet=mongoReplica
ENV MONGO_DB InstanceManager
ENV NODEEWEB_DB Idehweb
ENV JOB_MAX_ATTEMPTS 3
ENV INSTANCE_DEFAULT_IMAGE nodeeweb-server:0.1.46
ENV AUTH_SECRET nodeeweb-token
ENV CF_TOKEN FSkS5Wh12LP5avhlgyC3nq7v4vJJZZJfHa0vEiUp
ENV CF_EMAIL info@idehweb.com
ENV CF_ZONE_ID e3ea0d3f1a9f06ec460f6ea10cf95487
ENV CF_ACCOUNT_ID 8049dc6f45635baedfbd4204cd446ebc
ENV CF_IP 185.110.190.242
EXPOSE ${PORT}
ENV DOCKER_HUB_USER idehweb
ENV DOCKER_BUILDKIT 1

# install docker engine
RUN curl -fsSL https://get.docker.com | sh

# pre-requirements for mongoshell , mongotools
RUN wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | apt-key add - \
    && apt-get install gnupg \ 
    && wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | apt-key add - \
    && echo "deb https://repo.mongodb.org/apt/debian/ bullseye/mongodb-org/6.0 main" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# install git , mongosh , mongotools , zip
RUN apt-get update \ 
    && apt-get install -y --no-install-recommends \ 
    git \ 
    mongodb-mongosh \
    mongodb-database-tools \
    zip \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# install npm packages
RUN npm ci && npm cache clean --force

FROM base as pro
ENV NODE_ENV production
ENV KNOWN_HOSTS nodeeweb-server,localhost
COPY . .
# COPY ./docker-entrypoint.sh /usr/local/bin
# ENTRYPOINT [ "docker-entrypoint.sh" ]
CMD [ "node","server" ]
