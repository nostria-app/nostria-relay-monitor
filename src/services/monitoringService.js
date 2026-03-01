import fetch from 'node-fetch';
import WebSocket from 'ws';
import config from '../config.js';
import * as statusDb from '../db/statusDb.js';

/**
 * Monitoring Service
 * Handles the health checks for configured services
 */
class MonitoringService {
    constructor() {
        this.checkInterval = null;
        this.isInitialized = false;
        this.consecutiveErrors = 0;
        this.maxConsecutiveErrors = 5;
    }

    /**
     * Initialize the monitoring service
     */
    async init() {
        try {
            console.log('Initializing monitoring service...');
            
            // Initialize the database with retry logic
            let retries = 3;
            while (retries > 0) {
                try {
                    await statusDb.init();
                    break;
                } catch (error) {
                    retries--;
                    console.error(`Database init failed (${3 - retries}/3):`, error.message);
                    if (retries === 0) throw error;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            this.isInitialized = true;

            // Run one check immediately so the dashboard has fresh relay data on startup
            await this.checkAllServicesWithErrorHandling();

            // Start the recurring check interval
            this.startMonitoring();
            
            console.log('Monitoring service initialized successfully');
            return this;
        } catch (error) {
            console.error('Failed to initialize monitoring service:', error);
            this.isInitialized = false;
            throw error;
        }
    }

    /**
     * Start the monitoring service
     */
    startMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        // Set up the interval for regular checks
        this.checkInterval = setInterval(() => {
            this.checkAllServicesWithErrorHandling();
        }, config.checkInterval);
        
        console.log(`Monitoring started, checking ${config.services.length} services every ${config.checkInterval / 1000} seconds`);
    }

    /**
     * Wrapper for checkAllServices with error handling
     */
    async checkAllServicesWithErrorHandling() {
        try {
            await this.checkAllServices();
            this.consecutiveErrors = 0; // Reset error count on success
        } catch (error) {
            this.consecutiveErrors++;
            console.error(`Monitoring cycle failed (${this.consecutiveErrors}/${this.maxConsecutiveErrors}):`, error.message);
            
            // If too many consecutive errors, restart monitoring
            if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
                console.warn('Too many consecutive monitoring errors, restarting monitoring service...');
                this.stopMonitoring();
                setTimeout(() => {
                    try {
                        this.startMonitoring();
                        this.consecutiveErrors = 0;
                    } catch (restartError) {
                        console.error('Failed to restart monitoring:', restartError);
                    }
                }, 10000); // Wait 10 seconds before restart
            }
        }
    }

