#!/usr/bin/env bash
# ================================================================
# PDP v0.6 — Local Verification Script
# Run this after: cd pdp-v06-final && bash verify-local.sh
# ================================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✅ PASS${NC} $1"; }
fail() { echo -e "${RED}❌ FAIL${NC} $1"; FAILED=$((FAILED+1)); }
info() { echo -e "${YELLOW}ℹ️  INFO${NC} $1"; }
FAILED=0

echo "================================================================"
echo "PDP v0.6 — Pre-Deploy Verification"
echo "================================================================"
echo ""

# 1. Node version
echo "--- 1. Environment ---"
node --version && pass "Node.js present" || fail "Node.js missing"
npm --version  && pass "npm present"     || fail "npm missing"
echo ""

# 2. npm install
echo "--- 2. npm install ---"
npm install 2>&1
if [ $? -eq 0 ]; then
  pass "npm install completed"
else
  fail "npm install failed"
  exit 1
fi
echo ""

# 3. TypeScript check
echo "--- 3. TypeScript (tsc --noEmit) ---"
npx tsc --noEmit 2>&1
if [ $? -eq 0 ]; then
  pass "Zero TypeScript errors"
else
  fail "TypeScript errors found"
fi
echo ""

# 4. ESLint
echo "--- 4. ESLint (next lint) ---"
npm run lint 2>&1
if [ $? -eq 0 ]; then
  pass "Zero ESLint errors"
else
  fail "ESLint errors found"
fi
echo ""

# 5. Production build
echo "--- 5. npm run build ---"
npm run build 2>&1
if [ $? -eq 0 ]; then
  pass "Build succeeded"
else
  fail "Build failed"
fi
echo ""

# 6. Security checks
echo "--- 6. Security audit ---"
# No USPS content in prompts
if grep -rq "postal service\|usps" app/lib/prompts.ts 2>/dev/null; then
  fail "USPS content found in prompts"
else
  pass "No USPS content in prompts (only in forbidden filter)"
fi

# Owner routes protected
for f in create list update delete; do
  if grep -q "validateOwnerSecret" app/api/promo/$f/route.ts 2>/dev/null; then
    pass "promo/$f is owner-protected"
  else
    fail "promo/$f is NOT protected"
  fi
done

# JWT auth on user routes
for route in "app/api/writing-dna/route.ts" "app/api/users/route.ts"; do
  if grep -q "getVerifiedUserId" $route 2>/dev/null; then
    pass "$route has JWT auth"
  else
    fail "$route missing JWT auth"
  fi
done

# Atomic promo RPC in migrations
if grep -q "increment_promo_usage" supabase/migrations/001_initial_schema.sql; then
  pass "Atomic promo RPC in migration 001"
else
  fail "Atomic promo RPC missing from migration 001"
fi

# RLS enabled on all tables
RLS_COUNT=$(grep -c "enable row level security" supabase/migrations/001_initial_schema.sql)
if [ "$RLS_COUNT" -ge 7 ]; then
  pass "RLS enabled on $RLS_COUNT tables"
else
  fail "Only $RLS_COUNT tables have RLS (expected 7)"
fi

# No TODO/FIXME stubs
if grep -rn "TODO\|FIXME\|HACK" app/ lib/ types/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -qv "node_modules"; then
  fail "TODO/FIXME found in source"
else
  pass "No TODO/FIXME stubs"
fi

# Model name
if grep -q "claude-sonnet-4-6" app/api/generate/route.ts; then
  pass "Anthropic model: claude-sonnet-4-6"
else
  fail "Model name not found in generate route"
fi

echo ""
echo "================================================================"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}ALL CHECKS PASSED — READY TO DEPLOY${NC}"
else
  echo -e "${RED}$FAILED CHECK(S) FAILED — SEE ABOVE${NC}"
fi
echo "================================================================"
exit $FAILED
