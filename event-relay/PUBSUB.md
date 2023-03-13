# PubSub example using the event-relay and Spec's event-client

### Pub

```typescript
import { createEventClient } from '@spec.dev/event-client'

// Create event client.
const client = createEventClient({ 
    hostname: 'localhost',
    port: 8888,
    signedAuthToken: '<PUBLISHER_ROLE_KEY>',
})

;(async () => {
    // Publish to a channel.
    await client.socket.transmitPublish('my-channel', { hey: 'there' })
})()
```

### Sub

```typescript
import { createEventClient } from '@spec.dev/event-client'

// Create event client.
const client = createEventClient({ 
    hostname: 'localhost',
    port: 8888,
    signedAuthToken: '<SPEC_PROJECT_API_KEY>',
    onConnect: () => 'Listening for events...'
})

// Subscribe to a channel.
client.on('my-channel', event) => {
    console.log(event)
})
```