# syntax=docker/dockerfile:1.7
#
# Builds worker-rs from source. Produces a slim runtime image containing
# just the binary + tini.

# ---- build stage ----
FROM rust:1.94-slim AS build

ENV CARGO_HOME=/usr/local/cargo \
    CARGO_TERM_COLOR=always

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential pkg-config libssl-dev ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache deps independently of source.
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src \
    && echo 'fn main() { println!("placeholder"); }' > src/main.rs \
    && echo '' > src/lib.rs \
    && cargo build --release --bin worker-rs \
    && rm -rf src target/release/deps/worker_rs* target/release/worker-rs*

COPY src ./src
RUN cargo build --release --bin worker-rs

# ---- runtime stage ----
FROM debian:bookworm-slim AS runtime

ENV HOME=/home/worker

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libssl3 ca-certificates tini libfontconfig1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 worker

COPY --from=build /app/target/release/worker-rs /usr/local/bin/worker-rs

USER worker
WORKDIR /home/worker

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["worker-rs"]