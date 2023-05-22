# Spec Core Microservices

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

Spec has 3 postgres databases and 3 redis instances that all work together to power its indexing pipeline and infrastructure for data delivery. All Postgres databases are hosted as RDS instances on AWS, and all Redis instances are hosted as Elasticache instances on AWS.

## Indexer DB

The Indexer database keeps track of index-block jobs as well as any chain reorgs that occur.<br>
[RDS link](https://us-west-1.console.aws.amazon.com/rds/home?region=us-west-1#database:id=indexer;is-cluster=false)

![](https://dbjzhg7yxqn0y.cloudfront.net/indexerdb.png)

[`indexed_blocks`](/shared/src/lib/indexer/db/entities/IndexedBlock.ts) - A block indexed by Spec.<br>
[`reorgs`](/shared/src/lib/indexer/db/entities/Reorg.ts) - A chain reorg.<br>

## Shared Tables DB

The Shared Tables database stores all blockchain data. This includes all chain-specific primitives (blocks, transactions, logs, etc.), all cross-chain token data (tokens, balances, etc.), and all Live Object tables (the tables backing every Live Object). Every Live Object on Spec exists under a specific namespace, and each namespace has its own corresponding schema within the Shared Tables database. As an example, all Live Objects for the Uniswap protocol would exist under the `uniswap` namespace, and each would have its own corresponding table in the `uniswap` schema.

![](https://dbjzhg7yxqn0y.cloudfront.net/shared-tables.png)

## Core DB

The Core database stores all users, namespaces, projects, Live Objects, events, contracts, and other ecosystem data.

![](https://dbjzhg7yxqn0y.cloudfront.net/coredb.png)

[`users`](/shared/src/lib/core/db/entities/User.ts) - A user on Spec.<br>
[`sessions`](/shared/src/lib/core/db/entities/Session.ts) - An authed user session.<br>
[`namespaces`](/shared/src/lib/core/db/entities/Namespace.ts) - A globally unique namespace serving as an umbrella to other resources on Spec.<br>
[`namespace_users`](/shared/src/lib/core/db/entities/NamespaceUser.ts) - A user that belongs to a particular namespace, with associated permissions.<br>
[`projects`](/shared/src/lib/core/db/entities/Project.ts) - A customer project on Spec.<br>
[`project_roles`](/shared/src/lib/core/db/entities/ProjectRole.ts) - A way of specifying owners, admins, and members of a project.<br>
[`contracts`](/shared/src/lib/core/db/entities/Contract.ts) - A group of smart contracts that all share the same ABI.<br>
[`contract_instances`](/shared/src/lib/core/db/entities/ContractInstance.ts) - A smart contract deployed to a specific chain/address.<br>
[`events`](/shared/src/lib/core/db/entities/Event.ts) - An event on Spec that represents something that happened on-chain.<br>
[`event_versions`](/shared/src/lib/core/db/entities/EventVersion.ts) - Version control for events.<br>
[`live_objects`](/shared/src/lib/core/db/entities/LiveObject.ts) - A data model representing some live data on-chain.<br>
[`live_object_versions`](/shared/src/lib/core/db/entities/LiveObjectVersion.ts) - Version control for Live Objects.<br>
[`live_event_versions`](/shared/src/lib/core/db/entities/LiveEventVersion.ts) - A join-table specifying which event versions are associated with which live object versions, either as inputs or outputs.<br>
[`live_call_handlers`](/shared/src/lib/core/db/entities/LiveCallHandler.ts) - A smart contract function whose handler is used as an input to a live object version.<br>

## Indexer Redis


