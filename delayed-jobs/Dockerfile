# --- Builder ----------------------------------------

FROM node:16.15.0 AS builder

RUN mkdir -p /usr/app
WORKDIR /usr/app

COPY delayed-jobs/package.json ./
COPY delayed-jobs/tsconfig.json ./

COPY delayed-jobs/src ./src
COPY delayed-jobs/deno ./deno
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

# Delayed Jobs
RUN mkdir -p /usr/app
WORKDIR /usr/app
COPY delayed-jobs/package.json ./
COPY delayed-jobs/deno ./deno
RUN npm install --only=production
COPY --from=builder /usr/app/dist ./dist

# Download Deno
WORKDIR /
RUN mkdir -p /root/.deno/bin
RUN curl --fail --location --output /root/.deno/bin/deno.zip https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip

# Install Deno and add to path
RUN unzip -d /root/.deno/bin -o /root/.deno/bin/deno.zip
RUN chmod u+x /root/.deno/bin/deno
RUN rm /root/.deno/bin/deno.zip
ENV PATH="${PATH}:/root/.deno/bin"

# Install deployctl
RUN deno install --allow-read --allow-write --allow-env --allow-net --allow-run --no-check -r -f "https://deno.land/x/deploy/deployctl.ts"

WORKDIR /usr/app

ENTRYPOINT ["npm", "start"]