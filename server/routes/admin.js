import express from 'express';
import { body, validationResult } from 'express-validator';
import db from '../models/index.js';
import { authMiddleware, requirePermissions } from '../middleware/auth.js';
import { SecurityUtils } from '../config/security.js';
import { AnalyticsService } from '../services/analyticsService.js';
import { logActivity } from '../middleware/security.js';

const router = express.Router();

// Apply authentication to all admin routes
router.use(authMiddleware);

// ===========================================
// DASHBOARD OVERVIEW
// ===========================================

router.get('/dashboard/overview', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get today's statistics
    const todayStats = await db('platform_analytics')
      .where('date', today)
      .first();

    // Get 30-day totals
    const thirtyDayStats = await db('platform_analytics')
      .whereBetween('date', [thirtyDaysAgo, today])
      .select(
        db.raw('SUM(total_registrations) as total_registrations'),
        db.raw('SUM(successful_registrations) as successful_registrations'),
        db.raw('SUM(failed_registrations) as failed_registrations'),
        db.raw('SUM(total_revenue) as total_revenue'),
        db.raw('SUM(platform_fees_collected) as platform_fees_collected'),
        db.raw('AVG(average_transaction_value) as avg_transaction_value')
      )
      .first();

    // Get real-time statistics
    const realtimeStats = await AnalyticsService.getRealTimeStats();

    // Recent transactions
    const recentTransactions = await db('domain_registrations')
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(10);

    // Recent failures
    const recentFailures = await db('transaction_failures')
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(5);

    // Platform health metrics
    const healthMetrics = await AnalyticsService.getHealthMetrics();

    res.json({
      success: true,
      data: {
        todayStats: todayStats || {
          total_registrations: 0,
          successful_registrations: 0,
          failed_registrations: 0,
          total_revenue: 0,
          platform_fees_collected: 0
        },
        thirtyDayStats,
        realtimeStats,
        recentTransactions,
        recentFailures,
        healthMetrics
      }
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

// ===========================================
// TRANSACTION ANALYTICS
// ===========================================

router.get('/analytics/transactions', async (req, res) => {
  try {
    const { startDate, endDate, network, status } = req.query;
    
    let query = db('domain_registrations as dr')
      .leftJoin('transaction_failures as tf', function() {
        this.on('dr.user_public_key', '=', 'tf.user_public_key')
            .andOn('dr.domain_name', '=', 'tf.domain_name');
      });

    // Apply filters
    if (startDate && endDate) {
      query = query.whereBetween('dr.created_at', [startDate, endDate]);
    }
    
    if (network) {
      query = query.where('dr.network', network);
    }
    
    if (status) {
      query = query.where('dr.status', status);
    }

    const transactions = await query
      .select('dr.*', 'tf.error_message', 'tf.error_type')
      .orderBy('dr.created_at', 'desc');

    // Calculate analytics
    const analytics = AnalyticsService.calculateTransactionAnalytics(transactions);

    res.json({
      success: true,
      data: {
        transactions,
        analytics,
        totalCount: transactions.length
      }
    });
  } catch (error) {
    console.error('Transaction analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transaction analytics' });
  }
});

// ===========================================
// REVENUE ANALYTICS
// ===========================================

router.get('/analytics/revenue', async (req, res) => {
  try {
    const { period = '30d', granularity = 'day' } = req.query;
    
    const revenueData = await AnalyticsService.getRevenueAnalytics(period, granularity);
    
    res.json({
      success: true,
      data: revenueData
    });
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch revenue analytics' });
  }
});

// ===========================================
// FAILURE ANALYSIS
// ===========================================

router.get('/analytics/failures', async (req, res) => {
  try {
    const { startDate, endDate, errorType } = req.query;
    
    let query = db('transaction_failures');
    
    if (startDate && endDate) {
      query = query.whereBetween('created_at', [startDate, endDate]);
    }
    
    if (errorType) {
      query = query.where('error_type', errorType);
    }
    
    const failures = await query
      .select('*')
      .orderBy('created_at', 'desc');
    
    // Analyze failure patterns
    const failureAnalytics = AnalyticsService.analyzeFailurePatterns(failures);
    
    res.json({
      success: true,
      data: {
        failures,
        analytics: failureAnalytics,
        totalCount: failures.length
      }
    });
  } catch (error) {
    console.error('Failure analysis error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch failure analytics' });
  }
});

// ===========================================
// PLATFORM CONFIGURATION
// ===========================================

router.get('/config', requirePermissions(['config:read']), async (req, res) => {
  try {
    const configs = await db('platform_config')
      .select('key', 'value', 'type', 'description', 'category')
      .orderBy('category', 'key');
    
    // Group by category
    const groupedConfigs = configs.reduce((acc, config) => {
      if (!acc[config.category]) {
        acc[config.category] = [];
      }
      acc[config.category].push(config);
      return acc;
    }, {});
    
    res.json({ success: true, data: groupedConfigs });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch configuration' });
  }
});

router.put('/config/:key', 
  requirePermissions(['config:write']),
  [
    body('value').notEmpty().withMessage('Value is required'),
    body('type').isIn(['string', 'number', 'boolean', 'json']).withMessage('Invalid type')
  ],
  logActivity('config_update'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { key } = req.params;
      const { value, type, description, category } = req.body;
      
      // Validate and convert value based on type
      let processedValue = value;
      try {
        if (type === 'number') {
          processedValue = parseFloat(value);
        } else if (type === 'boolean') {
          processedValue = value === 'true' || value === true;
        } else if (type === 'json') {
          processedValue = JSON.stringify(JSON.parse(value));
        }
      } catch (error) {
        return res.status(400).json({ 
          success: false, 
          error: `Invalid value format for type ${type}` 
        });
      }

      await db('platform_config')
        .insert({ 
          key, 
          value: processedValue.toString(), 
          type, 
          description, 
          category: category || 'general' 
        })
        .onConflict('key')
        .merge();

      res.json({ success: true, message: 'Configuration updated successfully' });
    } catch (error) {
      console.error('Config update error:', error);
      res.status(500).json({ success: false, error: 'Failed to update configuration' });
    }
  }
);

