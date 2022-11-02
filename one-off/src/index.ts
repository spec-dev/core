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
            `CREATE TABLE "sessions" ("id" SERIAL NOT NULL, "uid" character varying NOT NULL, "user_id" integer NOT NULL, "token" character varying NOT NULL, "salt" character varying NOT NULL, "expiration_date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`
        )
        // console.log('TWO')
        // await conn.query(
        //     `CREATE INDEX "trace_to" ON ethereum.traces ("to")`
        // )
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