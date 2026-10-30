#!/bin/sh
# Builds the keychain the release signs with and prints its path, for
# CSC_KEYCHAIN. Reads MAC_CERT_P12 (make-signing-cert.sh's p12 in base64) and
# MAC_CERT_PASSWORD. electron-builder's own CSC_LINK import is not used: it
# runs `set-key-partition-list` with the p12's password instead of the
# keychain's, which fails.
set -eu

: "${MAC_CERT_P12:?secret MAC_CERT_P12 missing}"
: "${MAC_CERT_PASSWORD:?secret MAC_CERT_PASSWORD missing}"
DIR=${1:?usage: signing-keychain.sh <dir>}
KEYCHAIN="$DIR/fly-signing.keychain-db"
P12="$DIR/fly-signing.p12"
PASSWORD=$(/usr/bin/openssl rand -base64 32)

umask 077
trap 'rm -f "$P12"' EXIT
printf '%s' "$MAC_CERT_P12" | /usr/bin/base64 --decode >"$P12"
security create-keychain -p "$PASSWORD" "$KEYCHAIN"
security set-keychain-settings "$KEYCHAIN"
security unlock-keychain -p "$PASSWORD" "$KEYCHAIN"
# -x: the key can sign but never be exported, even by code that runs later
# in the job while the keychain is unlocked.
security import "$P12" -k "$KEYCHAIN" -P "$MAC_CERT_PASSWORD" -x -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$PASSWORD" "$KEYCHAIN" >/dev/null
echo "$KEYCHAIN"
