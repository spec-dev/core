# Head Reporter

The head reporter kicks off a new cycle through our data pipeline when a new block (head) is detected on chain. It currently maintains a websocket connection to Alchemy [in order to detect new heads in the chain](https://docs.alchemy.com/reference/newheads). When a new block head is detected, the head reporter relays it downstream to the [Indexer](/indexers/) to be fully indexed.