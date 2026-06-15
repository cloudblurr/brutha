#!/bin/sh
# Container entrypoint.
#
# Persistent-volume permission fix: when a platform (Render/Railway/Fly/compose)
# mounts a volume at /app/data, it is often owned by root or a host uid the
# runtime user can't write to — which makes better-sqlite3 fail with
# SQLITE_CANTOPEN and every DB route return 500. We start as root, take
# ownership of the data dir, then drop to the unprivileged 'nextjs' user via
# gosu before launching the server.
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR"

# Only chown if we're root (some platforms already run as the right uid).
if [ "$(id -u)" = "0" ]; then
  chown -R nextjs:nodejs "$DATA_DIR" || true
  exec gosu nextjs:nodejs "$@"
fi

# Already non-root: just run.
exec "$@"
