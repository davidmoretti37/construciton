#!/bin/bash
# ============================================================
# Post-Deploy Smoke Test
# Runs against a live deployment to verify basic functionality.
#
# Usage: bash scripts/smoke-test.sh https://your-app.up.railway.app
# ============================================================

BASE_URL="${1:-http://localhost:3000}"
FAIL=0
PASS=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'

pass() { echo -e "  ${GREEN}PASS${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}FAIL${NC} $1"; FAIL=$((FAIL + 1)); }

echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  Smoke Test: $BASE_URL${NC}"
echo -e "${BOLD}========================================${NC}"

# ── 1. Health Check ───────────────────────────────────────
echo -e "\n${BOLD}1. Health & Readiness${NC}"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/health")
[ "$STATUS" = "200" ] && pass "/health → 200" || fail "/health → $STATUS (expected 200)"

READY_BODY=$(curl -s --max-time 15 "$BASE_URL/ready")
READY_STATUS=$(echo "$READY_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null)
if [ "$READY_STATUS" = "ready" ] || [ "$READY_STATUS" = "degraded" ]; then
  pass "/ready → $READY_STATUS"
  # Show individual checks
  echo "$READY_BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for k, v in d.get('checks', {}).items():
    s = v.get('status', '?')
    icon = '✓' if s == 'ok' else ('⚠' if s == 'skip' else '✗')
    print(f'    {icon} {k}: {s}')
" 2>/dev/null
else
  fail "/ready → $READY_STATUS (expected ready or degraded)"
fi

# ── 2. Public Pages ───────────────────────────────────────
echo -e "\n${BOLD}2. Public Pages${NC}"

for path in /pricing /privacy /terms /support; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL$path")
  [ "$STATUS" = "200" ] && pass "$path → 200" || fail "$path → $STATUS (expected 200)"
done

# ── 3. Auth Protection ────────────────────────────────────
echo -e "\n${BOLD}3. Auth Protection (should return 401)${NC}"

for path in /api/chat/sessions /api/chat/agent-latest; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL$path")
  [ "$STATUS" = "401" ] && pass "$path → 401" || fail "$path → $STATUS (expected 401)"
done

for path in /api/chat /api/chat/stream /api/chat/agent; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -X POST "$BASE_URL$path" \
    -H "Content-Type: application/json" \
    -d '{"messages":[]}')
  [ "$STATUS" = "401" ] && pass "POST $path → 401" || fail "POST $path → $STATUS (expected 401)"
done

# ── 4. Apple App Site Association ─────────────────────────
echo -e "\n${BOLD}4. Deep Linking${NC}"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/.well-known/apple-app-site-association")
[ "$STATUS" = "200" ] && pass "AASA → 200" || fail "AASA → $STATUS (expected 200)"

# ── 5. 404 Handling ───────────────────────────────────────
echo -e "\n${BOLD}5. Error Handling${NC}"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/api/this-route-does-not-exist")
[ "$STATUS" = "404" ] && pass "Unknown route → 404" || fail "Unknown route → $STATUS (expected 404)"

# ── Summary ───────────────────────────────────────────────
echo -e "\n${BOLD}========================================${NC}"
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo -e "${BOLD}========================================${NC}"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\n${RED}${BOLD}SMOKE TESTS FAILED${NC}"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}ALL SMOKE TESTS PASSED${NC}"
  exit 0
fi
