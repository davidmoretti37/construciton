#!/bin/bash
# ============================================================
# Pre-Deploy Validation Script
# Run this before pushing to production to catch issues early.
#
# Usage: bash scripts/pre-deploy.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}PASS${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}FAIL${NC} $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}WARN${NC} $1"; WARN=$((WARN + 1)); }
section() { echo -e "\n${BOLD}$1${NC}"; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  Construction Manager — Pre-Deploy     ${NC}"
echo -e "${BOLD}========================================${NC}"

# ============================================================
section "1. Environment Check"
# ============================================================

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null || echo "none")
if [[ "$NODE_VERSION" == "none" ]]; then
  fail "Node.js not installed"
else
  MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
  if [ "$MAJOR" -ge 18 ]; then
    pass "Node.js $NODE_VERSION (>= 18 required)"
  else
    fail "Node.js $NODE_VERSION (need >= 18)"
  fi
fi

# Check npm
NPM_VERSION=$(npm -v 2>/dev/null || echo "none")
if [[ "$NPM_VERSION" == "none" ]]; then
  fail "npm not installed"
else
  pass "npm $NPM_VERSION"
fi

# ============================================================
section "2. Backend Tests"
# ============================================================

cd "$REPO_ROOT/backend"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "  Installing backend dependencies..."
  npm install --silent 2>/dev/null
fi

# Run tests
echo "  Running backend tests..."
if npm test -- --silent 2>&1 | tail -5 | grep -q "Tests:.*passed"; then
  BACKEND_RESULTS=$(npm test -- --silent 2>&1 | grep "Tests:")
  pass "Backend tests — $BACKEND_RESULTS"
else
  fail "Backend tests failed"
  npm test 2>&1 | tail -20
fi

# ============================================================
section "3. Frontend Tests"
# ============================================================

cd "$REPO_ROOT/frontend"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "  Installing frontend dependencies..."
  npm install --silent --legacy-peer-deps 2>/dev/null
fi

# Run tests
echo "  Running frontend tests..."
if npm test -- --silent 2>&1 | tail -5 | grep -q "Tests:.*passed"; then
  FRONTEND_RESULTS=$(npm test -- --silent 2>&1 | grep "Tests:")
  pass "Frontend tests — $FRONTEND_RESULTS"
else
  fail "Frontend tests failed"
  npm test 2>&1 | tail -20
fi

# ============================================================
section "4. Tool Definition Integrity"
# ============================================================

cd "$REPO_ROOT/backend"