// ===========================================
// USER MANAGEMENT
// ===========================================

router.get('/users', requirePermissions(['user:read']), async (req, res) => {
  try {
    const users = await db('admin_users')
      .select('id', 'username', 'email', 'role', 'is_active', 'last_login_at', 'created_at')
      .orderBy('created_at', 'desc');
    
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

router.post('/users',
  requirePermissions(['user:create']),
  [
    body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').custom((value) => {
      const validation = SecurityUtils.validatePasswordStrength(value);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      return true;
    })
  ],
  logActivity('user_create'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { username, email, password, role = 'admin' } = req.body;
      
      // Hash password
      const passwordHash = await SecurityUtils.hashPassword(password);
      
      const [userId] = await db('admin_users').insert({
        username,
        email,
        password_hash: passwordHash,
        role
      });

      res.json({ 
        success: true, 
        message: 'User created successfully', 
        data: { id: userId, username, email, role } 
      });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(400).json({ success: false, error: 'Username or email already exists' });
      } else {
        res.status(500).json({ success: false, error: 'Failed to create user' });
      }
    }
  }
);

// ===========================================
// REPORTS
// ===========================================

router.get('/reports/export/:type', requirePermissions(['report:export']), async (req, res) => {
  try {
    const { type } = req.params;
    const { startDate, endDate, format = 'json' } = req.query;
    
    let data;
    let filename;
    
    switch (type) {
      case 'transactions':
        data = await db('domain_registrations')
          .whereBetween('created_at', [startDate, endDate])
          .select('*');
        filename = `transactions_${startDate}_to_${endDate}`;
        break;
        
      case 'failures':
        data = await db('transaction_failures')
          .whereBetween('created_at', [startDate, endDate])
          .select('*');
        filename = `failures_${startDate}_to_${endDate}`;
        break;
        
      case 'revenue':
        data = await db('platform_analytics')
          .whereBetween('date', [startDate, endDate])
          .select('*');
        filename = `revenue_${startDate}_to_${endDate}`;
        break;
        
      default:
        return res.status(400).json({ success: false, error: 'Invalid report type' });
    }
    
    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
      return res.send(csv);
    }
    
    res.json({ success: true, data, filename });
  } catch (error) {
    console.error('Report export error:', error);
    res.status(500).json({ success: false, error: 'Failed to export report' });
  }
});

// Utility function to convert JSON to CSV
function convertToCSV(data) {
  if (!data.length) return '';
  
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
      }).join(',')
    )
  ].join('\n');
  
  return csv;
}

export default router;
