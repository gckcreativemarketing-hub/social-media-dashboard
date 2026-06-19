#!/bin/bash
# deploy-ftp.sh — Deploy ke Hostinger Business Web Hosting via FTP
set -e

if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

FTP_HOST="${FTP_HOST}"
FTP_USER="${FTP_USER}"
FTP_PASS="${FTP_PASS}"
REMOTE_DIR="${FTP_REMOTE_DIR:-/dashboard-sosmed}"

if [ -z "$FTP_HOST" ] || [ -z "$FTP_USER" ] || [ -z "$FTP_PASS" ]; then
  echo "❌ Isi FTP_HOST, FTP_USER, FTP_PASS di .env dulu"
  exit 1
fi

echo "→ Upload ke ftp://${FTP_HOST}${REMOTE_DIR}"

# Cek lftp tersedia
if ! command -v lftp &>/dev/null; then
  echo "→ Install lftp dulu: brew install lftp"
  exit 1
fi

lftp -c "
  set ftp:ssl-allow no
  open -u '${FTP_USER}','${FTP_PASS}' '${FTP_HOST}'
  mirror -R --delete --verbose \
    --exclude .env \
    --exclude .git \
    --exclude deploy_package.zip \
    --exclude deploy-ftp.sh \
    --exclude deploy.sh \
    . ${REMOTE_DIR}
  bye
"

echo ""
echo "✅ Upload selesai!"
echo "→ Sekarang setup Node.js di hPanel (lihat instruksi di README deploy)"
