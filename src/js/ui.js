import '../styles.css';

export class UIManager {
    constructor() {
        this.elements = this.initializeElements();
        this.setupEventListeners();
        this.notificationTimeout = null;
        this.currentDomain = null;
        this.basePrice = 0;
        this.networkFee = 0.001;
    }

    initializeElements() {
        return {
            // Network controls
            networkSelect: document.getElementById('networkSelect'),
            networkStatus: document.getElementById('networkStatus'),
            
            // Buttons
            connectWallet: document.getElementById('connectWallet'),
            checkAvailability: document.getElementById('checkAvailability'),
            registerDomain: document.getElementById('registerDomain'),
            closeNotification: document.getElementById('closeNotification'),
            viewDomain: document.getElementById('viewDomain'),
            requestAirdrop: document.getElementById('requestAirdrop'),

            // Inputs
            domainInput: document.getElementById('domainInput'),
            selectedDomain: document.getElementById('selectedDomain'),
            paymentMethod: document.getElementById('paymentMethod'),

            // Display elements
            searchResults: document.getElementById('searchResults'),
            registrationForm: document.getElementById('registrationForm'),
            transactionStatus: document.getElementById('transactionStatus'),
            walletBalance: document.getElementById('walletBalance'),
            balanceAmount: document.getElementById('balanceAmount'),
            
            // Price elements
            domainPrice: document.getElementById('domainPrice'),
            networkFee: document.getElementById('networkFee'),
            totalCost: document.getElementById('totalCost'),
            
            // Notification
            notification: document.getElementById('notification'),
            notificationMessage: document.getElementById('notificationMessage'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingMessage: document.getElementById('loadingMessage'),

            // Transaction status elements
            step1: document.getElementById('step1'),
            step2: document.getElementById('step2'),
            step3: document.getElementById('step3'),
            step4: document.getElementById('step4'),
            transactionDetails: document.getElementById('transactionDetails'),
            txHash: document.getElementById('txHash'),
            registeredDomain: document.getElementById('registeredDomain'),
            txStatus: document.getElementById('txStatus')
        };
    }

    setupEventListeners() {
        // Network switcher
        this.elements.networkSelect.addEventListener('change', (e) => {
            const network = e.target.value;
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('networkSwitchRequested', {
                    detail: { network }
                }));
            }
        });

        // Domain input validation and formatting
        this.elements.domainInput.addEventListener('input', (e) => {
            let value = e.target.value.toLowerCase();
            value = value.replace(/[^a-z0-9-]/g, '');
            value = value.replace(/--+/g, '-');
            if (value.startsWith('-')) {
                value = value.substring(1);
            }
            e.target.value = value;
            
            if (value !== this.lastSearched) {
                this.hideSearchResults();
                this.hideRegistrationForm();
            }
        });

