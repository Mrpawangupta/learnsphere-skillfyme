#!/usr/bin/env bash
# Task 1 verification: real authentication against the running stack.
BASE="${BASE:-http://localhost:4000}"
EMAIL="auth-$(date +%s)@skillfyme.com"

redact() { sed -E 's/"token":"[^"]*"/"token":"<redacted>"/'; }

call() {
  echo "--- $1 ---"
  curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE$2" \
    -H "Content-Type: application/json" -d "$3" | redact
}

echo "== Task 1 AFTER: real authentication =="
call "register new user (expect 201)" /api/auth/register \
  "{\"name\":\"Auth Check\",\"email\":\"$EMAIL\",\"password\":\"password123\"}"
call "duplicate register (expect 409)" /api/auth/register \
  "{\"name\":\"Auth Check\",\"email\":\"$EMAIL\",\"password\":\"password123\"}"
call "login, correct password (expect 200)" /api/auth/login \
  "{\"email\":\"$EMAIL\",\"password\":\"password123\"}"
call "login, wrong password (expect 401)" /api/auth/login \
  "{\"email\":\"$EMAIL\",\"password\":\"definitely-wrong-123\"}"
call "login, short wrong password (expect 401, not 400)" /api/auth/login \
  "{\"email\":\"$EMAIL\",\"password\":\"x\"}"
call "login, email never registered (expect 401)" /api/auth/login \
  '{"email":"nobody-xyz@skillfyme.com","password":"password123"}'

echo "--- stored password is a bcrypt hash, not plain text ---"
docker exec skillfyme-postgres psql -U skillfyme \
  -c "SELECT email, left(password_hash, 7) AS hash_prefix FROM users;"