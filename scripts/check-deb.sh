#!/bin/sh
# Installs a built fly .deb on this machine (a CI runner) and checks what the
# package must provide: Electron's libraries, /usr/bin/fly running the CLI, and
# the window icon and the AppArmor profile in place. A runner already has most
# desktop libraries, so the library check bites on a minimal system (Docker).
set -eu

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "uso: check-deb.sh <arquivo .deb>" >&2
  exit 2
fi
# apt-get takes a local package only by a path with a slash.
deb="$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"

fail() {
  echo "check-deb: $1" >&2
  exit 1
}

# Without recommends, as on a minimal system: what Electron needs must be in
# the package's own Depends.
sudo apt-get install -y --no-install-recommends "$deb"

missing=$(ldd /opt/fly/fly | grep 'not found' || true)
[ -z "$missing" ] || fail "bibliotecas faltando para /opt/fly/fly: $missing"

link=$(readlink -f /usr/bin/fly) || fail "/usr/bin/fly não existe"
[ "$link" = /opt/fly/resources/bin/fly ] ||
  fail "/usr/bin/fly aponta para $link, não para /opt/fly/resources/bin/fly"

help=$(fly help) || fail "fly help falhou"
printf '%s\n' "$help" | grep -q 'fly start' ||
  fail "fly help não lista fly start: $help"

for file in /opt/fly/resources/icon.png /opt/fly/resources/apparmor-profile; do
  [ -f "$file" ] || fail "$file não existe"
done

echo "check-deb: ok ($deb)"