        // Enter key for domain check
        this.elements.domainInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.elements.checkAvailability.click();
            }
        });

        // Payment method change
        this.elements.paymentMethod.addEventListener('change', () => {
            this.updatePricing();
        });

        // Close notification
        this.elements.closeNotification.addEventListener('click', () => {
            this.hideNotification();
        });

        // View domain button
        if (this.elements.viewDomain) {
            this.elements.viewDomain.addEventListener('click', () => {
                if (this.currentDomain) {
                    window.open(`https://sns.id/domain/${this.currentDomain}`, '_blank');
                }
            });
        }

        // Auto-hide notification
        this.elements.notification.addEventListener('transitionend', (e) => {
            if (e.propertyName === 'opacity' && !this.elements.notification.classList.contains('hidden')) {
                this.setupNotificationAutoHide();
            }
        });
    }

    updateNetworkStatus(network, isHealthy = true) {
        const statusDot = this.elements.networkStatus.querySelector('.status-dot');
        const statusText = this.elements.networkStatus.querySelector('.status-text');
        
        statusText.textContent = network.charAt(0).toUpperCase() + network.slice(1);
        
        // Update status dot color
        statusDot.className = `status-dot ${network}`;
        
        // Update network select
        this.elements.networkSelect.value = network;
        
        // Show/hide airdrop button based on network
        if (network === 'devnet') {
            this.elements.requestAirdrop.classList.remove('hidden');
        } else {
            this.elements.requestAirdrop.classList.add('hidden');
        }
        
        if (!isHealthy) {
            statusDot.style.background = 'var(--error-color)';
        }
    }

    setupNotificationAutoHide() {
        clearTimeout(this.notificationTimeout);
        this.notificationTimeout = setTimeout(() => {
            this.hideNotification();
        }, 5000);
    }

    updateWalletButton(isConnected, publicKey = null, balance = 0, network = 'mainnet') {
        if (isConnected && publicKey) {
            const shortKey = `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
            this.elements.connectWallet.textContent = shortKey;
            this.elements.connectWallet.classList.add('connected');
            this.elements.connectWallet.title = `Connected: ${publicKey} on ${network}`;
            
            // Show balance
            this.elements.balanceAmount.textContent = balance.toFixed(4);
            this.elements.walletBalance.classList.remove('hidden');
            
            // Show airdrop button only on devnet
            if (network === 'devnet') {
                this.elements.requestAirdrop.classList.remove('hidden');
            } else {
                this.elements.requestAirdrop.classList.add('hidden');
            }
        } else {
            this.elements.connectWallet.textContent = 'Connect Wallet';
            this.elements.connectWallet.classList.remove('connected');
            this.elements.connectWallet.title = '';
            this.elements.walletBalance.classList.add('hidden');
            this.elements.requestAirdrop.classList.add('hidden');
        }
    }

    showSearchResults(result) {
        const { available, domain, basePrice, totalPrice, error, suggestions = [], network } = result;
        
        this.lastSearched = domain;
        
        if (error) {
            this.elements.searchResults.innerHTML = `
                <div class="result-content">
                    <div class="result-icon">❌</div>
                    <div class="result-text">
                        <h3>Error</h3>
                        <p>${error}</p>
                        <p><small>Network: ${network}</small></p>
                    </div>
                </div>
            `;
            this.elements.searchResults.className = 'search-results';
            this.hideRegistrationForm();
        } else if (available) {
            this.elements.searchResults.innerHTML = `
                <div class="result-content">
                    <div class="result-icon">✅</div>
                    <div class="result-text">
                        <h3>${domain}.sol is available!</h3>
                        <p>Price: ${totalPrice} SOL (one-time purchase)</p>
                        <p>Own forever - No renewal fees</p>
                        <p><small>Network: ${network}</small></p>
                    </div>
                </div>
            `;
            this.elements.searchResults.className = 'search-results available';
            this.showRegistrationForm(domain, basePrice, totalPrice);
        } else {
            let suggestionsHtml = '';
            if (suggestions.length > 0) {
                suggestionsHtml = `
                    <div style="margin-top: 16px;">
                        <h4>Available alternatives:</h4>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                            ${suggestions.map(s => `
                                <button class="btn btn-secondary" onclick="document.getElementById('domainInput').value='${s.domain}'; document.getElementById('checkAvailability').click();" style="padding: 6px 12px; font-size: 0.9rem;">
                                    ${s.domain}.sol (${s.price} SOL)
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            this.elements.searchResults.innerHTML = `
                <div class="result-content">
                    <div class="result-icon">❌</div>
                    <div class="result-text">
                        <h3>${domain}.sol is not available</h3>
                        <p>This domain is already registered.</p>
                        <p><small>Network: ${network}</small></p>
                    </div>
                </div>
                ${suggestionsHtml}
            `;
            this.elements.searchResults.className = 'search-results unavailable';
            this.hideRegistrationForm();
        }
        
        this.elements.searchResults.classList.remove('hidden');
    }

    hideSearchResults() {
        this.elements.searchResults.classList.add('hidden');
    }

    showRegistrationForm(domain, basePrice, totalPrice) {
        this.elements.selectedDomain.value = `${domain}.sol`;
        this.currentDomain = domain;
        this.basePrice = basePrice;
        this.totalPrice = totalPrice;
        this.updatePricing();
        this.elements.registrationForm.classList.remove('hidden');
        
        // Scroll to form
        this.elements.registrationForm.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }

    hideRegistrationForm() {
        this.elements.registrationForm.classList.add('hidden');
    }

    updatePricing() {
        if (!this.basePrice) return;
        
        const paymentMethod = this.elements.paymentMethod.value;
        
        this.elements.domainPrice.textContent = `${this.basePrice} ${paymentMethod}`;
        this.elements.networkFee.textContent = `~${this.networkFee} ${paymentMethod}`;
        this.elements.totalCost.textContent = `${(this.basePrice + this.networkFee).toFixed(4)} ${paymentMethod}`;
    }

    showTransactionStatus() {
        this.elements.transactionStatus.classList.remove('hidden');
        this.resetTransactionSteps();
        this.setTransactionStep(1, 'active');
        this.hideRegistrationForm();
        
        // Scroll to status
        this.elements.transactionStatus.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }

    resetTransactionSteps() {
        [1, 2, 3, 4].forEach(step => {
            const element = this.elements[`step${step}`];
            element.classList.remove('active', 'completed');
            const statusElement = element.querySelector('.step-status');
            statusElement.innerHTML = '';
        });
        this.elements.transactionDetails.classList.add('hidden');
    }

    setTransactionStep(stepNumber, status) {
        const element = this.elements[`step${stepNumber}`];
        const statusElement = element.querySelector('.step-status');
        
        // Remove previous classes
        element.classList.remove('active', 'completed');
        
        if (status === 'active') {
            element.classList.add('active');
            statusElement.innerHTML = '<div class="spinner"></div>';
        } else if (status === 'completed') {
            element.classList.add('completed');
            statusElement.innerHTML = '';
        }
    }

    updateTransactionStatus(status, details = {}) {
        const { signature, domain, success, error, network, explorerUrl } = details;
        
        if (success) {
            // Complete all steps
            [1, 2, 3, 4].forEach(step => {
                this.setTransactionStep(step, 'completed');
            });
            
            // Show transaction details
            this.elements.txHash.textContent = signature.slice(0, 8) + '...' + signature.slice(-8);
            this.elements.txHash.href = explorerUrl;
            this.elements.registeredDomain.textContent = `${domain}.sol`;
            this.elements.txStatus.textContent = 'Confirmed';
            this.elements.transactionDetails.classList.remove('hidden');
            
            this.showNotification(`Domain registered successfully on ${network}! 🎉`, 'success');
            
            // Auto-reset after delay
            setTimeout(() => {
                this.resetForm();
            }, 15000);
            
        } else {
            // Mark current step as failed
            const currentStep = this.getCurrentActiveStep();
            if (currentStep) {
                const element = this.elements[`step${currentStep}`];
                element.classList.remove('active');
                element.classList.add('error');
                const statusElement = element.querySelector('.step-status');
                statusElement.innerHTML = '❌';
            }
            
            this.showNotification(error || 'Transaction failed', 'error');
        }
    }

    getCurrentActiveStep() {
        for (let i = 1; i <= 4; i++) {
            if (this.elements[`step${i}`].classList.contains('active')) {
                return i;
            }
        }
        return 1;
    }

    hideTransactionStatus() {
        this.elements.transactionStatus.classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        this.elements.notificationMessage.textContent = message;
        this.elements.notification.className = `notification ${type}`;
        this.elements.notification.classList.remove('hidden');
        
        // Setup auto-hide
        this.setupNotificationAutoHide();
    }

    hideNotification() {
        this.elements.notification.classList.add('hidden');
        clearTimeout(this.notificationTimeout);
    }

    showLoading(message = 'Processing...') {
        this.elements.loadingMessage.textContent = message;
        this.elements.loadingOverlay.classList.remove('hidden');
    }

    hideLoading() {
        this.elements.loadingOverlay.classList.add('hidden');
    }

    setButtonLoading(button, loading, originalText = null) {
        const textElement = button.querySelector('.button-text');
        const spinnerElement = button.querySelector('.button-spinner');
        
        if (loading) {
            button.disabled = true;
            if (originalText) {
                button.dataset.originalText = originalText;
            }
            if (textElement) textElement.style.display = 'none';
            if (spinnerElement) spinnerElement.classList.remove('hidden');
        } else {
            button.disabled = false;
            if (textElement) textElement.style.display = 'inline';
            if (spinnerElement) spinnerElement.classList.add('hidden');
        }
    }

    resetForm() {
        this.elements.domainInput.value = '';
        this.hideSearchResults();
        this.hideRegistrationForm();
        this.hideTransactionStatus();
        this.currentDomain = null;
        this.basePrice = 0;
        this.totalPrice = 0;
        this.lastSearched = null;
    }

    formatAddress(address, startLength = 4, endLength = 4) {
        if (!address || address.length < startLength + endLength) {
            return address;
        }
        return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
    }

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showNotification('Copied to clipboard!', 'success');
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            this.showNotification('Failed to copy to clipboard', 'error');
        }
    }
}
