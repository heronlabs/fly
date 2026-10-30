#!/bin/sh
# Creates fly's self-signed code-signing certificate: <dir>/fly-signing.p12 and
# <dir>/fly-signing.password. The release workflow signs the app with it
# (secrets MAC_CERT_P12, the p12 in base64, and MAC_CERT_PASSWORD), so macOS
# keeps the permissions given to fly across versions.
#
# Run it once. A new certificate is a new identity to macOS: every user grants
# fly's permissions again. Keep both files in a password manager, set them as
# secrets of the GitHub environment `release`, then delete them; they never go
# into a repository.
set -eu

DIR=${1:?usage: make-signing-cert.sh <dir outside any repository>}
mkdir -p "$DIR"
P12="$DIR/fly-signing.p12"
PASSWORD_FILE="$DIR/fly-signing.password"
[ -e "$P12" ] && { echo "$P12 already exists" >&2; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
umask 077

cat >"$WORK/cert.cnf" <<'EOF'
[req]
distinguished_name = dn
prompt = no
x509_extensions = ext
[dn]
CN = heronlabs fly
O = Heron Labs
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF

# LibreSSL's /usr/bin/openssl writes a p12 that `security import` reads.
/usr/bin/openssl rand -base64 32 | tr -d '\n' >"$PASSWORD_FILE"
/usr/bin/openssl req -x509 -newkey rsa:3072 -nodes -days 7300 \
  -config "$WORK/cert.cnf" -keyout "$WORK/key.pem" -out "$WORK/cert.pem" 2>/dev/null
/usr/bin/openssl pkcs12 -export -name 'heronlabs fly' \
  -inkey "$WORK/key.pem" -in "$WORK/cert.pem" \
  -out "$P12" -passout "file:$PASSWORD_FILE"

/usr/bin/openssl x509 -in "$WORK/cert.pem" -noout -subject -enddate -fingerprint -sha1
echo "Gerados $P12 e $PASSWORD_FILE"
