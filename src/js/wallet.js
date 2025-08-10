import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

export class WalletManager {
    constructor() {
        this.wallet = null;
        this.connection = null;
        this.publicKey = null;
        this.isConnected = false;
        this.currentNetwork = 'mainnet';
        
        // Initialize with mainnet by default
        this.initializeConnection('mainnet');
        this.setupWalletEventListeners();
    }

    async initializeConnection(network = 'mainnet') {
        this.currentNetwork = network;
        
        let rpcEndpoints = [];
        
        if (network === 'mainnet') {
            rpcEndpoints = [
                'https://rpc.ankr.com/solana',
                'https://solana-mainnet.g.alchemy.com/v2/demo',
                'https://api.mainnet-beta.solana.com',
                'https://mainnet.helius-rpc.com/?api-key=',
                'https://solana-mainnet.rpc.extrnode.com'
            ];
        } else {
            rpcEndpoints = [
                'https://api.devnet.solana.com',
                clusterApiUrl('devnet')
            ];
        }
        
        for (const endpoint of rpcEndpoints) {
            try {
                console.log(`Testing ${network} RPC: ${endpoint}`);
                const testConnection = new Connection(endpoint, 'confirmed');
                
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Connection timeout')), 3000)
                );
                
                const versionPromise = testConnection.getVersion();
                const version = await Promise.race([versionPromise, timeoutPromise]);
                
                this.connection = testConnection;
                console.log(`✅ Connected to ${network}:`, endpoint, version);
                
                // Dispatch network change event
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('networkChanged', {
                        detail: { network: this.currentNetwork }
                    }));
                }
                
