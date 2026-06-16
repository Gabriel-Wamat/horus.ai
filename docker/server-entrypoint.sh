#!/bin/sh
set -eu

seed_dir="${HORUS_SEED_DATA_DIR:-/app/seed-data}"
data_dir="${HORUS_DATA_DIR:-/app/.horus/data}"
persistence_driver="${PERSISTENCE_DRIVER:-file}"

if [ "$persistence_driver" = "file" ] && [ -d "$seed_dir" ]; then
  mkdir -p "$data_dir"
  existing_entry="$(find "$data_dir" -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1 || true)"
  if [ -z "$existing_entry" ]; then
    cp -a "$seed_dir/." "$data_dir/"
    echo "[horus:seed] initialized HORUS_DATA_DIR from bundled seed data"
  else
    echo "[horus:seed] HORUS_DATA_DIR already has data; bundled seed was not applied"
  fi
fi

node dist/infrastructure/database/migrateCli.js
exec node dist/main.js
