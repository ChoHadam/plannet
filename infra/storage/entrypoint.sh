#!/usr/bin/env bash
set -euo pipefail

# Compose file secrets retain host ownership on Linux. Keep host sources 0600,
# and copy into a private tmpfs readable by the image's postgres user.
chown postgres:postgres /run/plannet
chmod 0700 /run/plannet
for name in admin_password app_password; do
  install -m 0600 -o postgres -g postgres "/run/secrets/$name" "/run/plannet/$name"
done
exec /usr/local/bin/docker-entrypoint.sh "$@"