                return;
            } catch (error) {
                console.log(`❌ ${network} RPC failed:`, endpoint, error.message);
            }
        }
        
        throw new Error(`Failed to connect to ${network}`);
    }

    async switchNetwork(network) {
        if (this.currentNetwork === network) {
            return { success: true, message: `Already on ${network}` };
        }
        
        try {
            await this.initializeConnection(network);
            return { 
                success: true, 
                message: `Switched to ${network}`,
                network: this.currentNetwork
            };
        } catch (error) {
            console.error(`Failed to switch to ${network}:`, error);
            return { 
                success: false, 
                error: `Failed to switch to ${network}: ${error.message}` 
            };
        }
    }

    setupWalletEventListeners() {
        if (typeof window !== 'undefined' && window.solana) {
            window.solana.on('connect', (publicKey) => {
                console.log('Wallet connected:', publicKey.toString());
                this.handleWalletConnect(publicKey);
            });

            window.solana.on('disconnect', () => {
                console.log('Wallet disconnected');
                this.handleWalletDisconnect();
            });

            window.solana.on('accountChanged', (publicKey) => {
                if (publicKey) {
                    console.log('Account changed:', publicKey.toString());
                    this.handleAccountChange(publicKey);
                } else {
                    this.handleWalletDisconnect();
                }
            });
        }
    }

    async connectWallet() {
        try {
            if (!window.solana) {
                throw new Error('Solana wallet not found. Please install Phantom, Solflare, or another Solana wallet.');
            }

            const isPhantom = window.solana.isPhantom;
            const isSolflare = window.solana.isSolflare;
            let walletName = 'Solana Wallet';
            
            if (isPhantom) {
                walletName = 'Phantom';
            } else if (isSolflare) {
                walletName = 'Solflare';
            }

            const response = await window.solana.connect({ onlyIfTrusted: false });
            
            if (!response.publicKey) {
                throw new Error('Failed to connect to wallet');
            }

            this.publicKey = response.publicKey;
            this.wallet = window.solana;
            this.isConnected = true;

            console.log(`${walletName} connected on ${this.currentNetwork}:`, this.publicKey.toString());

            return {
                success: true,
                publicKey: this.publicKey.toString(),
                walletName: walletName,
                network: this.currentNetwork,
                message: `${walletName} connected to ${this.currentNetwork}!`
            };

        } catch (error) {
            console.error('Wallet connection error:', error);
            
            if (error.code === 4001) {
                return {
                    success: false,
                    error: 'Connection rejected by user'
                };
            }
            
            if (error.message.includes('User rejected')) {
                return {
                    success: false,
                    error: 'Connection rejected by user'
                };
            }
            
            return {
                success: false,
                error: error.message || 'Failed to connect wallet'
            };
        }
    }

    async disconnect() {
        try {
            if (this.wallet && this.isConnected) {
                await this.wallet.disconnect();
            }
        } catch (error) {
            console.error('Disconnect error:', error);
        } finally {
            this.handleWalletDisconnect();
        }
    }

    handleWalletConnect(publicKey) {
        this.publicKey = publicKey;
        this.isConnected = true;
        
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('walletConnected', {
                detail: { 
                    publicKey: publicKey.toString(),
                    network: this.currentNetwork
                }
            }));
        }
    }

    handleWalletDisconnect() {
        this.wallet = null;
        this.publicKey = null;
        this.isConnected = false;
        
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('walletDisconnected'));
        }
    }

    handleAccountChange(publicKey) {
        this.publicKey = publicKey;
        
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('walletAccountChanged', {
                detail: { 
                    publicKey: publicKey.toString(),
                    network: this.currentNetwork
                }
            }));
        }
    }

    async signAndSendTransaction(transaction) {
        if (!this.isConnected || !this.wallet) {
            throw new Error('Wallet not connected');
        }

        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout getting blockhash')), 10000)
            );
            
            const blockhashPromise = this.connection.getLatestBlockhash();
            const { blockhash, lastValidBlockHeight } = await Promise.race([
                blockhashPromise, 
                timeoutPromise
            ]);
            
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.publicKey;

            console.log(`Requesting transaction signature on ${this.currentNetwork}...`);

            const signedTransaction = await this.wallet.signTransaction(transaction);
            
            console.log('Transaction signed, sending to network...');

            const signature = await this.connection.sendRawTransaction(
                signedTransaction.serialize(),
                {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed',
                    maxRetries: 3
                }
            );

            console.log(`Transaction sent on ${this.currentNetwork}:`, signature);

            const confirmation = await this.connection.confirmTransaction({
                signature,
                blockhash,
                lastValidBlockHeight
            }, 'confirmed');
            
            console.log('Transaction confirmed:', confirmation);

            return {
                success: true,
                signature,
                confirmation,
                network: this.currentNetwork
            };

        } catch (error) {
            console.error('Transaction error:', error);
            
            if (error.message.includes('User rejected') || error.code === 4001) {
                throw new Error('Transaction rejected by user');
            }
            
            if (error.message.includes('insufficient funds')) {
                throw new Error('Insufficient SOL balance for transaction');
            }
            
            if (error.message.includes('Timeout')) {
                throw new Error('Transaction timed out. Please try again.');
            }
            
            throw new Error(error.message || 'Transaction failed');
        }
    }

    async getBalance() {
        if (!this.isConnected || !this.publicKey) {
            return 0;
        }

        try {
            let retries = 3;
            while (retries > 0) {
                try {
                    const balance = await this.connection.getBalance(this.publicKey, 'confirmed');
                    return balance / 1e9;
                } catch (error) {
                    console.log(`Balance fetch attempt failed (${4 - retries}/3):`, error.message);
                    retries--;
                    
                    if (retries === 0) {
                        throw error;
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } catch (error) {
            console.error('Balance fetch error:', error);
            return 0;
        }
    }

    // Airdrop for devnet testing
    async requestAirdrop(amount = 2) {
        if (!this.isConnected || !this.publicKey) {
            throw new Error('Wallet not connected');
        }

        if (this.currentNetwork !== 'devnet') {
            throw new Error('Airdrops are only available on devnet');
        }

        try {
            console.log(`Requesting ${amount} SOL airdrop on devnet...`);
            const signature = await this.connection.requestAirdrop(
                this.publicKey,
                amount * 1e9
            );
            
            await this.connection.confirmTransaction(signature);
            console.log('Airdrop successful:', signature);
            
            return {
                success: true,
                signature,
                amount,
                network: this.currentNetwork
            };
        } catch (error) {
            console.error('Airdrop failed:', error);
            throw new Error('Failed to get test SOL: ' + error.message);
        }
    }

    async checkConnectionHealth() {
        try {
            const startTime = Date.now();
            const version = await this.connection.getVersion();
            const responseTime = Date.now() - startTime;
            
            console.log(`${this.currentNetwork} RPC Health: OK (${responseTime}ms)`, version);
            return { healthy: true, responseTime, version, network: this.currentNetwork };
        } catch (error) {
            console.error(`${this.currentNetwork} RPC Health: FAILED`, error.message);
            return { healthy: false, error: error.message, network: this.currentNetwork };
        }
    }

    getWalletInfo() {
        return {
            isConnected: this.isConnected,
            publicKey: this.publicKey?.toString() || null,
            wallet: this.wallet,
            connection: this.connection,
            network: this.currentNetwork,
            walletType: this.getWalletType()
        };
    }

    getWalletType() {
        if (!this.wallet) return null;
        
        if (this.wallet.isPhantom) return 'Phantom';
        if (this.wallet.isSolflare) return 'Solflare';
        if (this.wallet.isBackpack) return 'Backpack';
        
        return 'Unknown';
    }

    async checkConnection() {
        if (typeof window !== 'undefined' && window.solana && window.solana.isConnected) {
            try {
                const publicKey = window.solana.publicKey;
                if (publicKey) {
                    this.publicKey = publicKey;
                    this.wallet = window.solana;
                    this.isConnected = true;
                    return true;
                }
            } catch (error) {
                console.log('Auto-connect check failed:', error);
            }
        }
        return false;
    }

    getExplorerUrl(signature) {
        const baseUrl = this.currentNetwork === 'devnet' 
            ? 'https://explorer.solana.com/tx/' 
            : 'https://explorer.solana.com/tx/';
        const cluster = this.currentNetwork === 'devnet' ? '?cluster=devnet' : '';
        return `${baseUrl}${signature}${cluster}`;
    }

    getCurrentNetwork() {
        return this.currentNetwork;
    }

    isDevnet() {
        return this.currentNetwork === 'devnet';
    }

    isMainnet() {
        return this.currentNetwork === 'mainnet';
    }
}
