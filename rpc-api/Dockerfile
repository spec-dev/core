# --- Builder ----------------------------------------

FROM node:16.15.0 AS builder

RUN mkdir -p /usr/app
WORKDIR /usr/app

COPY rpc-api/package.json ./
COPY rpc-api/tsconfig.json ./

COPY rpc-api/src ./src
COPY shared /usr/shared

RUN npm install
RUN npm run build

# --- Runner -----------------------------------------

FROM node:16.15.0

# Shared
RUN mkdir -p /usr/shared
WORKDIR /usr/shared
COPY --from=builder /usr/shared/package.json ./
RUN npm install --only=production
COPY --from=builder /usr/shared/dist ./dist

# Tables API
RUN mkdir -p /usr/app
WORKDIR /usr/app
COPY rpc-api/package.json ./
RUN npm install --only=production
COPY --from=builder /usr/app/dist ./dist

EXPOSE 80

ENTRYPOINT ["npm", "start"]