## Current publish process for a new Live Object Version

1. Create the live object table in Postgres (Ex: `station.membership`).

2. Create the ops table for the live object (Ex. `station.membership_ops`). See `shared/sql/add-ops-tables-for-primitives.ql` for examples.

3. Add `INSERT` and `UPDATE` ops triggers to the live object table (see `shared/sql/ops-trigger.sql`).

4. Register the live object table in the `op_tracking` table for each of the chains it uses.

5. If not already done, create a new database user (in shared tables) with name "<namespace>" (<--name of the live object's namespace).

	- Grant this DB user full write permissions to all tables in the "<namespace>" schema
	- Grant this DB user read-only access to all tables in all other schemas
	- Grant all other DB users read-only access to this schema

6. Publish the live object version by hitting `/admin/live-object-version/publish` with a manually built payload. Ex:

    ```json
    {
        "namespace": "station",
        "name": "Membership",
        "version": "0.0.1",
        "displayName": "Station Memberships",
        "description": "A Membership NFT on Station.",
        "chains": [1, 5, 137],
        "properties": [
            { "name": "contractAddress", "type": "Address", "desc": "The membership contract." },
            { "name": "tokenId", "type": "BigInt", "desc": "The NFT token id." },
            { "name": "ownerAddress", "type": "Address", "desc": "The current NFT owner." },
            { "name": "tbaAddress", "type": "Address", "desc": "The token-bound account." },
            { "name": "joinedAt", "type": "Timestamp", "desc": "When the membership was minted." },
            { "name": "blockHash", "type": "BlockHash", "desc": "The block hash in which the Membership was last updated." },
            { "name": "blockNumber", "type": "BlockNumber", "desc": "The block number in which the Membership was last updated." },
            { "name": "blockTimestamp", "type": "Timestamp", "desc": "The block timestamp in which the Membership was last updated." },
            { "name": "chainId", "type": "ChainId", "desc": "The blockchain id." }
        ],
        "config": {
            "folder": "Membership",
            "primaryTimestampProperty": "blockTimestamp",
            "uniqueBy": [["contractAddress", "tokenId", "chainId"]],
            "table": "station.membership",
            "chains": {"1": {}, "5": {}, "137": {}}
        },
        "inputEvents": [
            "eth.contracts.station.Membership.Transfer@0.0.1",
            "goerli.contracts.station.Membership.Transfer@0.0.1",
            "polygon.contracts.station.Membership.Transfer@0.0.1"
        ],
        "inputCalls": []
    }
    ```

7. Manually deploy the live object version to Deno:

	- Replace `@spec.dev/core` with the full url import from `esm.sh` at the top of `spec.ts`
	- Copy `core/live-object-entrypoint.ts` into the live object folder at `index.ts`
	- Run `deployctl deploy --project=event-generators index.ts`

8. Update the live object version's `url` column with the url of the Deno function just created.

9. Hit `/admin/live-object-version/index` to kick off the `indexLiveObjectVersion` delayed job. This will index all data for the live object up til now.

10. Manually add any other Postgres indexes to the live object table that might speed up lookups (will be configurable by our end users in the future).