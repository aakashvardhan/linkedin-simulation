#!/bin/bash
# Simple Integration Test for M3/M4 Backend
# Tests actual working endpoints (not root /)

echo "========================================="
echo "M3/M4 Backend Integration Test"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counter
PASSED=0
FAILED=0

# Helper function to test endpoint
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected_status=$5
    
    echo -e "${BLUE}Testing: ${name}${NC}"
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:8000${endpoint}" \
            -H "Content-Type: application/json" \
            -d "${data}")
    else
        response=$(curl -s -w "\n%{http_code}" "http://localhost:8000${endpoint}")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASSED${NC} - Status: ${http_code}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} - Expected: ${expected_status}, Got: ${http_code}"
        echo "Response: ${body}"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Test 1: Backend is reachable (any endpoint works)
echo ""
echo "=== Test 1: Backend Connectivity ==="
test_endpoint "Job Search Endpoint" "POST" "/jobs/search" '{"keyword":"engineer","limit":1}' "200"
echo ""

# Test 2: Member endpoints
echo "=== Test 2: Member Service ==="
test_endpoint "Member Search" "POST" "/members/search" '{"keyword":"software","limit":1}' "200"
echo ""

# Test 3: Job endpoints  
echo "=== Test 3: Job Service ==="
test_endpoint "Job Search (Python keyword)" "POST" "/jobs/search" '{"keyword":"python","limit":5}' "200"
echo ""

# Test 4: Get specific job (assuming job_id 1 exists)
echo "=== Test 4: Job Details ==="
test_endpoint "Get Job by ID" "POST" "/jobs/get" '{"job_id":1}' "200"
echo ""

# Test 5: Error handling - invalid job ID
echo "=== Test 5: Error Handling ==="
test_endpoint "Invalid Job ID (should 404)" "POST" "/jobs/get" '{"job_id":999999}' "404"
echo ""

# Test 6: Member login (check if test user exists)
echo "=== Test 6: Authentication ==="
test_endpoint "Member Login" "POST" "/members/login" '{"email":"member1@example.com","password":"Test1234!"}' "200"
echo ""

# Summary
echo ""
echo "========================================="
echo "Test Summary"
echo "========================================="
echo -e "${GREEN}Passed: ${PASSED}${NC}"
echo -e "${RED}Failed: ${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! Backend is working correctly.${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Check backend logs.${NC}"
    exit 1
fi
