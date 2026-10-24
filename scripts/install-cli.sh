#!/bin/sh
# Links bin/fly into ${FLY_BIN_DIR:-$HOME/.local/bin}. `pnpm cli:install`
# builds first, since bin/fly runs out/main/cli.js.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
BIN_DIR=${FLY_BIN_DIR:-$HOME/.local/bin}

mkdir -p "$BIN_DIR"
ln -sf "$ROOT/bin/fly" "$BIN_DIR/fly"
echo "fly instalado em $BIN_DIR/fly"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "aviso: $BIN_DIR não está no PATH; adicione ao shell: export PATH=\"$BIN_DIR:\$PATH\"" >&2 ;;
esac
