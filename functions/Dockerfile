# --- Builder ----------------------------------------

FROM node:16.15.0 AS builder
RUN apk add --no-cache --virtual .gyp g++ make py3-pip

RUN mkdir -p /usr/app
WORKDIR /usr/app

COPY functions/package.json ./
COPY functions/tsconfig.json ./

COPY functions/src ./src

RUN npm install
RUN apk del .gyp
RUN npm run build

# --- Runner -----------------------------------------

FROM node:16.15.0
RUN apk add --no-cache --virtual .gyp g++ make py3-pip

RUN mkdir -p /usr/app
WORKDIR /usr/app
COPY functions/package.json ./
RUN npm install --only=production
COPY --from=builder /usr/app/dist ./dist

RUN apk del .gyp

EXPOSE 80

ENTRYPOINT ["npm", "start"]