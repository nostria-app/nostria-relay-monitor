#!/bin/bash

# Nostria Relay Monitor - Monitoring and Health Check Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="nostria-relay-monitor"
HEALTH_URL="http://localhost:3000/health"
LOG_FILE="$SCRIPT_DIR/logs/monitor.log"

# Create logs directory if it doesn't exist
mkdir -p "$SCRIPT_DIR/logs"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to check if app is running
check_pm2_status() {
    pm2 describe $APP_NAME > /dev/null 2>&1
    return $?
}

# Function to check health endpoint
check_health() {
    curl -f -s --max-time 10 "$HEALTH_URL" > /dev/null 2>&1
    return $?
}

# Function to restart app
restart_app() {
    log "Attempting to restart $APP_NAME..."
    pm2 restart $APP_NAME
    sleep 5
    
    if check_pm2_status; then
        log "✅ $APP_NAME restarted successfully"
        return 0
    else
        log "❌ Failed to restart $APP_NAME"
        return 1
    fi
}

# Function to start app if not running
start_app() {
    log "Attempting to start $APP_NAME..."
    cd "$SCRIPT_DIR"
    pm2 start ecosystem.config.js --env production
    sleep 5
    
    if check_pm2_status; then
        log "✅ $APP_NAME started successfully"
        return 0
    else
        log "❌ Failed to start $APP_NAME"
        return 1
    fi
}

# Main monitoring logic
main() {
    log "🔍 Checking $APP_NAME status..."
    
    # Check if PM2 process exists
    if ! check_pm2_status; then
        log "⚠️  $APP_NAME is not running in PM2"
        start_app
        return $?
    fi
    
    # Check health endpoint
    if ! check_health; then
        log "⚠️  Health check failed for $APP_NAME"
        restart_app
        
        # Wait and check again
        sleep 10
        if ! check_health; then
            log "❌ Health check still failing after restart"
            return 1
        fi
    fi
    
    log "✅ $APP_NAME is healthy"
    return 0
}

# Run monitoring
main

# Exit with appropriate code
exit $?