# Quick node check: every tool definition has a handler
TOOL_CHECK=$(SUPABASE_URL=https://test.supabase.co SUPABASE_SERVICE_ROLE_KEY=test node -e "
  const { toolDefinitions } = require('./src/services/tools/definitions');
  const { TOOL_HANDLERS } = require('./src/services/tools/handlers');
  const defined = toolDefinitions.map(t => t.function.name);
  const missing = defined.filter(n => !TOOL_HANDLERS[n]);
  if (missing.length > 0) {
    console.log('MISSING:' + missing.join(','));
    process.exit(1);
  } else {
    console.log('OK:' + defined.length + ' tools');
    process.exit(0);
  }
" 2>&1)

if echo "$TOOL_CHECK" | grep -q "^OK:"; then
  pass "All tool definitions have handlers ($TOOL_CHECK)"
else
  fail "Missing tool handlers: $TOOL_CHECK"
fi

# ============================================================
section "5. Environment Variables"
# ============================================================

# Check .env.example has all required vars
REQUIRED_VARS="SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY OPENROUTER_API_KEY"

for var in $REQUIRED_VARS; do
  if grep -q "$var" "$REPO_ROOT/backend/.env.example" 2>/dev/null; then
    pass "$var documented in .env.example"
  else
    warn "$var missing from .env.example"
  fi
done

# ============================================================
section "6. Security Checks"
# ============================================================

# Check for hardcoded secrets (common patterns)
cd "$REPO_ROOT"
SECRETS_FOUND=0

# Check for hardcoded API keys (excluding .env.example, tests, and node_modules)
for pattern in "sk-[a-zA-Z0-9]{20}" "ghp_[a-zA-Z0-9]{20}" "sk_live_[a-zA-Z0-9]" "password\s*=\s*['\"][^'\"]+['\"]"; do
  MATCHES=$(grep -rn "$pattern" --include="*.js" --include="*.ts" --exclude-dir=node_modules --exclude-dir=__tests__ --exclude-dir=.git "$REPO_ROOT" 2>/dev/null | head -5)
  if [ -n "$MATCHES" ]; then
    warn "Possible hardcoded secret pattern: $pattern"
    echo "$MATCHES" | head -3
    SECRETS_FOUND=$((SECRETS_FOUND + 1))
  fi
done

if [ "$SECRETS_FOUND" -eq 0 ]; then
  pass "No hardcoded secrets detected"
fi

# Check .gitignore has .env
if grep -q "^\.env$" "$REPO_ROOT/.gitignore" 2>/dev/null || grep -q "^\.env$" "$REPO_ROOT/backend/.gitignore" 2>/dev/null; then
  pass ".env is in .gitignore"
else
  warn ".env may not be in .gitignore"
fi

# ============================================================
section "7. Build Check"
# ============================================================

cd "$REPO_ROOT/backend"

# Check that server.js can be loaded without crashing
LOAD_CHECK=$(SUPABASE_URL=https://test.supabase.co SUPABASE_SERVICE_ROLE_KEY=test OPENROUTER_API_KEY=test node -e "
  try {
    require('./src/server');
    console.log('OK');
    process.exit(0);
  } catch(e) {
    console.log('FAIL:' + e.message);
    process.exit(1);
  }
" 2>&1)

if echo "$LOAD_CHECK" | grep -q "OK"; then
  pass "Backend server.js loads without errors"
else
  fail "Backend server.js failed to load: $LOAD_CHECK"
fi

# ============================================================
section "8. Git Status"
# ============================================================

cd "$REPO_ROOT"

# Check for uncommitted changes
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$UNCOMMITTED" -eq 0 ]; then
  pass "Working directory clean"
else
  warn "$UNCOMMITTED uncommitted file(s)"
fi

# Check current branch
BRANCH=$(git branch --show-current 2>/dev/null)
if [ -n "$BRANCH" ]; then
  pass "On branch: $BRANCH"
fi

# ============================================================
section "9. TypeScript Check"
# ============================================================

cd "$REPO_ROOT/frontend"

if [ -d "node_modules" ]; then
  echo "  Running tsc --noEmit..."
  TSC_OUTPUT=$(npx tsc --noEmit 2>&1)
  if echo "$TSC_OUTPUT" | grep -q "error TS"; then
    TS_ERRORS=$(echo "$TSC_OUTPUT" | grep -c "error TS")
    fail "TypeScript — $TS_ERRORS error(s) found"
    echo "$TSC_OUTPUT" | grep "error TS" | head -10
  else
    pass "TypeScript — no errors"
  fi
else
  warn "Frontend node_modules not installed — skipping TypeScript check"
fi

# ============================================================
section "10. Code Quality"
# ============================================================

cd "$REPO_ROOT"

# Check for excessive console.log in production code
CONSOLE_LOGS=$(grep -rn "console\.log" --include="*.js" --include="*.ts" \
  --exclude-dir=node_modules --exclude-dir=__tests__ --exclude-dir=coverage \
  --exclude-dir=__mocks__ --exclude="logger.js" --exclude="*.test.*" \
  --exclude="jest.setup.js" --exclude="jest.config.js" \
  "$REPO_ROOT/backend/src" "$REPO_ROOT/frontend/src" 2>/dev/null | wc -l | tr -d ' ')

if [ "$CONSOLE_LOGS" -gt 100 ]; then
  warn "$CONSOLE_LOGS console.log calls found in src/ (consider using logger utility)"
elif [ "$CONSOLE_LOGS" -gt 0 ]; then
  pass "Console.log usage: $CONSOLE_LOGS calls (acceptable)"
else
  pass "No console.log calls in source code"
fi

# ============================================================
# SUMMARY
# ============================================================

echo -e "\n${BOLD}========================================${NC}"
echo -e "${BOLD}  Results                                ${NC}"
echo -e "${BOLD}========================================${NC}"
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo -e "  ${YELLOW}Warnings: $WARN${NC}"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\n${RED}${BOLD}  DEPLOY BLOCKED — Fix failures above${NC}"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}  READY TO DEPLOY${NC}"
  exit 0
fi
