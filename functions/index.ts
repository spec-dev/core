import { serve } from 'https://deno.land/std@0.150.0/http/server.ts'
import { PublishEventQueue, StringKeyMap, SpecEvent } from 'https://esm.sh/@spec.dev/core@0.0.19'
import LiveObject from './spec.ts'
import pgFormat from 'https://deno.land/x/pg_format@v1.0.0/index.js'
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts"

// Hack for cross-platform Deno + Node support.
globalThis.ident = pgFormat.ident
globalThis.literal = pgFormat.literal

const errors = {
    INVALID_PAYLOAD: 'Invalid payload',
    UNAUTHORIZED: 'Unauthorized request',
}

const codes = {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    INTERNAL_SERVER_ERROR: 500,
}

const headerNames = {
    AUTH_TOKEN: 'Spec-Auth-Token',
    TABLES_AUTH_TOKEN: 'Spec-Tables-Auth-Token',
}

const config = {
    // @ts-ignore
    JWT_SECRET: Deno.env.get('JWT_SECRET'),
    JWT_ROLE: 'internal',
}

if (!config.JWT_SECRET) {
    throw `"JWT_SECRET" environment variable required.`
}

function resp(data: StringKeyMap, code: number = codes.SUCCESS): Response {
    return new Response(JSON.stringify(data), {
        status: code,
        headers: { 'Content-Type': 'application/json' },
    })
}

function verifyJWT(token: string): boolean {
    try {
        const claims = verify(token, config.JWT_SECRET)
        return claims?.role === config.JWT_ROLE
    } catch (err) {
        return false
    }
}

function authRequest(req: any): StringKeyMap {
    const headers = req.headers || {}
    const authToken = (
        headers[headerNames.AUTH_TOKEN] || 
        headers[headerNames.AUTH_TOKEN.toLowerCase()]
    )

    if (!authToken || !verifyJWT(authToken)) {
        return { isAuthed: false }
    }

    const tablesApiToken = (
        headers[headerNames.TABLES_AUTH_TOKEN] || 
        headers[headerNames.TABLES_AUTH_TOKEN.toLowerCase()]
    )

    return { isAuthed: true, tablesApiToken }
}

async function parsePayloadAsEvent(req: any): SpecEvent {
    let event
    try {
        event = (await req.json()) || {}
    } catch (err) {
        return null
    }
    if (!event.id || !event.name || !event.data || !event.origin) {
        return null
    }
    return event as SpecEvent
}

serve(async req => {
    // Auth the request and get the API token to use for queries to shared tables.
    const { isAuthed, tablesApiToken } = authRequest(req)
    if (isAuthed) {
        return resp({ error: errors.UNAUTHORIZED }, codes.UNAUTHORIZED)
    }

    // The request payload should just be the Spec event.
    const event = await parsePayloadAsEvent(req)
    if (!event) {
        return resp({ error: errors.INVALID_PAYLOAD }, codes.BAD_REQUEST)
    }

    // Create the live object with a single event queue instance to capture published events.
    const publishedEventQueue = new PublishEventQueue()
    const liveObject = new LiveObject(publishedEventQueue)
    liveObject.tablesApiToken = tablesApiToken

    // Handle the event and auto-save.
    try {
        await liveObject.handleEvent(event)
        await liveObject.save()
    } catch (err) {
        return resp({ error: err?.message || err }, codes.INTERNAL_SERVER_ERROR)
    }

    // Return the resulting events that should be published.
    return resp(liveObject.publishedEvents)
})