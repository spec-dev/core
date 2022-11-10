import logger from '../lib/logger'
import { SharedTables } from '../lib/shared-tables/db/dataSource'
import { exit } from 'process'

const query = `
INSERT INTO ethereum.latest_interactions (
    "from",
    "to",
    "timestamp",
    interaction_type,
    "hash",
    block_hash,
    block_number
) (
    SELECT DISTINCT ON ("from", "to")
        "from",
        "to",
        block_timestamp as "timestamp",
        CASE
            WHEN EXISTS (SELECT 1 FROM ethereum.contracts where "address" = "from") AND EXISTS (SELECT 1 FROM ethereum.contracts where "address" = "to") THEN 'contract:contract' 
            WHEN EXISTS (SELECT 1 FROM ethereum.contracts where "address" = "from") THEN 'contract:wallet'
            WHEN EXISTS (SELECT 1 FROM ethereum.contracts where "address" = "to") THEN 'wallet:contract' 
            ELSE 'wallet:wallet'
        END interaction_type,
        transaction_hash as "hash",
        block_hash,
        block_number
    FROM ethereum.traces
    WHERE "from" IS NOT NULL AND "to" IS NOT NULL AND block_number < 15937679
    ORDER BY "from", "to", block_timestamp DESC
) ON CONFLICT ("from", "to") DO 
UPDATE SET 
    "timestamp" = EXCLUDED.timestamp,
    interaction_type = EXCLUDED.interaction_type,
    "hash" = EXCLUDED.hash,
    block_hash = EXCLUDED.block_hash,
    block_number = EXCLUDED.block_number
WHERE ethereum.latest_interactions.block_number < EXCLUDED.block_number;
`
async function perform() {
    await SharedTables.initialize()
    await SharedTables.query(query)
    logger.info('Success')
    exit(0)
}

export default perform
