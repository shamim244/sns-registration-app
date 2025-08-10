import db from '../models/index.js';

export class AnalyticsService {
  // Real-time statistics
  static async getRealTimeStats() {
    const today = new Date().toISOString().split('T')[0];
    
    const [todayRegistrations, todayFailures, totalRevenue, avgTransactionTime] = await Promise.all([
      db('domain_registrations')
        .where('created_at', '>=', today)
        .count('* as count')
        .first(),
      
      db('transaction_failures')
        .where('created_at', '>=', today)
        .count('* as count')
        .first(),
      
      db('domain_registrations')
        .where('status', 'confirmed')
        .where('created_at', '>=', today)
        .sum('platform_fee as total')
        .first(),
      
      db('domain_registrations')
        .where('created_at', '>=', today)
        .avg('JULIANDAY(confirmed_at) - JULIANDAY(created_at) as avg_time')
        .first()
    ]);

    return {
      todayRegistrations: parseInt(todayRegistrations.count) || 0,
      todayFailures: parseInt(todayFailures.count) || 0,
      todayRevenue: parseFloat(totalRevenue.total) || 0,
      avgProcessingTime: parseFloat(avgTransactionTime.avg_time) * 24 * 60 || 0, // Convert to minutes
      successRate: this.calculateSuccessRate(todayRegistrations.count, todayFailures.count)
    };
  }

  // Calculate transaction analytics
  static calculateTransactionAnalytics(transactions) {
    const total = transactions.length;
    const successful = transactions.filter(t => t.status === 'confirmed').length;
    const failed = transactions.filter(t => t.status === 'failed').length;
    const pending = transactions.filter(t => t.status === 'pending').length;

    const totalRevenue = transactions
      .filter(t => t.status === 'confirmed')
      .reduce((sum, t) => sum + parseFloat(t.platform_fee || 0), 0);

    const avgTransactionValue = successful > 0 ? totalRevenue / successful : 0;

    // Network breakdown
    const networkBreakdown = transactions.reduce((acc, t) => {
      acc[t.network] = (acc[t.network] || 0) + 1;
      return acc;
    }, {});

    // Hourly distribution
    const hourlyData = this.getHourlyDistribution(transactions);

    return {
      total,
      successful,
      failed,
      pending,
      successRate: this.calculateSuccessRate(successful, failed),
      totalRevenue,
      avgTransactionValue,
      networkBreakdown,
      hourlyData
    };
  }

  // Analyze failure patterns
  static analyzeFailurePatterns(failures) {
    const total = failures.length;
    
    // Error type breakdown
    const errorTypeBreakdown = failures.reduce((acc, f) => {
      acc[f.error_type] = (acc[f.error_type] || 0) + 1;
      return acc;
    }, {});

    // Network failure breakdown
    const networkBreakdown = failures.reduce((acc, f) => {
      acc[f.network] = (acc[f.network] || 0) + 1;
      return acc;
    }, {});

    // Time-based patterns
    const hourlyFailures = this.getHourlyDistribution(failures);
    const dailyFailures = this.getDailyDistribution(failures);

    // Most common errors
    const commonErrors = Object.entries(errorTypeBreakdown)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    return {
      total,
      errorTypeBreakdown,
      networkBreakdown,
      hourlyFailures,
      dailyFailures,
      commonErrors,
      averageFailuresPerDay: total / 30 // Assuming 30-day period
    };
  }

  // Get revenue analytics
  static async getRevenueAnalytics(period, granularity) {
    const endDate = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    let dateFormat;
    switch (granularity) {
      case 'hour':
        dateFormat = "strftime('%Y-%m-%d %H:00', created_at)";
        break;
      case 'day':
        dateFormat = "date(created_at)";
        break;
      case 'week':
        dateFormat = "strftime('%Y-%W', created_at)";
        break;
      case 'month':
        dateFormat = "strftime('%Y-%m', created_at)";
        break;
      default:
        dateFormat = "date(created_at)";
    }

    const revenueData = await db('domain_registrations')
      .select(db.raw(`${dateFormat} as period`))
      .sum('platform_fee as revenue')
      .count('* as transactions')
      .where('status', 'confirmed')
      .whereBetween('created_at', [
        startDate.toISOString(),
        endDate.toISOString()
      ])
      .groupBy(db.raw(dateFormat))
      .orderBy('period');

    // Calculate growth rates
    const totalRevenue = revenueData.reduce((sum, item) => sum + parseFloat(item.revenue), 0);
    const totalTransactions = revenueData.reduce((sum, item) => sum + parseInt(item.transactions), 0);
    const avgRevenuePerTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    return {
      revenueData,
      totalRevenue,
      totalTransactions,
      avgRevenuePerTransaction,
      period,
      granularity
    };
  }

