import { JsonlDB } from "@alcalzone/jsonl-db";
import path from 'path';
import fs from 'fs';
import os from 'os';
import config from '../config.js';

// New file name: the previous status.jsonl may be locked/corrupted on mounted storage.
const dbFileName = process.env.DB_FILE || 'relay-status.jsonl';

// proper-lockfile does not work reliably on SMB mounts (Azure /home), so keep the
// lock on the container-local filesystem while the data stays on persistent storage.
const lockDir = process.env.DB_LOCK_DIR || path.join(os.tmpdir(), 'nostria-relay-monitor-locks');
const lockFilePath = path.join(lockDir, `${dbFileName}.lock`);

const dbOptions = {
    lockfile: {
        directory: lockDir,
        staleMs: 10000,
        updateMs: 5000,
        retries: 3,
        retryMinTimeoutMs: 500
    }
};

// Candidate directories in priority order; mounted storage (e.g. Azure /home) can be
// unwritable for the container user, so fall back instead of crashing at startup.
const dbDirCandidates = [...new Set([
    config.dbPath || './data',
    './data',
    path.join(os.tmpdir(), 'nostria-relay-monitor')
])];

const isDirUsable = (candidate) => {
    try {
        fs.mkdirSync(candidate, { recursive: true });
        fs.accessSync(candidate, fs.constants.W_OK);
        return true;
    } catch (error) {
        console.warn(`Database directory not usable (${candidate}): ${error.message}`);
        return false;
    }
};

let db = null;
let dbFilePath = null;
let dbReady = false;

const isLockError = (error) =>
    typeof error?.message === 'string' && error.message.includes('Failed to lock DB file');

const isInvalidDataError = (error) =>
    typeof error?.message === 'string' && error.message.includes('Cannot open file: Invalid data in line');

const extractInvalidLineNo = (error) => {
    const match = error?.message?.match(/Invalid data in line\s+(\d+)/i);
    return match ? Number(match[1]) : null;
};

const sanitizeJsonlFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const backupSuffix = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.corrupt-${backupSuffix}.bak`;
    fs.copyFileSync(filePath, backupPath);

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const validLines = [];
    let skippedLines = 0;

    for (const line of lines) {
        if (!line.trim()) {
            continue;
        }

        try {
            JSON.parse(line);
            validLines.push(line);
        } catch {
            skippedLines++;
        }
    }

    const rebuilt = validLines.length > 0 ? `${validLines.join('\n')}\n` : '';
    fs.writeFileSync(filePath, rebuilt, 'utf8');

    console.warn(`Sanitized corrupted database file. Removed ${skippedLines} invalid line(s). Backup: ${backupPath}`);
};

const removeStaleLock = () => {
    if (!fs.existsSync(lockFilePath)) {
        return false;
    }

    console.warn(`Removing stale DB lock: ${lockFilePath}`);
    fs.rmSync(lockFilePath, { recursive: true, force: true });
    return true;
};

const openDatabaseAt = async (dir) => {
    const filePath = path.join(dir, dbFileName);
    const instance = new JsonlDB(filePath, dbOptions);

    try {
        await instance.open();
    } catch (error) {
        if (isInvalidDataError(error)) {
            const invalidLineNo = extractInvalidLineNo(error);
            console.warn(`Detected invalid JSONL data${invalidLineNo ? ` at line ${invalidLineNo}` : ''}. Attempting file repair...`);
            sanitizeJsonlFile(filePath);
            await instance.open();
        } else if (isLockError(error) && removeStaleLock()) {
            await instance.open();
        } else {
            throw error;
        }
    }

    return { instance, filePath };
};

const openDatabaseWithRecovery = async () => {
    fs.mkdirSync(lockDir, { recursive: true });

    const errors = [];

    for (const candidate of dbDirCandidates) {
        if (!isDirUsable(candidate)) {
            continue;
        }

        try {
            const opened = await openDatabaseAt(candidate);
            db = opened.instance;
            dbFilePath = opened.filePath;
            dbReady = true;

            if (candidate !== dbDirCandidates[0]) {
                console.warn(`Using fallback database directory: ${candidate}`);
            }
            console.log(`Status database opened: ${dbFilePath}`);
            return;
        } catch (error) {
            errors.push(`${candidate}: ${error.message}`);
            console.warn(`Failed to open database in ${candidate}: ${error.message}`);
        }
    }

    throw new Error(`Could not open database in any location -> ${errors.join(' | ')}`);
};

try {
    await openDatabaseWithRecovery();
} catch (error) {
    // Keep the process alive so the web server can still start and report health.
    console.error('Failed to open status database:', error.message);
}

/**
 * Status Database Service
 */
class StatusDb {
    constructor() {
        // Auto-purge old records every day
        setInterval(() => {
            this.purgeOldRecords().catch(error => console.error('Scheduled purge failed:', error));
        }, 24 * 60 * 60 * 1000);
    }

    get db() {
        return db;
    }

    async ensureOpen() {
        if (dbReady) {
            return;
        }

        await openDatabaseWithRecovery();
    }

    /**
     * Initialize the database
     */
    async init() {
        try {
            console.log('Initializing status database...');

            await this.ensureOpen();

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

            if (!dbReady) {
                throw new Error('Database is not available');
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
        if (!dbReady) {
            return [];
        }

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

        if (!dbReady) {
            return services;
        }

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

        if (!dbReady) {
            return services;
        }

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
        if (!dbReady) {
            return;
        }

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