FROM node:16-alpine
RUN apk add --no-cache --virtual .gyp g++ make py3-pip

WORKDIR /usr

COPY package.json ./
COPY tsconfig.json ./
COPY src ./src

RUN npm install
RUN apk del .gyp

CMD ["npm", "run", "typeorm", "migration:run", "--", "-d", "./src/lib/core/db/dataSource.ts"]