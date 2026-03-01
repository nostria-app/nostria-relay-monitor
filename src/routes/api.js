import express from 'express';
import * as monitoringService from '../services/monitoringService.js';

const router = express.Router();

/**
 * Get latest status for all services
 */
router.get('/status', async (req, res) => {
    try {
        const status = await monitoringService.getLatestStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('Error fetching status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get status history for all services
 */
router.get('/history', async (req, res) => {
    try {
        const days = req.query.days ? parseInt(req.query.days) : 7;
        const history = await monitoringService.getAllHistory(days);
        res.json({ success: true, data: history });
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get status history for a specific service
 */
router.get('/history/:service', async (req, res) => {
    try {
        const serviceName = req.params.service;
        const days = req.query.days ? parseInt(req.query.days) : 7;
        const history = await monitoringService.getServiceHistory(serviceName, days);
        res.json({ success: true, data: history });
    } catch (error) {
        console.error('Error fetching service history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get uptime statistics for all services
 */
router.get('/uptime', async (req, res) => {
    try {
        const days = req.query.days ? parseInt(req.query.days) : 7;
        const uptime = await monitoringService.calculateAllUptime(days);
        res.json({ success: true, data: uptime });
    } catch (error) {
        console.error('Error calculating uptime:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Manually trigger a health check for all services
 */
router.post('/check', async (req, res) => {
    try {
        await monitoringService.checkAllServices();
        const status = await monitoringService.getLatestStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('Error triggering health check:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;