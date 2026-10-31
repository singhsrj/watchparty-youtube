#!/usr/bin/env bash
# Starts the backend on a throwaway SQLite DB and runs the socket regression tests.
# Used by GitHub Actions, and safe to run locally from anywhere:  bash backend/scripts/run_ci_tests.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Env vars beat .env, so even a developer machine with Neon credentials in .env
# can never point this script at a real database.
export DATABASE_URL="sqlite:///./ci_test.db"
export DATABASE_URL_POOLED=""
rm -f ci_test.db

if curl -sf http://127.0.0.1:8000/health >/dev/null 2>&1; then
  echo "Port 8000 is already in use (is another backend running?). Stop it and retry."; exit 1
fi

LOG="$(mktemp)"
python -m uvicorn main:socket_app --host 127.0.0.1 --port 8000 >"$LOG" 2>&1 &
SERVER_PID=$!
# shellcheck disable=SC2317  # invoked via trap
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true   # let it release port 8000 before we exit
  rm -f ci_test.db
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  curl -sf http://127.0.0.1:8000/health >/dev/null && break
  sleep 1
done
if ! curl -sf http://127.0.0.1:8000/health >/dev/null || ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "Server did not start correctly. Log:"; cat "$LOG"; exit 1
fi

status=0
for t in regression_duplicate_join_test.py regression_host_refresh_test.py; do
  echo "=== $t ==="
  python "$t" || status=1
done

if [ "$status" -ne 0 ]; then echo "--- server log ---"; cat "$LOG"; fi
exit "$status"
