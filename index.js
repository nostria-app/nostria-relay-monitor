import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import ejsLayouts from 'express-ejs-layouts';
import config from './src/config.js';
import apiRoutes from './src/routes/api.js';
import indexRoutes from './src/routes/index.js';
import * as monitoringService from './src/services/monitoringService.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  
  // Log to monitoring system if available
  if (typeof logError === 'function') {
    logError('uncaughtException', error);
  }
  
  // Graceful shutdown
  gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Log to monitoring system if available
  if (typeof logError === 'function') {
    logError('unhandledRejection', reason);
  }
  
  // Graceful shutdown
  gracefulShutdown('unhandledRejection', 1);
});

// Graceful shutdown handler
let isShuttingDown = false;
const gracefulShutdown = (signal, exitCode = 0) => {
  if (isShuttingDown) {
    console.log('Already shutting down...');
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  if (server) {
    server.close((err) => {
      if (err) {
        console.error('Error during server close:', err);
      } else {
        console.log('HTTP server closed');
      }
      
      // Stop monitoring service
      if (monitoringService && monitoringService.stopMonitoring) {
        try {
          monitoringService.stopMonitoring();
          console.log('Monitoring service stopped');
        } catch (error) {
          console.error('Error stopping monitoring service:', error);
        }
      }
      
      // Exit process
      console.log('Process exiting...');
      process.exit(exitCode);
    });
    
    // Force close after timeout
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(exitCode);
  }
};

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Create Express app
const app = express();

// Security middleware
app.disable('x-powered-by');

// Set up view engine
app.set('views', path.join(__dirname, 'src/views'));
app.set('view engine', 'ejs');
app.use(ejsLayouts);
app.set('layout', 'layout');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'src/public')));

// Request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    const err = new Error('Request Timeout');
    err.status = 408;
    next(err);
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});

// Routes with error handling
app.use('/api', (req, res, next) => {
  try {
    apiRoutes(req, res, next);
  } catch (error) {
    next(error);
  }
});

app.use('/', (req, res, next) => {
  try {
    indexRoutes(req, res, next);
  } catch (error) {
    next(error);
  }
});

// 404 handler
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  next(error);
});

// Enhanced error handler
app.use((err, req, res, next) => {
  console.error('Error occurred:', err.message);
  console.error('Stack:', err.stack);
  console.error('Request URL:', req.originalUrl);
  console.error('Request Method:', req.method);
  
  // Prevent header already sent errors
  if (res.headersSent) {
    return next(err);
  }
  
  const statusCode = err.status || 500;
  const message = statusCode === 500 ? 'Something went wrong' : err.message;
  
  // API error response
  if (req.path.startsWith('/api/')) {
    return res.status(statusCode).json({
      error: true,
      message: message,
      timestamp: new Date().toISOString()
    });
  }
  
  // Web error response
  res.status(statusCode);
  
  try {
    res.render('error', { 
      title: 'Error',
      message: message,
      error: process.env.NODE_ENV === 'development' ? err : {},
      statusCode: statusCode
    });
  } catch (renderError) {
    console.error('Error rendering error page:', renderError);
    res.send(`<h1>Error ${statusCode}</h1><p>${message}</p>`);
  }
});

let server;

// Error logging function
const logError = (type, error) => {
  const errorLog = {
    type,
    message: error.message || error,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    }
  };
  
  console.error('Application Error:', JSON.stringify(errorLog, null, 2));
};

// Initialize monitoring service and start server
const startServer = async () => {
  try {
    console.log('Starting Nostria Relay Monitor Server...');
    
    // Initialize the monitoring service with retry logic
    let retries = 3;
    while (retries > 0) {
      try {
        await monitoringService.init();
        console.log('Monitoring service initialized successfully');
        break;
      } catch (error) {
        retries--;
        console.error(`Failed to initialize monitoring service (${3 - retries}/3):`, error.message);
        if (retries === 0) {
          throw new Error('Failed to initialize monitoring service after 3 attempts');
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      }
    }
    
    // Start server
    const port = config.port || 3000;
    server = app.listen(port, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${port}`);
      console.log(`📊 Dashboard: http://localhost:${port}`);
      console.log(`🔌 API: http://localhost:${port}/api/status`);
      console.log(`❤️  Health: http://localhost:${port}/health`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      console.error('Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
        process.exit(1);
      }
    });
    
    // Keep alive settings
    server.keepAliveTimeout = 61000;
    server.headersTimeout = 62000;
    
  } catch (error) {
    console.error('Failed to start server:', error);
    logError('startup', error);
    gracefulShutdown('startup-error', 1);
  }
};

startServer();