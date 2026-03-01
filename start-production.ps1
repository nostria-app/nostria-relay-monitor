# Nostria Relay Monitor - Production Startup Script for Windows

Write-Host "🚀 Starting Nostria Relay Monitor in production mode..." -ForegroundColor Green

# Check if PM2 is installed
try {
    pm2 --version | Out-Null
} catch {
    Write-Host "Installing PM2..." -ForegroundColor Yellow
    npm install -g pm2
}

# Create logs directory if it doesn't exist
if (!(Test-Path -Path "logs")) {
    New-Item -ItemType Directory -Path "logs"
}

# Stop any existing instance
try {
    pm2 stop nostria-relay-monitor
    Write-Host "Stopped existing instance" -ForegroundColor Yellow
} catch {
    Write-Host "No existing instance to stop" -ForegroundColor Gray
}

# Start the application
Write-Host "Starting application with PM2..." -ForegroundColor Blue
pm2 start ecosystem.config.js --env production

# Save PM2 process list for restart
pm2 save

# Show status
pm2 status

Write-Host "✅ Nostria Relay Monitor started successfully!" -ForegroundColor Green
Write-Host "📊 Dashboard: http://localhost:3000" -ForegroundColor Cyan
Write-Host "🔌 API: http://localhost:3000/api/status" -ForegroundColor Cyan
Write-Host "❤️  Health: http://localhost:3000/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  pm2 status                  - Show application status"
Write-Host "  pm2 logs nostria-relay-monitor     - Show logs"
Write-Host "  pm2 restart nostria-relay-monitor  - Restart application"
Write-Host "  pm2 stop nostria-relay-monitor     - Stop application"
