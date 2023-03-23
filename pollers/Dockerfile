# --- Builder ----------------------------------------

FROM node:16-alpine AS builder
RUN apk add --no-cache --virtual .gyp g++ make py3-pip

RUN mkdir -p /usr/app
WORKDIR /usr/app

COPY pollers/package.json ./
COPY pollers/tsconfig.json ./

COPY pollers/src ./src
COPY shared /usr/shared

RUN npm install
RUN npm run build

# --- Runner -----------------------------------------

FROM node:16-alpine
RUN apk add --no-cache --virtual .gyp g++ make py3-pip

RUN mkdir -p /usr/shared
WORKDIR /usr/shared

COPY --from=builder /usr/shared/package.json ./
RUN npm install --only=production
COPY --from=builder /usr/shared/dist ./dist

RUN mkdir -p /usr/app
WORKDIR /usr/app

COPY pollers/package.json ./
RUN npm install --only=production
COPY --from=builder /usr/app/dist ./dist

RUN apk del .gyp

ENTRYPOINT ["npm", "start"]