    /**
     * Stop the monitoring service
     */
    stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('Monitoring stopped');
        }
    }

    /**
     * Check all configured services
     */
    async checkAllServices() {
        if (!this.isInitialized) {
            console.warn('Monitoring service not initialized, skipping check');
            return;
        }

        const checkPromises = config.services.map(service => 
            this.checkService(service).catch(error => {
                console.error(`Error checking service ${service.name}:`, error.message);
                return {
                    service: service.name,
                    url: service.url,
                    status: 'error',
                    statusCode: 0,
                    responseTime: 0,
                    message: `Check failed: ${error.message}`
                };
            })
        );

        try {
            const results = await Promise.allSettled(checkPromises);
            const successfulChecks = results.filter(result => result.status === 'fulfilled').length;
            console.log(`Completed ${successfulChecks}/${config.services.length} service checks`);
        } catch (error) {
            console.error('Error in service check batch:', error);
            throw error;
        }
    }

    /**
     * Check a single service
     * @param {Object} service - Service configuration
     */
    async checkService(service) {
        if (!service || !service.host) {
            throw new Error('Invalid service configuration');
        }

        const [httpsResult, wssResult] = await Promise.all([
            this.checkHttpsEndpoint(service.httpsUrl),
            this.checkWssEndpoint(service.wssUrl),
        ]);

        const httpsOnline = httpsResult.status === 'online';
        const wssOnline = wssResult.status === 'online';
        const isAlive = httpsOnline || wssOnline;

        let status = 'offline';
        if (httpsOnline && wssOnline) {
            status = 'online';
        } else if (isAlive) {
            status = 'partial';
        }

        const responseTime = Math.max(httpsResult.responseTime, wssResult.responseTime);
        const message = `HTTPS: ${httpsResult.message} | WSS: ${wssResult.message}`;
        
        // Create record
        const record = {
            service: service.name,
            host: service.host,
            url: service.httpsUrl,
            status,
            isAlive,
            httpsStatus: httpsResult.status,
            httpsStatusCode: httpsResult.statusCode,
            httpsMessage: httpsResult.message,
            wssStatus: wssResult.status,
            wssStatusCode: wssResult.statusCode,
            wssMessage: wssResult.message,
            statusCode: httpsResult.statusCode || wssResult.statusCode || 0,
            responseTime,
            message,
            timestamp: new Date().toISOString()
        };
        
        // Store in database with error handling
        try {
            await statusDb.addRecord(record);
        } catch (dbError) {
            console.error(`Failed to store record for ${service.name}:`, dbError.message);
            // Don't throw here to avoid stopping other checks
        }
        
        console.log(`Checked ${service.name}: ${status} (HTTPS ${httpsResult.status}, WSS ${wssResult.status})`);
        
        return record;
    }

    async checkHttpsEndpoint(url) {
        const startedAt = Date.now();

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 12000);

            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Nostria-Relay-Monitor/1.0',
                    'Accept': 'application/nostr+json,application/json,text/plain,*/*'
                },
                redirect: 'manual'
            });

            clearTimeout(timeout);

            return {
                status: 'online',
                statusCode: response.status,
                responseTime: Date.now() - startedAt,
                message: `HTTPS responded (${response.status})`
            };
        } catch (error) {
            const message = error.name === 'AbortError'
                ? 'HTTPS timeout'
                : `HTTPS error: ${error.message}`;

            return {
                status: 'offline',
                statusCode: 0,
                responseTime: Date.now() - startedAt,
                message
            };
        }
    }

    async checkWssEndpoint(url) {
        const startedAt = Date.now();

        return await new Promise((resolve) => {
            let resolved = false;
            let socket;

            const finalize = (result) => {
                if (resolved) {
                    return;
                }

                resolved = true;
                clearTimeout(timeoutId);

                if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
                    socket.terminate();
                }

                resolve({
                    statusCode: 101,
                    ...result,
                    responseTime: Date.now() - startedAt,
                });
            };

            const timeoutId = setTimeout(() => {
                finalize({
                    status: 'offline',
                    statusCode: 0,
                    message: 'WSS timeout'
                });
            }, 12000);

            try {
                socket = new WebSocket(url, {
                    handshakeTimeout: 10000,
                    headers: {
                        'User-Agent': 'Nostria-Relay-Monitor/1.0'
                    }
                });
            } catch (error) {
                finalize({
                    status: 'offline',
                    statusCode: 0,
                    message: `WSS setup error: ${error.message}`
                });
                return;
            }

            socket.once('open', () => {
                finalize({
                    status: 'online',
                    statusCode: 101,
                    message: 'WSS handshake successful'
                });
            });

            socket.once('unexpected-response', (_, response) => {
                finalize({
                    status: 'offline',
                    statusCode: response?.statusCode || 0,
                    message: `WSS unexpected response (${response?.statusCode || 'unknown'})`
                });
            });

            socket.once('error', (error) => {
                finalize({
                    status: 'offline',
                    statusCode: 0,
                    message: `WSS error: ${error.message}`
                });
            });
        });
    }

    /**
     * Get latest status for all services
     * @returns {Object} - Latest status for each service
     */
    async getLatestStatus() {
        return await statusDb.getLatestStatus();
    }

    /**
     * Get status records for a service
     * @param {string} serviceName - Service name
     * @param {number} days - Number of days to look back
     * @returns {Array} - Array of status records
     */
    async getServiceHistory(serviceName, days = 7) {
        return await statusDb.getServiceRecords(serviceName, days);
    }

    /**
     * Get all status records grouped by service
     * @returns {Object} - Records grouped by service
     */
    async getAllHistory(days = 7) {
        return await statusDb.getAllRecords(days);
    }

    /**
     * Calculate uptime percentage for a service
     * @param {string} serviceName - Service name
     * @param {number} days - Number of days to calculate for
     * @returns {number} - Uptime percentage
     */
    async calculateUptime(serviceName, days = 7) {
        const records = await statusDb.getServiceRecords(serviceName, days);
        
        if (records.length === 0) return 0;
        
        const onlineCount = records.filter(r => r.isAlive === true || r.status === 'online' || r.status === 'partial').length;
        return (onlineCount / records.length) * 100;
    }

    /**
     * Calculate uptime for all services
     * @param {number} days - Number of days to calculate for
     * @returns {Object} - Uptime by service
     */
    async calculateAllUptime(days = 7) {
        const services = {};
        
        for (const service of config.services) {
            services[service.name] = {
                uptime: await this.calculateUptime(service.name, days),
                config: service
            };
        }
        
        return services;
    }
}

// Create instance and export its methods
const monitoringService = new MonitoringService();

// Export all methods individually for ESM compatibility
export const init = monitoringService.init.bind(monitoringService);
export const startMonitoring = monitoringService.startMonitoring.bind(monitoringService);
export const stopMonitoring = monitoringService.stopMonitoring.bind(monitoringService);
export const checkAllServices = monitoringService.checkAllServices.bind(monitoringService);
export const checkService = monitoringService.checkService.bind(monitoringService);
export const getLatestStatus = monitoringService.getLatestStatus.bind(monitoringService);
export const getServiceHistory = monitoringService.getServiceHistory.bind(monitoringService);
export const getAllHistory = monitoringService.getAllHistory.bind(monitoringService);
export const calculateUptime = monitoringService.calculateUptime.bind(monitoringService);
export const calculateAllUptime = monitoringService.calculateAllUptime.bind(monitoringService);