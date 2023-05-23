# Delayed Jobs

A delayed job is a long-running process (typically kicked off by a Core API route) that is used to perform operations that may take longer than max HTTP response time. 

**Deployment: 1 in total**

## Database Connections

Ensure the following Postgres and Redis instances have been set up locally:

* [Core DB](/#local-setup-2)
* [Shared Tables](#local-setup-1)
* Indexer Redis
* ABI Redis

## Setup

#### 1) Install dependencies

```bash
$ npm install
```

#### 2) Set the following environment variables

```
export ENV=local
export ETHERSCAN_API_KEY=FBMK654QI5CTIYA7G8M7T7XEBGNHJSV1VG
export GOERLISCAN_API_KEY=GS15VFJYHV3MM59STHP8FCSK43KDNX644B
export POLYGONSCAN_API_KEY=4WZRNWR723YH4C9HC3IIUSMY61N2ZQ4NDZ
export MUMBAISCAN_API_KEY=GM39IS4H1W78RGKIIUTA329FUIIUTNRJXI
```

#### 3) Make sure Postgres and Redis are both running

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