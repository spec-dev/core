import config from './config'
import { Pool } from 'pg'

// Create connection pool.
export const pool = new Pool({
    host : config.SHARED_TABLES_DB_HOST,
    port : config.SHARED_TABLES_DB_PORT,
    user : config.SHARED_TABLES_DB_USERNAME,
    password : config.SHARED_TABLES_DB_PASSWORD,
    database : config.SHARED_TABLES_DB_NAME,
    min: 2,
    max: 10,
})
pool.on('error', err => console.log('PG client error', err))

async function run() {
    // Get a connection from the pool.
    let conn
    try {
        conn = await pool.connect()
    } catch (err) {
        conn && conn.release()
        console.log(err)
        return
    }

    console.log('Starting query...')

    // Perform the query.
    let error
    try {
        console.log('ONE')
        await conn.query(
            `CREATE INDEX "li_from_type" ON ethereum.latest_interactions ("from", "interaction_type")`
        )
        console.log('TWO')
        await conn.query(
            `CREATE INDEX "li_to_type" ON ethereum.latest_interactions ("to", "interaction_type")`
        )
    } catch (err) {
        error = err
    } finally {
        conn.release()
    }
    if (error) {
        console.log(error)
        return
    }

    console.log('DONE.')
}

run()