  // Get health metrics
  static async getHealthMetrics() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [recentTransactions, recentFailures, systemLoad] = await Promise.all([
      db('domain_registrations')
        .where('created_at', '>=', oneHourAgo.toISOString())
        .count('* as count')
        .first(),
      
      db('transaction_failures')
        .where('created_at', '>=', oneHourAgo.toISOString())
        .count('* as count')
        .first(),
      
      this.getSystemLoad()
    ]);

    const transactionRate = parseInt(recentTransactions.count) || 0;
    const failureRate = parseInt(recentFailures.count) || 0;
    const currentSuccessRate = this.calculateSuccessRate(transactionRate, failureRate);

    // Determine health status
    let healthStatus = 'healthy';
    if (currentSuccessRate < 70) {
      healthStatus = 'critical';
    } else if (currentSuccessRate < 85) {
      healthStatus = 'warning';
    }

    return {
      status: healthStatus,
      transactionRate,
      failureRate,
      successRate: currentSuccessRate,
      systemLoad,
      lastUpdated: now.toISOString()
    };
  }

  // Utility methods
  static calculateSuccessRate(successful, failed) {
    const total = successful + failed;
    return total > 0 ? ((successful / total) * 100).toFixed(2) : 100;
  }

  static getHourlyDistribution(data) {
    return data.reduce((acc, item) => {
      const hour = new Date(item.created_at).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});
  }

  static getDailyDistribution(data) {
    return data.reduce((acc, item) => {
      const day = new Date(item.created_at).toISOString().split('T')[0];
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {});
  }

  static async getSystemLoad() {
    // This would typically interface with system monitoring
    // For now, return mock data
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      storage: Math.random() * 100
    };
  }

  // Update daily analytics (should be run as a cron job)
  static async updateDailyAnalytics(date = new Date().toISOString().split('T')[0]) {
    try {
      const [registrations, failures] = await Promise.all([
        db('domain_registrations')
          .whereRaw('date(created_at) = ?', [date])
          .select(
            db.raw('COUNT(*) as total'),
            db.raw('COUNT(CASE WHEN status = "confirmed" THEN 1 END) as successful'),
            db.raw('SUM(CASE WHEN status = "confirmed" THEN platform_fee ELSE 0 END) as revenue'),
            db.raw('COUNT(DISTINCT user_public_key) as unique_users'),
            db.raw('AVG(CASE WHEN status = "confirmed" THEN amount_paid ELSE NULL END) as avg_transaction_value')
          )
          .first(),

        db('transaction_failures')
          .whereRaw('date(created_at) = ?', [date])
          .count('* as failed_count')
          .first()
      ]);

      const analyticsData = {
        date,
        total_registrations: parseInt(registrations.total) || 0,
        successful_registrations: parseInt(registrations.successful) || 0,
        failed_registrations: parseInt(failures.failed_count) || 0,
        total_revenue: parseFloat(registrations.revenue) || 0,
        platform_fees_collected: parseFloat(registrations.revenue) || 0,
        unique_users: parseInt(registrations.unique_users) || 0,
        average_transaction_value: parseFloat(registrations.avg_transaction_value) || 0
      };

      await db('platform_analytics')
        .insert(analyticsData)
        .onConflict('date')
        .merge();

      console.log(`✅ Daily analytics updated for ${date}`);
      return analyticsData;
    } catch (error) {
      console.error('Error updating daily analytics:', error);
      throw error;
    }
  }
}
