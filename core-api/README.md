# Core API

The Core API is Spec's primary API for all application specific resources/actions, such as user login, project management, contract registration, searching Live Objects, etc.

**Deployment: 1 in total**

## Database Connections

Ensure the following Postgres and Redis instances have been set up locally:

* [Core DB](/#local-setup-2)
* [Shared Tables](/#local-setup-1)
* Indexer Redis
* Core Redis
* ABI Redis

## Setup

#### 1) Install dependencies

```bash
$ npm install
```

#### 2) Set the following environment variables

```
export ENV=local
```

#### 3) Make sure Postgres and Redis are both running

#### 4) Make sure you've run `npm run build` from inside the [shared](/shared/) folder in the root directory of this projet.

## Run

```bash
$ bin/run
```

## Build Docker Image

```bash
$ bin/build
```

## Push Docker Image

```bash
$ bin/push
```

## Deploy to K8S

```bash
$ bin/deploy
```