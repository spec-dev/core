# Spec Core

Welcome to Spec's core microservices :)

## Full-Stack Requirements

- node >= 16
- npm >= 8
- postgres >= 14
- redis >= 6
- docker
- Rust
- Deno >= 1.3 (+recommend the Deno/Denoland VSCode extension)

Installing Node.js with `nvm` on Mac:<br>
https://collabnix.com/how-to-install-and-configure-nvm-on-mac-os/

Installing Postgres with brew:<br>
https://gist.github.com/ibraheem4/ce5ccd3e4d7a65589ce84f2a3b7c23a3

Installing Redis:<br>
https://redis.io/docs/getting-started/installation/install-redis-on-mac-os/

Installing Docker:<br>
https://docs.docker.com/desktop/install/mac-install/

Installing Rust with `rustup`:
```bash
$ curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Installing Deno:<br>
https://deno.com/manual@v1.33.1/getting_started/installation)

# Data Pipeline

The backbone of Spec is its indexing pipeline, which ingests data from a variety of blockchains, uses it to curate data for higher-level data models, and then publishes these data changes downstream to customers' databases.

![](https://dbjzhg7yxqn0y.cloudfront.net/data-pipeline.png)

# Full Stack App

The infrastructure that end-users interact with follows more of the classic `Client` -> `Server` -> `Database` pattern and resembles the following: 

![](https://dbjzhg7yxqn0y.cloudfront.net/full-stack.png)