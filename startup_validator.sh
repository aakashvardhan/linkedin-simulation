#!/bin/bash
# LinkedIn Simulation - Quick Start & Validation Script
# Run this before testing integration

echo "========================================"
echo "LinkedIn Simulation - Startup Validator"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Docker containers
echo "Checking Docker containers..."
if docker ps | grep -q linkedin_mongo; then
    echo -e "${GREEN}✓ MongoDB container running${NC}"
else
    echo -e "${RED}✗ MongoDB container NOT running${NC}"
    echo -e "${YELLOW}  Starting MongoDB...${NC}"
    docker start linkedin_mongo
fi

if docker ps | grep -q kafka3; then
    echo -e "${GREEN}✓ Kafka container running${NC}"
else
    echo -e "${RED}✗ Kafka container NOT running${NC}"
    echo -e "${YELLOW}  Starting Kafka...${NC}"
    docker start kafka3
fi
echo ""

# Check 2: Redis
echo "Checking Redis..."
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis responding${NC}"
else
    echo -e "${RED}✗ Redis NOT responding${NC}"
    echo -e "${YELLOW}  Try: brew services start redis${NC}"
fi
echo ""

# Check 3: MySQL
echo "Checking MySQL..."
if mysql -u root -p"$(grep MYSQL_PASSWORD ~/linkedin-simulation/backend/.env | cut -d'=' -f2)" -e "USE linkedin_simulation;" 2>/dev/null; then
    echo -e "${GREEN}✓ MySQL accessible${NC}"
    MEMBER_COUNT=$(mysql -u root -p"$(grep MYSQL_PASSWORD ~/linkedin-simulation/backend/.env | cut -d'=' -f2)" -e "USE linkedin_simulation; SELECT COUNT(*) FROM members;" 2>/dev/null | tail -1)
    echo -e "  Members in DB: ${MEMBER_COUNT}"
else
    echo -e "${RED}✗ MySQL connection failed${NC}"
    echo -e "${YELLOW}  Check MYSQL_PASSWORD in ~/linkedin-simulation/backend/.env${NC}"
fi
echo ""

# Check 4: Backend .env configuration
echo "Checking backend configuration..."
if [ -f ~/linkedin-simulation/backend/.env ]; then
    echo -e "${GREEN}✓ .env file exists${NC}"
    
    KAFKA_ENABLED=$(grep ENABLE_KAFKA ~/linkedin-simulation/backend/.env | cut -d'=' -f2)
    REDIS_ENABLED=$(grep ENABLE_REDIS ~/linkedin-simulation/backend/.env | cut -d'=' -f2)
    
    if [ "$KAFKA_ENABLED" = "true" ]; then
        echo -e "${GREEN}✓ Kafka enabled${NC}"
    else
        echo -e "${YELLOW}⚠ Kafka disabled (set ENABLE_KAFKA=true for testing)${NC}"
    fi
    
    if [ "$REDIS_ENABLED" = "true" ]; then
        echo -e "${GREEN}✓ Redis enabled${NC}"
    else
        echo -e "${YELLOW}⚠ Redis disabled (set ENABLE_REDIS=true for testing)${NC}"
    fi
else
    echo -e "${RED}✗ .env file not found${NC}"
    echo -e "${YELLOW}  Copy .env.example to .env and configure${NC}"
fi
echo ""

# Check 5: Backend process
echo "Checking backend process..."
if lsof -i :8000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend running on port 8000${NC}"
    PID=$(lsof -t -i :8000)
    echo -e "  PID: ${PID}"
else
    echo -e "${RED}✗ Backend NOT running${NC}"
    echo -e "${YELLOW}  Start with: cd ~/linkedin-simulation/backend && uvicorn app.main:app --reload --port 8000${NC}"
fi
echo ""

# Check 6: Kafka consumer
echo "Checking Kafka consumer..."
if ps aux | grep -v grep | grep -q "consumer.py"; then
    echo -e "${GREEN}✓ Kafka consumer running${NC}"
else
    echo -e "${YELLOW}⚠ Kafka consumer NOT running${NC}"
    echo -e "${YELLOW}  Start with: cd ~/linkedin-simulation/backend && python consumer.py${NC}"
fi
echo ""

# Check 7: Frontend
echo "Checking frontend..."
if lsof -i :5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend running on port 5173${NC}"
else
    echo -e "${YELLOW}⚠ Frontend NOT running${NC}"
    echo -e "${YELLOW}  Start with: cd ~/linkedin-simulation-fe && npm run dev${NC}"
fi
echo ""

# Check 8: Kafka topics
echo "Checking Kafka topics..."
TOPICS=$(docker exec kafka3 /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server localhost:9092 2>/dev/null | grep -E "(job\.viewed|job\.saved|connection\.requested|profile\.viewed)" | wc -l)
if [ "$TOPICS" -ge 4 ]; then
    echo -e "${GREEN}✓ All 4 Kafka topics exist${NC}"
else
    echo -e "${YELLOW}⚠ Missing Kafka topics (found ${TOPICS}/4)${NC}"
    echo -e "${YELLOW}  Create with: cd ~/linkedin-simulation/backend/scripts && bash create_kafka_topics.sh${NC}"
fi
echo ""

echo "========================================"
echo "Summary"
echo "========================================"
echo ""
echo "Next steps to start your system:"
echo ""
echo "1. Terminal 1 - Infrastructure (if not running):"
echo "   docker start linkedin_mongo kafka3"
echo ""
echo "2. Terminal 2 - Backend:"
echo "   cd ~/linkedin-simulation/backend"
echo "   uvicorn app.main:app --reload --port 8000"
echo ""
echo "3. Terminal 3 - Kafka Consumer:"
echo "   cd ~/linkedin-simulation/backend"
echo "   python consumer.py"
echo ""
echo "4. Terminal 4 - Frontend:"
echo "   cd ~/linkedin-simulation-fe"
echo "   npm run dev"
echo ""
echo "Then test with:"
echo "   curl -X POST http://localhost:8000/jobs/search -H \"Content-Type: application/json\" -d '{\"keyword\":\"engineer\"}'"
echo ""
