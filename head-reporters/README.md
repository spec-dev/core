# Head Reporters

The head reporter kicks off new cycles through our data pipeline when new blocks are detected on chain. It currently maintains a websocket connection to Alchemy [in order to detect new heads in the chain](https://docs.alchemy.com/reference/newheads). When a new block head is detected, the head reporter relays it downstream to the [Indexer](/indexers/) to be fully indexed.

**Deployment: 1 per chain**

## Setup

Install all dependencies:
```bash
$ npm install
```

Environment Variables:<br>
TODO

## Run

```bash
$ bin/run
```

## Build Image

```bash
$ bin/build eth
```

## Push Image

```bash
$ bin/push eth
```

## Deploy

```bash
$ bin/deploy <chain>
```