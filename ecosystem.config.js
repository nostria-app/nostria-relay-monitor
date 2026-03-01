module.exports = {
  apps: [{
    name: 'nostria-relay-monitor',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // Restart strategies
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 8000,
    // Health monitoring
    health_check_grace_period: 3000,
    // Advanced restart options
    exp_backoff_restart_delay: 100
  }]
};
