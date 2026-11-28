#!/usr/bin/env bash
# Creates the skillfyme-secrets Secret directly in the cluster.
# No secret values are stored in git.
# Usage: POSTGRES_PASSWORD=... [STRIPE_SECRET_KEY=...] ./scripts/create-k8s-secrets.sh [namespace]
set -euo pipefail

NS="${1:-skillfyme-dev}"
: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD (must match the PostgreSQL in the cluster)}"

JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
DATABASE_URL="${DATABASE_URL:-postgresql://skillfyme:${POSTGRES_PASSWORD}@postgres:5432/skillfyme}"
MONGODB_URI="${MONGODB_URI:-mongodb://mongodb:27017/skillfyme}"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-not-configured}"
SMTP_HOST="${SMTP_HOST:-smtp.mailtrap.io}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
FROM_EMAIL="${FROM_EMAIL:-noreply@skillfyme.com}"

kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NS" create secret generic skillfyme-secrets \
  --from-literal=JWT_SECRET="$JWT_SECRET" \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=MONGODB_URI="$MONGODB_URI" \
  --from-literal=STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  --from-literal=SMTP_HOST="$SMTP_HOST" \
  --from-literal=SMTP_PORT="$SMTP_PORT" \
  --from-literal=SMTP_USER="$SMTP_USER" \
  --from-literal=SMTP_PASS="$SMTP_PASS" \
  --from-literal=FROM_EMAIL="$FROM_EMAIL" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secret skillfyme-secrets applied in namespace $NS"
