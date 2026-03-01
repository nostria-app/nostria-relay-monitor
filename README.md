# Nostria Relay Monitor

A highly reliable and modern status monitoring application that tracks and displays the health of Nostr relays over both HTTPS and WSS.

![Nostria Relay Monitor Dashboard](https://via.placeholder.com/800x400?text=Nostria+Relay+Monitor+Dashboard)

## Features

- 📊 Beautiful web dashboard for monitoring Nostr relay status
- 🔄 Dual-protocol checks for each relay (`https://` + `wss://`)
- ⏱️ 30-minute check cadence by default
- 🚨 Dead-duration visibility for fully offline relays
- ✅ Partial/online/offline state to quickly spot if any relay is alive
- 📝 Historical data storage using jsonl-db
- 📈 Uptime statistics and trends
- 🔌 Simple REST API
- 🧹 Automatic data cleanup (configurable retention period)
- 🐳 Docker support for easy deployment
- 🛡️ **Enhanced Reliability Features:**
  - Global error handlers to prevent crashes
  - Graceful shutdown handling
  - PM2 process management for auto-restart
  - Health check endpoints
  - Request timeout protection
  - Database error resilience
  - Comprehensive logging

## Quick Start

### Production Deployment (Recommended)

For maximum reliability, use PM2 process management:

**Windows:**
```powershell
# Install dependencies
npm install

# Start in production mode
.\start-production.ps1
```

**Linux/macOS:**
```bash
# Install dependencies
npm install

# Make script executable and start
chmod +x start-production.sh
./start-production.sh
```

### Using Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/nostria-app/nostria-relay-monitor.git
cd nostria-relay-monitor

# Start with Docker Compose (includes health checks and restart policies)
docker-compose up -d
```

### Using Docker

```bash
# Build and run with production Dockerfile
docker build -f Dockerfile.production -t nostria-relay-monitor:prod .
docker run -p 3000:3000 -v $(pwd)/data:/app/data -v $(pwd)/logs:/app/logs nostria-relay-monitor:prod
```

### Development Setup

```bash
# Clone the repository
git clone https://github.com/nostria-app/nostria-relay-monitor.git
cd nostria-relay-monitor

# Install dependencies
npm install

# Start the server
npm start
# or for development with auto-reload
npm run dev
```

### Azure Web Apps Deployment

For Azure Web Apps deployment using GitHub Actions:

1. **Setup GitHub Secrets:**
   - `AZURE_CREDENTIALS`: Azure service principal credentials
   - Update `AZURE_RESOURCE_GROUP` in workflow if needed

2. **Automatic Deployment:**
   - Push to `main` branch triggers deployment
   - Uses optimized Azure container configuration
   - Includes health checks and reliability features

3. **Manual Azure Setup:**
   
   **Using Configuration Scripts:**
   ```bash
   # Windows PowerShell
   .\configure-azure.ps1 -ResourceGroupName "your-rg" -WebAppName "your-app"
   
   # Linux/macOS
   chmod +x configure-azure.sh
   ./configure-azure.sh -g "your-rg" -n "your-app"
   ```
   
   **Detailed Setup:**
   See [AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md) for manual configuration steps.

## Health Monitoring

The application includes several reliability features:

- **Health Check Endpoint**: `GET /health` - Returns application status
- **Graceful Shutdown**: Handles SIGTERM/SIGINT properly
- **Auto-restart**: PM2 automatically restarts on crashes
- **Error Recovery**: Database and monitoring service auto-recovery
- **Request Timeouts**: Prevents hanging requests
- **Memory Management**: Automatic memory limit enforcement

## Configuration

Edit `src/config.js` to configure relay hosts and runtime settings:

```javascript
const relayHosts = [
  'offchain.pub',
  'relay.minds.com',
  // ...more hosts
];

const config = {
  services: relayHosts.map((host) => ({
    name: host,
    host,
    httpsUrl: `https://${host}`,
    wssUrl: `wss://${host}`,
  })),

  dbPath: process.env.DB_PATH || './data',
  checkInterval: parseInt(process.env.CHECK_INTERVAL_MS, 10) || 30 * 60 * 1000,
  dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS, 10) || 14,
  port: parseInt(process.env.PORT, 10) || 3000,
};

export default config;
```

## API Endpoints

The application provides the following API endpoints:

- `GET /api/status` - Get the current status of all relays
- `GET /api/history` - Get status history for all relays
- `GET /api/history/:service` - Get status history for a specific relay
- `GET /api/uptime` - Get uptime statistics for all relays
- `POST /api/check` - Manually trigger a health check for all relays

Query parameters:
- `days` - Number of days to include in history/uptime (default: 7)

## Data Storage

Status data is stored using [@alcalzone/jsonl-db](https://github.com/AlCalzone/jsonl-db), which stores data in a JSON Lines format. The database files are located in `src/db/data/`.

By default, data older than 14 days is automatically purged. This can be configured in `src/config.js`.

## Docker Deployment

The included Dockerfile provides a production-ready container:

```bash
docker build -t nostria-relay-monitor .
docker run -p 3000:3000 -v /path/to/data:/usr/src/app/src/db/data nostria-relay-monitor
```

Use the `-v` flag to persist data outside the container.

## GitHub Actions CI/CD

This project includes a GitHub Actions workflow that automatically builds and publishes a Docker image to GitHub Container Registry (ghcr.io) when changes are pushed to the main branch.

To use this image:

```bash
docker pull ghcr.io/nostria-app/nostria-relay-monitor:latest
docker run -p 3000:3000 ghcr.io/nostria-app/nostria-relay-monitor:latest
```

## License

MIT
