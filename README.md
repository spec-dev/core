# Spec Core

Welcome to Spec's core microservices :)

## Full-Stack Requirements

- node >= 16
- npm >= 8
- postgres >= 14
- redis >= 6
- docker
- Rust
- Deno >= 1.3 (+recommend the Deno/Denoland VSCode extension)

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

The backbone of Spec is its indexing pipeline, which ingests data from a variety of blockchains, uses it to curate data for higher-level data models, and then publishes these data changes downstream to customers' databases.

![](https://dbjzhg7yxqn0y.cloudfront.net/data-pipeline.png)

# Full Stack App

The infrastructure that end-users interact with follows more of the classic `Client` -> `Server` -> `Database` pattern and resembles the following: 

![](https://dbjzhg7yxqn0y.cloudfront.net/full-stack.png)

# Storage Infrastructure

Spec has 3 postgres databases and 3 redis instances that all work together to power its indexing pipeline and infrastructure for data delivery.

## Postgres Databases

Postgres is used internally to store user data, blockchain primitives, and higher-level Live Object data. All Postgres databases are hosted as RDS instances on AWS.

### Indexer DB

The Indexer database keeps track of the index-block jobs + any chain reorgs that occur.

![](https://dbjzhg7yxqn0y.cloudfront.net/indexerdb.png)

* [`indexed_blocks`](/shared/src/lib/indexer/db/entities/IndexedBlock.ts) - A block indexed by Spec.
* [`reorgs`](/shared/src/lib/indexer/db/entities/Reorg.ts) - A chain reorg.

### Shared Tables DB

![](https://dbjzhg7yxqn0y.cloudfront.net/shared-tables.png)

### Core DB

![](https://dbjzhg7yxqn0y.cloudfront.net/coredb.png)

## Redis Instances
