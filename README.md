# Spec Core Microservices

Welcome to Spec's core microservices :)

## Requirements

- node >= 16
- npm >= 8
- postgres >= 14
- redis >= 6
- docker
- Rust
- Deno >= 1.3 (+recommend the Deno/Denoland VSCode extension)

### Helpful Links

Installing Node.js with `nvm` on Mac:<br>
https://collabnix.com/how-to-install-and-configure-nvm-on-mac-os/

Installing Postgres with brew:<br>
https://gist.github.com/ibraheem4/ce5ccd3e4d7a65589ce84f2a3b7c23a3

Installing Redis:<br>
https://redis.io/docs/getting-started/installation/install-redis-on-mac-os/

Installing Docker:<br>
https://docs.docker.com/desktop/install/mac-install/

Installing Rust with `rustup`:
```bash
$ curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Installing Deno:<br>
https://deno.com/manual@v1.33.1/getting_started/installation)

# Data Pipeline

The backbone of Spec is its indexing pipeline, which ingests data from a variety of blockchains, uses that data to curate data higher-level data models, and then publishes updates downstream to customers' databases.

![](https://dbjzhg7yxqn0y.cloudfront.net/data-pipeline.png)

## Components
* [Head Reporter](/head-reporters/)
* [Indexer](/indexers/)
* [Event Sorter](/event-sorter/)
* [Event Generator](/event-generator/)
* [Event Relay](/event-relay/)
* [Tables API](/tables-api/)
* [Gap Detector](/gap-detector/)
* [Live Object Deno Entrypoint](/deno/live-object-entrypoint.ts)
* [Shared Tables](#shared-tables-db)
* [Indexer DB](#indexer-db)
* [Indexer Redis](#indexer-redis)
* [Spec Client](https://github.com/spec-dev/spec)

# Full Stack App

The infrastructure that end-users interact with follows more of the classic `Client` -> `Server` -> `Database` pattern and resembles the following: 

![](https://dbjzhg7yxqn0y.cloudfront.net/full-stack.png)

## Components
* [CLI](https://github.com/spec-dev/cli)
* [Desktop App](https://github.com/spec-dev/app)
* [Core API](/core-api/)
* [Delayed Jobs](/delayed-jobs/)
* [Log Relay](/log-relay/)
* [Indexer Redis](#indexer-redis)
* [ABI Redis](#abi-redis)
* [Core Redis](#core-redis)
* [Core DB](#core-db)
* [Shared Tables](#shared-tables-db)
* [Spec Client](https://github.com/spec-dev/spec)

# Storage Infrastructure

Spec has 3 postgres databases and 3 redis instances that all work together to power its indexing pipeline and infrastructure for data delivery. All Postgres databases are hosted as RDS instances on AWS, and all Redis instances are hosted as Elasticache instances on AWS.

## Indexer DB

The Indexer database keeps track of index-block jobs as well as any chain reorgs that occur.<br>
[[RDS]](https://us-west-1.console.aws.amazon.com/rds/home?region=us-west-1#database:id=indexer;is-cluster=false)

![](https://dbjzhg7yxqn0y.cloudfront.net/indexerdb.png)

* [`indexed_blocks`](/shared/src/lib/indexer/db/entities/IndexedBlock.ts) - A block indexed by Spec.
* [`reorgs`](/shared/src/lib/indexer/db/entities/Reorg.ts) - A chain reorg.

### Local Setup

Create `spec` user if you haven't already:
```bash
$ createuser spec
```

Create the Indexer database:
```bash
$ createdb indexer -O spec
```

Run migrations:
```bash
$ cd shared
$ npm install
$ bin/migrate indexer
```

## Shared Tables DB

The Shared Tables database stores all blockchain data. This includes all chain-specific primitives (blocks, transactions, logs, etc.), all cross-chain token data (tokens, balances, etc.), and all Live Object tables. Every Live Object on Spec exists under a specific namespace, and each namespace has its own corresponding schema within the Shared Tables DB. For example, a Live Object for the Uniswap protocol would exist under the `uniswap` namespace and would have its own corresponding table in the `uniswap` schema.<br>
[[RDS]](https://us-west-1.console.aws.amazon.com/rds/home?region=us-west-1#database:id=shared-tables;is-cluster=false)

![](https://dbjzhg7yxqn0y.cloudfront.net/shared-tables.png)

### Local Setup

Create `spec` user if you haven't already:
```bash
$ createuser spec
```

Create the Shared Tables database:
```bash
$ createdb shared-tables -O spec
```

Run migrations:
```bash
$ cd shared
$ chmod u+x bin/*
$ bin/init-shared-tables
```

## Core DB

The Core database stores all users, namespaces, projects, Live Objects, events, contracts, and other ecosystem data.<br>
[[RDS]](https://us-west-1.console.aws.amazon.com/rds/home?region=us-west-1#database:id=core;is-cluster=false)

![](https://dbjzhg7yxqn0y.cloudfront.net/core-db-arch.png)

* [`users`](/shared/src/lib/core/db/entities/User.ts) - A user on Spec.
* [`sessions`](/shared/src/lib/core/db/entities/Session.ts) - An authed user session.
* [`namespaces`](/shared/src/lib/core/db/entities/Namespace.ts) - A globally unique namespace serving as an umbrella to other resources on Spec.
* [`namespace_users`](/shared/src/lib/core/db/entities/NamespaceUser.ts) - A user that belongs to a particular namespace, with associated permissions.
* [`projects`](/shared/src/lib/core/db/entities/Project.ts) - A customer project on Spec.
* [`project_roles`](/shared/src/lib/core/db/entities/ProjectRole.ts) - A way of specifying owners, admins, and members of a project.
* [`contracts`](/shared/src/lib/core/db/entities/Contract.ts) - A group of smart contracts that all share the same ABI.
* [`contract_instances`](/shared/src/lib/core/db/entities/ContractInstance.ts) - A smart contract deployed to a specific chain/address.
* [`events`](/shared/src/lib/core/db/entities/Event.ts) - An event on Spec that represents something that happened on-chain.
* [`event_versions`](/shared/src/lib/core/db/entities/EventVersion.ts) - Version control for events.
* [`live_objects`](/shared/src/lib/core/db/entities/LiveObject.ts) - A data model representing some live data on-chain.
* [`live_object_versions`](/shared/src/lib/core/db/entities/LiveObjectVersion.ts) - Version control for Live Objects.
* [`live_event_versions`](/shared/src/lib/core/db/entities/LiveEventVersion.ts) - A join-table specifying which event versions are associated with which live object versions, either as inputs or outputs.
* [`live_call_handlers`](/shared/src/lib/core/db/entities/LiveCallHandler.ts) - A smart contract function whose handler is used as an input to a live object version.

### Local Setup

Create `spec` user if you haven't already:
```bash
$ createuser spec
```

Create the Core database:
```bash
$ createdb core -O spec
```

Run migrations:
```bash
$ cd shared
$ npm install
$ npm run build
$ bin/migrate core
```

## Indexer Redis

The Indexer Redis instance is primarily used for communicating between microservices in the data pipeline, leveraging redis queues, streams, and hashes, and more.<br>
[[Elasticache]](https://us-west-1.console.aws.amazon.com/elasticache/home?region=us-west-1#/redis/unclustered-indexer)

## Core Redis

The Core Redis instance is primarily used for storing logs sent to it from the various Spec clients (customers running Spec). These logs are stored in Redis streams, which can then be easily pulled down and tailed from the CLI when requested.<br>
[[Elasticache]](https://us-west-1.console.aws.amazon.com/elasticache/home?region=us-west-1#/redis/core)

## ABI Redis

The ABI Redis instance is in charge of mapping smart contracts to their associated ABIs.<br> 
[[Elasticache]](https://us-west-1.console.aws.amazon.com/elasticache/home?region=us-west-1#/redis/core)

In practice, this looks something like:
```javascript
{
    "eth-contracts": {
        "0x123.": "<abi>",
        "0x456.": "<abi>"
    },
    "polygon-contracts": {
        "0x789": "<abi>",
        ...
    }
}
```

# Local Development (CLI -> Core API)

Follow the steps below to get up and running with a local version of the CLI, Core API, Delayed Jobs worker, and the databases they interact with.

### CLI

Prerequisites:

* Install [Deno](https://deno.com/manual@v1.33.1/getting_started/installation)
* Local Postgres installation

#### 1) Clone the CLI

```bash
$ git clone https://github.com/spec-dev/cli && cd cli
```

#### 2) Install dependencies

```bash
$ npm install
$ npm install -g @spec.dev/spec
```

#### 3) Create a local installation script

```bash
$ mkdir bin
$ touch bin/install
$ chmod u+x bin/*
```

#### 4) Add the following contents to `bin/install`
```
#!/bin/bash

npm run build
mkdir ./dist/files
cp -r ./src/files ./dist
npm install -g . --force
chmod u+x /usr/local/bin/spec
```

#### 5) Run your installation script

```bash
$ bin/install
```

You'll want to re-run this anytime you make changes and want to test them out.

#### 6) Set environment variables to point CLI -> local Core API

```bash
export SPEC_API_ORIGIN=http://localhost:7777
```

### Core API

Follow setup instructions [here](/core-api/README.md)

### Delayed Jobs

Follow setup instructions [here](/delayed-jobs/README.md)

# License

Copyright (c) 2023 Spec Development Inc, All rights reserved.