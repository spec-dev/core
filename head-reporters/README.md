# Head Reporter

The head reporter kicks off a new cycle through the data pipeline when a new block is detected on-chain. It maintains a websocket connection to Alchemy [in order to detect new heads in the chain](https://docs.alchemy.com/reference/newheads). When a new block head is detected, the head reporter relays it downstream to the [Indexer](/indexers/) to be fully indexed.

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
$ bin/build
```

## Push Image

```bash
$ bin/push
```

## Deploy

```bash
$ bin/deploy <eth|goerli|polygon|mumbai>
```