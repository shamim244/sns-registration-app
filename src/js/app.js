import { WalletManager } from './wallet.js';
import { DomainManager } from './domain.js';
import { UIManager } from './ui.js';

class SNSRegistrationApp {
    constructor() {
        this.walletManager = new WalletManager();
        this.domainManager = new DomainManager(this.walletManager);
        this.uiManager = new UIManager();
        
        this.setupEventListeners();
        this.initialize();
    }

    setupEventListeners() {
        // Wallet connection
        this.uiManager.elements.connectWallet.addEventListener('click', () => {
            this.handleWalletConnection();
        });

        // Domain availability check
        this.uiManager.elements.checkAvailability.addEventListener('click', () => {
            this.handleDomainCheck();
        });

        // Domain registration
        this.uiManager.elements.registerDomain.addEventListener('click', () => {
            this.handleDomainRegistration();
        });

        // Airdrop request (devnet only)
        this.uiManager.elements.requestAirdrop.addEventListener('click', () => {
            this.handleAirdrop();
        });

        // Network switching
        window.addEventListener('networkSwitchRequested', (event) => {
            this.handleNetworkSwitch(event.detail.network);
        });

        // Wallet events
        window.addEventListener('walletConnected', (event) => {
            this.handleWalletConnected(event.detail);
        });

        window.addEventListener('walletDisconnected', () => {
            this.handleWalletDisconnected();
        });

        window.addEventListener('walletAccountChanged', (event) => {
            this.handleWalletAccountChanged(event.detail);
        });

        window.addEventListener('networkChanged', (event) => {
            this.handleNetworkChanged(event.detail);
        });
    }

    async initialize() {
        try {
            this.uiManager.showLoading('Initializing application...');
            
            // Wait for connection to be established
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check RPC connection health
            const health = await this.walletManager.checkConnectionHealth();
            if (!health.healthy) {
                this.uiManager.showNotification(`${health.network} connection issues detected. Some features may be limited.`, 'warning');
            }

            // Update UI with current network
            this.uiManager.updateNetworkStatus(this.walletManager.getCurrentNetwork(), health.healthy);
            
            // Check if wallet is already connected
            const isAlreadyConnected = await this.walletManager.checkConnection();
            if (isAlreadyConnected) {
                const balance = await this.walletManager.getBalance();
                this.uiManager.updateWalletButton(
                    true, 
                    this.walletManager.publicKey.toString(), 
                    balance, 
                    this.walletManager.getCurrentNetwork()
                );
                this.uiManager.showNotification(`Wallet reconnected on ${this.walletManager.getCurrentNetwork()}!`, 'success');
            }
            
        } catch (error) {
            console.log('Initialization failed:', error);
            this.uiManager.showNotification('Failed to initialize application', 'error');
        } finally {
            this.uiManager.hideLoading();
        }
    }

    async handleNetworkSwitch(network) {
        try {
            this.uiManager.showLoading(`Switching to ${network}...`);
            
            const result = await this.walletManager.switchNetwork(network);
            
            if (result.success) {
                this.uiManager.updateNetworkStatus(network, true);
                this.uiManager.showNotification(result.message, 'success');
                
                // Update wallet balance for new network
                if (this.walletManager.isConnected) {
                    const balance = await this.walletManager.getBalance();
                    this.uiManager.updateWalletButton(
                        true, 
                        this.walletManager.publicKey.toString(), 
                        balance, 
                        network
                    );
                }

                // Reset form when switching networks
                this.uiManager.resetForm();
                
            } else {
                this.uiManager.showNotification(result.error, 'error');
                // Revert network select to current network
                this.uiManager.updateNetworkStatus(this.walletManager.getCurrentNetwork(), false);
            }
        } catch (error) {
            this.uiManager.showNotification(`Failed to switch to ${network}: ${error.message}`, 'error');
        } finally {
            this.uiManager.hideLoading();
        }
    }

    async handleWalletConnection() {
        try {
            this.uiManager.setButtonLoading(this.uiManager.elements.connectWallet, true);
            
            if (this.walletManager.isConnected) {
                // Disconnect wallet
                await this.walletManager.disconnect();
                this.uiManager.updateWalletButton(false);
                this.uiManager.showNotification('Wallet disconnected', 'info');
            } else {
                // Connect wallet
                const result = await this.walletManager.connectWallet();
                
                if (result.success) {
                    const balance = await this.walletManager.getBalance();
                    this.uiManager.updateWalletButton(true, result.publicKey, balance, result.network);
                    this.uiManager.showNotification(result.message, 'success');
                } else {
                    this.uiManager.showNotification(result.error, 'error');
                }
            }
        } catch (error) {
            this.uiManager.showNotification(error.message, 'error');
        } finally {
            this.uiManager.setButtonLoading(this.uiManager.elements.connectWallet, false);
        }
    }

