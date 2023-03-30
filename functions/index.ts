import { serve } from 'https://deno.land/std@0.150.0/http/server.ts'
import { PublishEventQueue, StringKeyMap, SpecEvent } from 'https://esm.sh/@spec.dev/core@0.0.62'
import LiveObject from './spec.ts'
import jwt from 'https://esm.sh/jsonwebtoken@8.5.1'

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
        const claims = jwt.verify(token, config.JWT_SECRET)
        return claims?.role === config.JWT_ROLE
    } catch (err) {
        console.error(err)
        return false
    }
}

function authRequest(req: any): StringKeyMap {
    const headers = req.headers || {}
    const authToken = headers.get(headerNames.AUTH_TOKEN) || headers.get(headerNames.AUTH_TOKEN.toLowerCase())

    if (!authToken || !(verifyJWT(authToken))) {
        return { isAuthed: false }
    }

    const tablesApiToken = (
        headers.get(headerNames.TABLES_AUTH_TOKEN) || 
        headers.get(headerNames.TABLES_AUTH_TOKEN.toLowerCase())
    )
    
    return { isAuthed: true, tablesApiToken }
}

async function parseEventsFromPayload(req: any): Promise<SpecEvent[]> {
    let events
    try {
        events = (await req.json()) || []
    } catch (err) {
        return null
    }
    for (const event of events) {
        if (!event.name || !event.data || !event.origin) {
            return null
        }
    }
    return events as SpecEvent[]
}

serve(async (req: Request) => {
    // Auth the request and get the API token to use for queries to shared tables.
    const { isAuthed, tablesApiToken } = authRequest(req)
    if (!isAuthed) {
        return resp({ error: errors.UNAUTHORIZED }, codes.UNAUTHORIZED)
    }

    // The request payload should just be the input events.
    const inputEvents = await parseEventsFromPayload(req)
    if (inputEvents === null) {
        return resp({ error: errors.INVALID_PAYLOAD }, codes.BAD_REQUEST)
    }
    if (!inputEvents.length) {
        return resp([])
    }

    // Process input events in series.
    const allPublishedEvents = []
    for (const inputEvent of inputEvents) {
        // Create the live object with a single event queue instance to capture published events.
        const publishedEventQueue = new PublishEventQueue()
        const liveObject = new LiveObject(publishedEventQueue)
        liveObject._tablesApiToken = tablesApiToken

        // Handle the event and auto-save.
        try {
            await liveObject.handleEvent(inputEvent)
            await liveObject.save()
        } catch (err) {
            console.error(err)
            return resp({ error: err?.message || err }, codes.INTERNAL_SERVER_ERROR)
        }
        allPublishedEvents.push(liveObject._publishedEvents)
    }

    // Return all generated events to be published.
    return resp(allPublishedEvents)
})