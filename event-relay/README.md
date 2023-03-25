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

# Deploying to K8S

### Ingress Nginx

```bash
bin/deploy-ingress-nginx <env>
```

### Event Relay (SCC Worker)

```bash
bin/deploy <env>
```

### SCC Broker

```bash
bin/deploy-broker <env>
```

### SCC State Server

```bash
bin/deploy-state <env>
```

# Steps to deploying an update to the event-relay (worker).

1) Update some code

2) Commit that code

3) Build a new image for event-relay

```bash
$ bin/build <env>
```

4) Push that new image

```bash
$ bin/push <env>
```

If you get an auth error, cd out (`cd ..`) into the core directory, source those envs from `.env`, and run `bin/auth_docker`.

^The *tag* for the image will be the sha of the commit you just made.

5) Set the image version you want to deploy as `image_version=` inside `bin/deploy`. By default, the image version used `image_version=$( $shared_bin_dir/latest_sha )` will just be that last commit sha that you made. But if you need to set it to something else more fixed, you can.

6) Deploy

```bash
bin/deploy <env>
```