    async handleAirdrop() {
        try {
            if (!this.walletManager.isConnected) {
                this.uiManager.showNotification('Please connect your wallet first', 'warning');
                return;
            }

            if (!this.walletManager.isDevnet()) {
                this.uiManager.showNotification('Airdrops are only available on devnet', 'warning');
                return;
            }

            this.uiManager.setButtonLoading(this.uiManager.elements.requestAirdrop, true);
            this.uiManager.showLoading('Requesting test SOL...');
            
            const result = await this.walletManager.requestAirdrop(2); // Request 2 SOL
            
            if (result.success) {
                // Update balance display
                const newBalance = await this.walletManager.getBalance();
                this.uiManager.updateWalletButton(
                    true, 
                    this.walletManager.publicKey.toString(), 
                    newBalance, 
                    result.network
                );
                this.uiManager.showNotification(`Successfully received ${result.amount} test SOL!`, 'success');
            }
        } catch (error) {
            this.uiManager.showNotification(error.message, 'error');
        } finally {
            this.uiManager.setButtonLoading(this.uiManager.elements.requestAirdrop, false);
            this.uiManager.hideLoading();
        }
    }

    async handleWalletConnected(detail) {
        try {
            const balance = await this.walletManager.getBalance();
            this.uiManager.updateWalletButton(true, detail.publicKey, balance, detail.network);
        } catch (error) {
            console.error('Error handling wallet connected event:', error);
        }
    }

    handleWalletDisconnected() {
        this.uiManager.updateWalletButton(false);
        this.uiManager.resetForm();
    }

    async handleWalletAccountChanged(detail) {
        try {
            const balance = await this.walletManager.getBalance();
            this.uiManager.updateWalletButton(true, detail.publicKey, balance, detail.network);
            this.uiManager.showNotification('Wallet account changed', 'info');
        } catch (error) {
            console.error('Error handling account change:', error);
        }
    }

    handleNetworkChanged(detail) {
        this.uiManager.updateNetworkStatus(detail.network, true);
        this.uiManager.showNotification(`Connected to ${detail.network}`, 'success');
    }

    async handleDomainCheck() {
        try {
            const domainName = this.uiManager.elements.domainInput.value.trim();
            
            if (!domainName) {
                this.uiManager.showNotification('Please enter a domain name', 'warning');
                this.uiManager.elements.domainInput.focus();
                return;
            }

            this.uiManager.setButtonLoading(this.uiManager.elements.checkAvailability, true);
            this.uiManager.showLoading(`Checking domain availability on ${this.walletManager.getCurrentNetwork()}...`);
            
            // Check RPC health before domain check
            const health = await this.walletManager.checkConnectionHealth();
            if (!health.healthy) {
                this.uiManager.showNotification(`${this.walletManager.getCurrentNetwork()} connection issues. Trying to reconnect...`, 'warning');
                await this.walletManager.initializeConnection(this.walletManager.getCurrentNetwork());
            }
            
            const result = await this.domainManager.checkDomainAvailability(domainName);
            
            // If domain is not available, get suggestions
            if (result.success && !result.available) {
                this.uiManager.showLoading('Finding alternatives...');
                try {
                    const suggestions = await this.domainManager.searchSimilarDomains(domainName);
                    result.suggestions = suggestions;
                } catch (suggestionsError) {
                    console.log('Could not generate suggestions:', suggestionsError);
                    result.suggestions = [];
                }
            }
            
            this.uiManager.showSearchResults(result);
            
        } catch (error) {
            console.error('Domain check error:', error);
            this.uiManager.showNotification('Domain check failed: ' + error.message, 'error');
        } finally {
            this.uiManager.setButtonLoading(this.uiManager.elements.checkAvailability, false);
            this.uiManager.hideLoading();
        }
    }

    async handleDomainRegistration() {
        try {
            if (!this.walletManager.isConnected) {
                this.uiManager.showNotification('Please connect your wallet first', 'warning');
                return;
            }

            const domainName = this.uiManager.currentDomain;
            const paymentMethod = this.uiManager.elements.paymentMethod.value;

            if (!domainName) {
                this.uiManager.showNotification('No domain selected', 'error');
                return;
            }

            // Show transaction status and start the process
            this.uiManager.showTransactionStatus();
            
            try {
                // Step 1: Preparing transaction
                this.uiManager.setTransactionStep(1, 'active');
                await this.delay(1000);
                
                // Step 2: Wallet approval
                this.uiManager.setTransactionStep(1, 'completed');
                this.uiManager.setTransactionStep(2, 'active');
                
                const result = await this.domainManager.registerDomain(
                    domainName, 
                    paymentMethod
                );

                // Step 3: Processing
                this.uiManager.setTransactionStep(2, 'completed');
                this.uiManager.setTransactionStep(3, 'active');
                await this.delay(2000);
                
                // Step 4: Confirmation
                this.uiManager.setTransactionStep(3, 'completed');
                this.uiManager.setTransactionStep(4, 'active');
                await this.delay(1000);

                // Update transaction status with success
                this.uiManager.updateTransactionStatus('success', {
                    success: true,
                    signature: result.signature,
                    domain: domainName,
                    network: result.network,
                    explorerUrl: result.explorerUrl
                });

                // Update wallet balance
                const newBalance = await this.walletManager.getBalance();
                this.uiManager.updateWalletButton(
                    true, 
                    this.walletManager.publicKey.toString(), 
                    newBalance, 
                    this.walletManager.getCurrentNetwork()
                );

            } catch (registrationError) {
                console.error('Registration error:', registrationError);
                
                // Update transaction status with error
                this.uiManager.updateTransactionStatus('error', {
                    success: false,
                    error: registrationError.message
                });
            }

        } catch (error) {
            console.error('Registration handler error:', error);
            this.uiManager.showNotification(error.message, 'error');
            this.uiManager.hideTransactionStatus();
        }
    }

    // Utility method for delays
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SNSRegistrationApp();
});
