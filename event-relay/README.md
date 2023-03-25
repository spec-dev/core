# Event Relay

The Socketcluster powering Spec's event network.

![](https://dbjzhg7yxqn0y.cloudfront.net/event-relay-architecture.png)

# Dev Cluster PubSub

### Pub

```typescript
import { createEventClient } from '@spec.dev/event-client'

// Create event client.
const client = createEventClient({ 
    hostname: 'events-dev.spec.dev',
    signedAuthToken: '<PUBLISHER_ROLE_KEY>',
})

;(async () => {
    // Publish to a channel.
    await client.socket.transmitPublish('my.channel@0.0.1', { hey: 'there' })
})()
```

### Sub

```typescript
import { createEventClient } from '@spec.dev/event-client'

// Create event client.
const client = createEventClient({ 
    hostname: 'events-dev.spec.dev',
    signedAuthToken: '<SPEC_PROJECT_API_KEY>',
    onConnect: () => 'Listening for events...'
})

// Subscribe to a channel.
client.on('my.channel@0.0.1', event) => {
    console.log(event)
})
```

# Local PubSub

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
    await client.socket.transmitPublish('my.channel@0.0.1', { hey: 'there' })
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
client.on('my.channel@0.0.1', event) => {
    console.log(event)
})
```
