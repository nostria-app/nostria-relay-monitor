#!/bin/bash

# Nostria Relay Monitor - Production Startup Script

echo "🚀 Starting Nostria Relay Monitor in production mode..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Stop any existing instance
pm2 stop nostria-relay-monitor 2>/dev/null || echo "No existing instance to stop"

# Start the application
echo "Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Save PM2 process list for restart
pm2 save

# Show status
pm2 status

echo "✅ Nostria Relay Monitor started successfully!"
echo "📊 Dashboard: http://localhost:3000"
echo "🔌 API: http://localhost:3000/api/status"
echo "❤️  Health: http://localhost:3000/health"
echo ""
echo "Useful commands:"
echo "  pm2 status           - Show application status"
echo "  pm2 logs nostria-relay-monitor  - Show logs"
echo "  pm2 restart nostria-relay-monitor - Restart application"
echo "  pm2 stop nostria-relay-monitor    - Stop application"
