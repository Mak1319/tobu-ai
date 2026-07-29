#!/usr/bin/env bash
# Print the dev LiveKit key/secret pair used by docker-compose.
#
# Useful when setting up a fresh .env: drop these into LIVEKIT_API_KEY
# and LIVEKIT_API_SECRET so the livekit server and the livekit-agent
# worker agree on the same credentials.
set -euo pipefail

# Read from the repo root .env if present, otherwise fall back to the
# defaults documented in agent/.env.example.
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/.." && pwd)/.env}"

KEY="${LIVEKIT_API_KEY:-devkey}"
SECRET="${LIVEKIT_API_SECRET:-secret}"

if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
    KEY="${LIVEKIT_API_KEY:-devkey}"
    SECRET="${LIVEKIT_API_SECRET:-secret}"
fi

cat <<EOF
# Drop these into your .env (matches docker-compose.yaml + agent/.env.example).
LIVEKIT_API_KEY=$KEY
LIVEKIT_API_SECRET=$SECRET
LIVEKIT_URL=ws://localhost:7880
EOF
