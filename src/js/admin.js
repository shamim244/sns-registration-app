class AdminPanel {
    constructor() {
        this.apiBase = 'http://localhost:4000/api';
        this.token = localStorage.getItem('admin_token');
        this.currentSection = 'dashboard';
        this.refreshInterval = null;
        
        this.init();
    }

    async init() {
        if (!this.token) {
            window.location.href = '/login.html';
            return;
        }

        this.setupEventListeners();
        this.setupNavigation();
        this.startAutoRefresh();
        await this.loadDashboard();
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.navigateToSection(section);
            });
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshCurrentSection();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Chart timeframe change
        document.getElementById('chartTimeframe')?.addEventListener('change', (e) => {
            this.updateTransactionChart(e.target.value);
        });
    }

    setupNavigation() {
        // Handle browser back/forward
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.section) {
                this.navigateToSection(e.state.section, false);
            }
        });
    }

    navigateToSection(section, pushState = true) {
        // Update active menu item
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${section}"]`).classList.add('active');

        // Update content sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`${section}-section`).classList.add('active');

        // Update page title and breadcrumb
        const titles = {
            dashboard: 'Dashboard',
            transactions: 'Transactions',
            analytics: 'Analytics',
            failures: 'Failed Transactions',
            revenue: 'Revenue',
            users: 'Users',
            config: 'Configuration',
            security: 'Security',
            reports: 'Reports'
        };

        document.getElementById('pageTitle').textContent = titles[section];
        document.getElementById('breadcrumbPath').textContent = `Home / ${titles[section]}`;

        // Update URL
        if (pushState) {
            history.pushState({ section }, '', `#${section}`);
        }

        this.currentSection = section;
        this.loadSectionData(section);
    }

    async loadSectionData(section) {
        this.showLoading();
        
        try {
            switch (section) {
                case 'dashboard':
                    await this.loadDashboard();
                    break;
                case 'transactions':
                    await this.loadTransactions();
                    break;
                case 'analytics':
                    await this.loadAnalytics();
                    break;
                case 'failures':
                    await this.loadFailures();
                    break;
                case 'revenue':
                    await this.loadRevenue();
                    break;
                case 'users':
                    await this.loadUsers();
                    break;
                case 'config':
                    await this.loadConfiguration();
                    break;
                default:
                    console.log(`Loading section: ${section}`);
            }
        } catch (error) {
            this.showNotification('Failed to load section data', 'error');
            console.error('Section load error:', error);
        } finally {
            this.hideLoading();
        }
    }

    async loadDashboard() {
        try {
            const response = await this.apiCall('/admin/dashboard/overview');
            const data = response.data;

            // Update overview cards
            this.updateOverviewCards(data);
            
            // Update charts
            this.updateTransactionChart('24h', data);
            this.updateNetworkChart(data);
            
            // Update recent activity
            this.updateRecentTransactions(data.recentTransactions);
            this.updateRecentFailures(data.recentFailures);
            
            // Update system status
            this.updateSystemStatus(data.healthMetrics);

            this.updateLastRefresh();
        } catch (error) {
            this.showNotification('Failed to load dashboard', 'error');
            console.error('Dashboard load error:', error);
        }
    }

    updateOverviewCards(data) {
        const { todayStats, realtimeStats } = data;
        
        document.getElementById('todayRegistrations').textContent = 
            (todayStats.successful_registrations || 0).toLocaleString();
        
        document.getElementById('successRate').textContent = 
            `${realtimeStats.successRate || 0}%`;
        
        document.getElementById('todayRevenue').textContent = 
            `${(todayStats.platform_fees_collected || 0).toFixed(4)} SOL`;
        
        document.getElementById('todayFailures').textContent = 
            (todayStats.failed_registrations || 0).toLocaleString();

        // Update change indicators (you'd calculate these based on historical data)
        // For now, showing placeholder values
        document.getElementById('registrationsChange').textContent = '+12%';
        document.getElementById('successRateChange').textContent = '+2.5%';
        document.getElementById('revenueChange').textContent = '+18%';
        document.getElementById('failuresChange').textContent = '-5%';
    }

    updateTransactionChart(timeframe, data) {
        const ctx = document.getElementById('transactionChart');
        
        if (this.transactionChart) {
            this.transactionChart.destroy();
        }

        // Generate sample data based on timeframe
        const labels = this.generateTimeLabels(timeframe);
        const successData = this.generateChartData(labels.length, 20, 100);
        const failureData = this.generateChartData(labels.length, 5, 30);

        this.transactionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Successful',
                        data: successData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Failed',
                        data: failureData,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#cbd5e1' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: '#374151' }
                    },
                    y: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: '#374151' }
                    }
                }
            }
        });
    }

    updateNetworkChart(data) {
        const ctx = document.getElementById('networkChart');
        
        if (this.networkChart) {
            this.networkChart.destroy();
        }

        this.networkChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Mainnet', 'Devnet'],
                datasets: [{
                    data: [75, 25], // Sample data
                    backgroundColor: ['#9945ff', '#14f195'],
                    borderColor: '#1e293b',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { 
                            color: '#cbd5e1',
                            padding: 20
                        }
                    }
                }
            }
        });
    }

    updateRecentTransactions(transactions) {
        const tbody = document.getElementById('recentTransactionsBody');
        
        if (!transactions || !transactions.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No recent transactions</td></tr>';
            return;
        }

        tbody.innerHTML = transactions.map(tx => `
            <tr>
                <td>${tx.domain_name}.sol</td>
                <td>${this.formatAddress(tx.user_public_key)}</td>
                <td>${tx.amount_paid} SOL</td>
                <td><span class="status-badge ${tx.status}">${tx.status}</span></td>
                <td>${tx.network}</td>
                <td>${this.formatTime(tx.created_at)}</td>
            </tr>
        `).join('');
    }

    updateRecentFailures(failures) {
        const container = document.getElementById('recentFailuresList');
        
        if (!failures || !failures.length) {
            container.innerHTML = '<p class="text-center text-gray-500">No recent failures</p>';
            return;
        }

        container.innerHTML = failures.map(failure => `
            <div class="failure-item">
                <div class="failure-header">
                    <span class="domain-name">${failure.domain_name}.sol</span>
                    <span class="error-type">${failure.error_type}</span>
                </div>
                <div class="failure-details">
                    <p>${failure.error_message}</p>
                    <small>${this.formatTime(failure.created_at)}</small>
                </div>
            </div>
        `).join('');
    }

    updateSystemStatus(healthMetrics) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-indicator span');
        
        statusDot.className = `status-dot ${healthMetrics.status}`;
        statusText.textContent = healthMetrics.status.charAt(0).toUpperCase() + healthMetrics.status.slice(1);
    }

    async loadTransactions() {
        // Implementation for loading transactions
        console.log('Loading transactions...');
    }

    async loadAnalytics() {
        // Implementation for loading analytics
        console.log('Loading analytics...');
    }

    async loadFailures() {
        // Implementation for loading failure analysis
        console.log('Loading failures...');
    }

    async loadRevenue() {
        // Implementation for loading revenue analytics
        console.log('Loading revenue...');
    }

    async loadUsers() {
        // Implementation for loading user management
        console.log('Loading users...');
    }

    async loadConfiguration() {
        // Implementation for loading configuration
        console.log('Loading configuration...');
    }

    // Utility methods
    async apiCall(endpoint, options = {}) {
        const response = await fetch(`${this.apiBase}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`,
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            if (response.status === 401) {
                this.logout();
                return;
            }
            throw new Error(`API call failed: ${response.statusText}`);
        }

        return await response.json();
    }

    formatAddress(address) {
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleString();
    }

    generateTimeLabels(timeframe) {
        const now = new Date();
        const labels = [];
        
        switch (timeframe) {
            case '24h':
                for (let i = 23; i >= 0; i--) {
                    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
                    labels.push(time.getHours().toString().padStart(2, '0') + ':00');
                }
                break;
            case '7d':
                for (let i = 6; i >= 0; i--) {
                    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                    labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
                }
                break;
            case '30d':
                for (let i = 29; i >= 0; i--) {
                    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                    labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                }
                break;
        }
        
        return labels;
    }

    generateChartData(length, min, max) {
        return Array.from({ length }, () => 
            Math.floor(Math.random() * (max - min + 1)) + min
        );
    }

    startAutoRefresh() {
        this.refreshInterval = setInterval(() => {
            if (this.currentSection === 'dashboard') {
                this.loadDashboard();
            }
        }, 60000); // Refresh every minute
    }

    refreshCurrentSection() {
        this.loadSectionData(this.currentSection);
    }

    updateLastRefresh() {
        document.getElementById('lastUpdated').textContent = 
            new Date().toLocaleTimeString();
    }

    showLoading() {
        document.getElementById('loadingOverlay').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    logout() {
        localStorage.removeItem('admin_token');
        window.location.href = '/login.html';
    }
}

// Initialize admin panel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AdminPanel();
});
