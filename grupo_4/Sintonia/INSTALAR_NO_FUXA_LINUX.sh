#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo "Uso: $0 /caminho/do/FUXA" >&2
  exit 2
fi
ROOT="$1"
SOURCE="$(cd "$(dirname "$0")" && pwd)/resources/pid-tuning"
DEST="$ROOT/_appdata/_upload_files/pid-tuning"
mkdir -p "$DEST"
cp -a "$SOURCE/." "$DEST/"
echo "Tela instalada em: $DEST"
echo "URL esperada: http://localhost:1881/resources/pid-tuning/index.html"
