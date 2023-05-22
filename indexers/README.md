# Indexers

The indexer pulls new block head from a Redis queue (Indexer Redis) and fully resolves all data about that block. This includes all primitive data about the block (transactions, traces, logs, etc.) as well as further derived data, such as new contracts, new token transfers, new erc20 balances, etc.

**Deployment: 1 per chain**