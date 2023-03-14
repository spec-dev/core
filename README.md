# Spec Core Microservices

![](https://dbjzhg7yxqn0y.cloudfront.net/v1/overview.png)

## Requirements

- node >= 16
- npm >= 8
- postgres >= 14
- redis >= 6
- docker

## Setup

Create spec user:

```bash
$ createuser spec
```

Create databases:

```bash
$ createdb core
$ createdb indexer
$ createdb shared-tables
```

Run initial migrations:

```
$ cd shared
$ bin/migrate core
$ bin/migrate indexer
$ psql -d shared-tables -f bin/create-ethereum-primitives.sql
$ psql -d shared-tables -f bin/create-goerli-primitives.sql
$ psql -d shared-tables -f bin/create-polygon-primitives.sql
$ psql -d shared-tables -f bin/create-mumbai-primitives.sql
```