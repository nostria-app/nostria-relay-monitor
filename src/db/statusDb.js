import { JsonlDB } from "@alcalzone/jsonl-db";
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import config from '../config.js';

// Get __dirname equivalent in ESM
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// Get database directory from config or use default
const dbDir = config.dbPath || './data';

// Ensure DB directory exists
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Create database instance
const db = new JsonlDB(path.join(dbDir, 'status.jsonl'));

const dbFilePath = path.join(dbDir, 'status.jsonl');
const lockFilePath = `${dbFilePath}.lock`;

const openDatabaseWithRecovery = async () => {
    try {
        await db.open();
        return;
    } catch (error) {
        const isLockError = typeof error?.message === 'string' && error.message.includes('Failed to lock DB file');

        if (!isLockError) {
            throw error;
        }

        if (!fs.existsSync(lockFilePath)) {
            throw error;
        }

        const maxLockRetries = 3;
        for (let attempt = 1; attempt <= maxLockRetries; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
                await db.open();
                return;
            } catch (retryError) {
                const retryLockError = typeof retryError?.message === 'string' && retryError.message.includes('Failed to lock DB file');
                if (!retryLockError) {
                    throw retryError;
                }
                if (attempt === maxLockRetries && process.env.ALLOW_DB_FORCE_UNLOCK === 'false') {
                    throw new Error(`Database appears to be in use (set ALLOW_DB_FORCE_UNLOCK=true to recover): ${lockFilePath}`);
                }
            }
        }

        console.warn(`Removing lock after retries: ${lockFilePath}`);
        fs.rmSync(lockFilePath, { recursive: true, force: true });

        await db.open();
    }
};

await openDatabaseWithRecovery();

/**
 * Status Database Service
 */
class StatusDb {
    constructor() {
        this.db = db;
        
        // Auto-purge old records every day
        setInterval(() => this.purgeOldRecords(), 24 * 60 * 60 * 1000);
    }

    /**
     * Initialize the database
     */
    async init() {
        try {
            console.log('Initializing status database...');
            
            // Initial purge of old records
            await this.purgeOldRecords();
            
            console.log('Status database initialized successfully');
            return this;
        } catch (error) {
            console.error('Failed to initialize database:', error);
            throw new Error(`Database initialization failed: ${error.message}`);
        }
    }

    /**
     * Add a status check record to the database
     * @param {Object} record - Status check record
     */
    async addRecord(record) {
        try {
            if (!record || !record.service) {
                throw new Error('Invalid record: missing service name');
            }

            const timestamp = record.timestamp || new Date().toISOString();
            const id = `${record.service}_${timestamp}`;
            
            // Ensure record has all required fields
            const completeRecord = {
                service: record.service,
                host: record.host || '',
                url: record.url || '',
                status: record.status || 'unknown',
                isAlive: record.isAlive === true,
                httpsStatus: record.httpsStatus || 'unknown',
                httpsStatusCode: record.httpsStatusCode || 0,
                httpsMessage: record.httpsMessage || '',
                wssStatus: record.wssStatus || 'unknown',
                wssStatusCode: record.wssStatusCode || 0,
                wssMessage: record.wssMessage || '',
                statusCode: record.statusCode || 0,
                responseTime: record.responseTime || 0,
                message: record.message || '',
                timestamp: timestamp
            };
            
            await this.db.set(id, completeRecord);
            return id;
        } catch (error) {
            console.error('Failed to add record to database:', error);
            throw new Error(`Database write failed: ${error.message}`);
        }
    }

    /**
     * Get status records for a service
     * @param {string} serviceName - Service name
     * @param {number} days - Number of days to look back
     * @returns {Array} - Array of status records
     */
    async getServiceRecords(serviceName, days = 7) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const records = [];
        
        for (const [_, record] of this.db.entries()) {
            // Make sure we're checking the timestamp properly
            if (record.service === serviceName) {
                // Add timestamp if it doesn't exist
                if (!record.timestamp) {
                    // Extract timestamp from the key if possible
                    const keyParts = _.split('_');
                    if (keyParts.length > 1) {
                        record.timestamp = keyParts[keyParts.length - 1];
                    } else {
                        // Default to current time if can't extract
                        record.timestamp = new Date().toISOString();
                    }
                }
                
                // Only add records within date range
                if (new Date(record.timestamp) >= cutoffDate) {
                    records.push(record);
                }
            }
        }
        
        console.log(`Retrieved ${records.length} records for service ${serviceName} in the last ${days} days`);
        
        // Sort by timestamp, newest first
        return records.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
    }

    /**
     * Get all status records grouped by service
     * @returns {Object} - Records grouped by service
     */
    async getAllRecords(days = 7) {
        const services = {};
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        for (const [_, record] of this.db.entries()) {
            if (new Date(record.timestamp) >= cutoffDate) {
                if (!services[record.service]) {
                    services[record.service] = [];
                }
                services[record.service].push(record);
            }
        }
        
        // Sort each service's records by timestamp
        for (const service in services) {
            services[service].sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
            );
        }
        
        return services;
    }
    
    /**
     * Get latest status for each service
     * @returns {Object} - Latest status for each service
     */
    async getLatestStatus() {
        const services = {};
        
        for (const [_, record] of this.db.entries()) {
            const serviceName = record.service;
            
            if (!services[serviceName] || 
                new Date(record.timestamp) > new Date(services[serviceName].timestamp)) {
                services[serviceName] = record;
            }
        }
        
        return services;
    }
    
    /**
     * Purge records older than the retention period
     */
    async purgeOldRecords() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - config.dataRetentionDays);
        
        const keysToDelete = [];
        
        for (const [key, record] of this.db.entries()) {
            if (new Date(record.timestamp) < cutoffDate) {
                keysToDelete.push(key);
            }
        }
        
        if (keysToDelete.length > 0) {
            for (const key of keysToDelete) {
                this.db.delete(key);
            }
            console.log(`Purged ${keysToDelete.length} records older than ${config.dataRetentionDays} days`);
        }
    }
}

// Create instance
const statusDbInstance = new StatusDb();

// Export methods individually for ESM compatibility
export const init = statusDbInstance.init.bind(statusDbInstance);
export const addRecord = statusDbInstance.addRecord.bind(statusDbInstance);
export const getServiceRecords = statusDbInstance.getServiceRecords.bind(statusDbInstance);
export const getAllRecords = statusDbInstance.getAllRecords.bind(statusDbInstance);
export const getLatestStatus = statusDbInstance.getLatestStatus.bind(statusDbInstance);
export const purgeOldRecords = statusDbInstance.purgeOldRecords.bind(statusDbInstance);