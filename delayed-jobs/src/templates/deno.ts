export const MAIN_FUNCTION = `
import { serve } from 'https://deno.land/std@0.140.0/http/server.ts'
import LiveObject from './spec.ts'
import uid from './_uid.ts'

serve(async req => {
    const payload = await req.json()
    const liveObject = new LiveObject()
    return await liveObject.main(payload)
})
`
export const EVENT_FUNCTION = `
import { serve } from 'https://deno.land/std@0.140.0/http/server.ts'
import LiveObject from './spec.ts'
import uid from './_uid.ts'

serve(async req => {
    const event = await req.json()
    const liveObject = new LiveObject()
    return await liveObject.handleEvent(event)
})
`