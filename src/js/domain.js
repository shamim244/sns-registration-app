import { 
    Connection,
    PublicKey, 
    Transaction, 
    SystemProgram,
    LAMPORTS_PER_SOL,
    clusterApiUrl
} from '@solana/web3.js';
import { 
    resolve,
    reverseLookup,
    getDomainKeySync,
    NameRegistryState
} from '@bonfida/spl-name-service';

export class DomainManager {
    constructor(walletManager) {
        this.walletManager = walletManager;
        this.connection = walletManager.connection;
        
        // One-time pricing configuration (no yearly fees)
        this.pricing = {
            1: 0.05,   // 1 character: 0.05 SOL
            2: 0.05,   // 2 characters: 0.05 SOL  
            3: 0.1,    // 3 characters: 0.1 SOL
            4: 0.05,   // 4 characters: 0.05 SOL
            default: 0.02  // 5+ characters: 0.02 SOL
        };
        
        this.networkFee = 0.001; // Approximate network fee
    }

    async checkDomainAvailability(domainName) {
        try {
            console.log(`Checking availability for domain: ${domainName} on ${this.walletManager.getCurrentNetwork()}`);
            
            // Validate domain name first
            const validation = this.validateDomainName(domainName);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: validation.error
                };
            }

            // Update connection reference
            this.connection = this.walletManager.connection;

            try {
                // Use the official resolve function to check if domain exists
                const owner = await resolve(this.connection, domainName);
                
                if (owner) {
                    // Domain is taken
                    return {
                        success: true,
                        available: false,
                        domain: domainName,
                        owner: owner.toBase58(),
                        network: this.walletManager.getCurrentNetwork()
                    };
                }
            } catch (resolveError) {
                // If resolve throws an error, the domain is likely available
                console.log('Domain appears to be available:', resolveError.message);
                
                const basePrice = this.calculatePrice(domainName);
                const totalPrice = basePrice + this.networkFee;
                
                return {
                    success: true,
                    available: true,
                    domain: domainName,
                    basePrice: basePrice,
                    networkFee: this.networkFee,
                    totalPrice: totalPrice,
                    network: this.walletManager.getCurrentNetwork(),
                    priceUSD: await this.convertSOLToUSD(totalPrice)
                };
            }

        } catch (error) {
            console.error('Domain availability check error:', error);
            return {
                success: false,
                error: `Failed to check domain availability: ${error.message}`
            };
        }
    }

    async registerDomain(domainName, paymentMethod = 'SOL') {
        try {
            if (!this.walletManager.isConnected) {
                throw new Error('Wallet not connected');
            }

            // Update connection reference
            this.connection = this.walletManager.connection;

            // Validate domain
            const validation = this.validateDomainName(domainName);
            if (!validation.isValid) {
                throw new Error(validation.error);
            }

            // Check availability first
            const availability = await this.checkDomainAvailability(domainName);
            if (!availability.success || !availability.available) {
                throw new Error('Domain is not available for registration');
            }

            // Calculate total cost
            const totalCost = availability.totalPrice;
            
            // Check wallet balance
            const balance = await this.walletManager.getBalance();
            if (balance < totalCost) {
                throw new Error(`Insufficient balance. You need ${totalCost} SOL but only have ${balance.toFixed(4)} SOL`);
            }

            // Create registration transaction
            const transaction = new Transaction();
            
            // For demo purposes, create a simple transfer
            // In production, you would use the actual SNS registration instructions
            const transferInstruction = SystemProgram.transfer({
                fromPubkey: this.walletManager.publicKey,
                toPubkey: new PublicKey("11111111111111111111111111111112"), // System program
                lamports: Math.floor(totalCost * LAMPORTS_PER_SOL)
            });

            transaction.add(transferInstruction);

            // Sign and send transaction
            const result = await this.walletManager.signAndSendTransaction(transaction);
            
            if (result.success) {
                return {
                    success: true,
                    signature: result.signature,
                    domain: domainName,
                    cost: totalCost,
                    paymentMethod,
                    network: this.walletManager.getCurrentNetwork(),
                    explorerUrl: this.walletManager.getExplorerUrl(result.signature)
                };
            } else {
                throw new Error('Transaction failed');
            }

        } catch (error) {
            console.error('Domain registration error:', error);
            throw new Error(error.message || 'Failed to register domain');
        }
    }

    validateDomainName(domain) {
        if (!domain) {
            return { isValid: false, error: 'Domain name is required' };
        }

        if (domain.length < 1) {
            return { isValid: false, error: 'Domain name must be at least 1 character' };
        }

        if (domain.length > 32) {
            return { isValid: false, error: 'Domain name cannot exceed 32 characters' };
        }

        // Check for valid characters (letters, numbers, hyphens)
        const validCharRegex = /^[a-z0-9-]+$/;
        if (!validCharRegex.test(domain)) {
            return { isValid: false, error: 'Domain name can only contain lowercase letters, numbers, and hyphens' };
        }

        // Cannot start or end with hyphen
        if (domain.startsWith('-') || domain.endsWith('-')) {
            return { isValid: false, error: 'Domain name cannot start or end with a hyphen' };
        }

        // Cannot have consecutive hyphens
        if (domain.includes('--')) {
            return { isValid: false, error: 'Domain name cannot contain consecutive hyphens' };
        }

        return { isValid: true };
    }

    calculatePrice(domainName) {
        const length = domainName.length;
        
        if (length <= 2) {
            return this.pricing[length] || this.pricing.default;
        } else if (length === 3) {
            return this.pricing[3];
        } else if (length === 4) {
            return this.pricing[4];
        } else {
            return this.pricing.default;
        }
    }

    async convertSOLToUSD(solAmount) {
        try {
            // Placeholder conversion rate - in production, fetch from API
            const solPriceUSD = 100;
            return (solAmount * solPriceUSD).toFixed(2);
        } catch (error) {
            console.error('Price conversion error:', error);
            return 'N/A';
        }
    }

    async searchSimilarDomains(baseDomain) {
        const suggestions = [];
        const maxSuggestions = 3;
        
        const suffixes = ['1', '2', 'x'];
        
        for (const suffix of suffixes) {
            if (suggestions.length >= maxSuggestions) break;
            const suggestion = `${baseDomain}${suffix}`;
            if (this.validateDomainName(suggestion).isValid) {
                try {
                    const availability = await this.checkDomainAvailability(suggestion);
                    if (availability.success && availability.available) {
                        suggestions.push({
                            domain: suggestion,
                            price: availability.totalPrice
                        });
                    }
                } catch (error) {
                    console.log('Error checking suggestion:', suggestion, error);
                }
            }
        }
        
        return suggestions;
    }

    getExplorerUrl(signature) {
        return this.walletManager.getExplorerUrl(signature);
    }

    getCurrentNetwork() {
        return this.walletManager.getCurrentNetwork();
    }
}
