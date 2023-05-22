# Indexers

The indexer pulls new block heads (number + hash) from a Redis queue, and then fully resolves all data about that block. This includes all primitive data about the block (transactions, traces, logs, etc.) as well as further derived data, such as new contracts, new token transfers, new erc20 balances, etc.