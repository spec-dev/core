FROM node:16-alpine
RUN apk add --no-cache --virtual .gyp g++ make py3-pip

WORKDIR /usr

COPY package.json ./
COPY tsconfig.json ./
COPY tsconfig.module.json ./
COPY src ./src

RUN npm install
RUN apk del .gyp