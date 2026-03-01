import express from 'express';
import * as monitoringService from '../services/monitoringService.js';
import config from '../config.js';

const router = express.Router();

const isRelayAlive = (record) => {
    if (!record) return false;
    if (record.isAlive === true) return true;
    return record.status === 'online' || record.status === 'partial';
};

const formatDuration = (milliseconds) => {
    if (!milliseconds || milliseconds <= 0) return '0m';

    const totalMinutes = Math.floor(milliseconds / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

const getDeadInfo = (history) => {
    if (!history || history.length === 0) {
        return {
            deadSince: null,
            deadForMs: 0,
            deadForHuman: null,
        };
    }

    const latest = history[0];
    if (isRelayAlive(latest)) {
        return {
            deadSince: null,
            deadForMs: 0,
            deadForHuman: null,
        };
    }

    let deadSince = latest.timestamp;
    for (const record of history) {
        if (isRelayAlive(record)) {
            break;
        }
        deadSince = record.timestamp;
    }

    const deadForMs = Math.max(0, Date.now() - new Date(deadSince).getTime());

    return {
        deadSince,
        deadForMs,
        deadForHuman: formatDuration(deadForMs),
    };
};

/**
 * Serve the main dashboard page
 */
router.get('/', async (req, res) => {
    try {
        const days = req.query.days ? parseInt(req.query.days) : 7;
        
        // Get latest status and uptime data
        const latestStatus = await monitoringService.getLatestStatus();
        const uptimeData = await monitoringService.calculateAllUptime(days);
        const deadInfoByService = {};

        await Promise.all(config.services.map(async (service) => {
            const history = await monitoringService.getServiceHistory(service.name, days);
            deadInfoByService[service.name] = getDeadInfo(history);
        }));
        
        // Render the dashboard
        res.render('dashboard', {
            title: 'Nostr Relay Status',
            services: config.services,
            status: latestStatus,
            uptime: uptimeData,
            deadInfoByService,
            days
        });
    } catch (error) {
        console.error('Error rendering dashboard:', error);
        res.status(500).render('error', { 
            title: 'Error',
            message: 'Failed to load dashboard',
            error
        });
    }
});

/**
 * Serve the service detail page
 */
router.get('/service/:name', async (req, res) => {
    try {
        const serviceName = req.params.name;
        const days = parseInt(req.query.days || '7', 10);
        
        // Find the service in the config instead of the database
        const service = config.services.find(s => s.name === serviceName);
        
        if (!service) {
            return res.status(404).render('error', { 
                title: 'Service Not Found',
                message: 'Service not found',
                error: { status: 404, stack: '' }
            });
        }

        console.log(`Fetching history for ${serviceName} over the last ${days} days`);
        
        // Use the correct parameters for getServiceHistory
        const history = await monitoringService.getServiceHistory(serviceName, days);
        
        console.log(`Retrieved ${history ? history.length : 0} history records for ${serviceName}`);
        
        // If history is empty, log some info about what's in the database
        if (!history || history.length === 0) {
            // Get all latest status info to see if there's any data for this service
            const allStatus = await monitoringService.getLatestStatus();
            console.log(`Latest status for ${serviceName}:`, allStatus[serviceName] || 'Not found');
            
            // Get all history to see what's available
            const allHistory = await monitoringService.getAllHistory(days);
            console.log(`Available services in history:`, Object.keys(allHistory));
            
            // Check if there's a name mismatch issue
            const availableServices = Object.keys(allHistory);
            const similarService = availableServices.find(s => 
                s.toLowerCase().includes(serviceName.toLowerCase()) ||
                serviceName.toLowerCase().includes(s.toLowerCase())
            );
            
            if (similarService) {
                console.log(`Found similar service name: "${similarService}" instead of "${serviceName}"`);
            }
        }
        
        const uptime = await monitoringService.calculateUptime(serviceName, days);
        const deadInfo = getDeadInfo(history || []);
        
        res.render('service', {
            title: `${serviceName} Relay Status`,
            service,
            history: history || [], // Ensure history is never undefined
            days,
            uptime,
            deadInfo
        });
    } catch (error) {
        console.error('Error fetching service details:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error fetching service details',
            error
        });
    }
});

export default router;