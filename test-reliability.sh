#!/bin/bash

# Nostria Relay Monitor - Reliability Testing Script
# Tests various failure scenarios to ensure the application handles them gracefully

APP_URL="http://localhost:3000"
HEALTH_URL="$APP_URL/health"
API_URL="$APP_URL/api/status"

echo "🧪 Starting Nostria Relay Monitor Reliability Tests..."
echo "=================================================="

# Function to check if relay monitor is responding
check_service() {
    local url=$1
    local expected_status=${2:-200}
    
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url")
    if [ "$response" = "$expected_status" ]; then
        echo "✅ $url returned $response"
        return 0
    else
        echo "❌ $url returned $response (expected $expected_status)"
        return 1
    fi
}

# Function to test high load
test_high_load() {
    echo -e "\n📊 Testing high load (50 concurrent requests)..."
    
    for i in {1..50}; do
        curl -s "$HEALTH_URL" > /dev/null &
    done
    
    wait
    sleep 2
    
    if check_service "$HEALTH_URL"; then
        echo "✅ Relay monitor survived high load test"
        return 0
    else
        echo "❌ Relay monitor failed under high load"
        return 1
    fi
}

# Function to test invalid requests
test_invalid_requests() {
    echo -e "\n🚨 Testing invalid requests..."
    
    # Test invalid path
    check_service "$APP_URL/invalid-path" 404
    
    # Test malformed API request
    curl -s -X POST -H "Content-Type: application/json" -d '{"invalid": json}' "$API_URL" > /dev/null
    
    # Check if relay monitor is still responding
    if check_service "$HEALTH_URL"; then
        echo "✅ Relay monitor handled invalid requests gracefully"
        return 0
    else
        echo "❌ Relay monitor failed after invalid requests"
        return 1
    fi
}

# Function to test memory pressure
test_memory_pressure() {
    echo -e "\n💾 Testing memory pressure (large requests)..."
    
    # Send large payload
    large_data=$(python3 -c "print('x' * 50000)")
    curl -s -X POST -H "Content-Type: application/json" -d "{\"data\":\"$large_data\"}" "$API_URL" > /dev/null
    
    sleep 2
    
    if check_service "$HEALTH_URL"; then
        echo "✅ Relay monitor handled memory pressure test"
        return 0
    else
        echo "❌ Relay monitor failed memory pressure test"
        return 1
    fi
}

# Function to test timeout handling
test_timeout_handling() {
    echo -e "\n⏱️  Testing timeout handling..."
    
    # Make request that should timeout
    timeout 2s curl -s --max-time 35 "$HEALTH_URL" > /dev/null
    
    sleep 1
    
    if check_service "$HEALTH_URL"; then
        echo "✅ Relay monitor handled timeout scenarios"
        return 0
    else
        echo "❌ Relay monitor failed timeout handling test"
        return 1
    fi
}

# Main test execution
main() {
    local failed_tests=0
    
    # Initial health check
    echo "🏥 Initial health check..."
    if ! check_service "$HEALTH_URL"; then
        echo "❌ Relay monitor is not responding. Please start the application first."
        exit 1
    fi
    
    # Run tests
    test_high_load || ((failed_tests++))
    test_invalid_requests || ((failed_tests++))
    test_memory_pressure || ((failed_tests++))
    test_timeout_handling || ((failed_tests++))
    
    # Final health check
    echo -e "\n🏥 Final health check..."
    if check_service "$HEALTH_URL"; then
        echo "✅ Relay monitor is still healthy after all tests"
    else
        echo "❌ Relay monitor is unhealthy after tests"
        ((failed_tests++))
    fi
    
    # Summary
    echo -e "\n=================================================="
    if [ $failed_tests -eq 0 ]; then
        echo "🎉 All reliability tests passed!"
        exit 0
    else
        echo "⚠️  $failed_tests tests failed"
        exit 1
    fi
}

# Check if relay monitor is running before starting tests
if ! curl -s "$HEALTH_URL" > /dev/null; then
    echo "❌ Relay monitor is not running. Please start it first:"
    echo "   npm start"
    echo "   or"
    echo "   ./start-production.sh"
    exit 1
fi

# Run tests
main
