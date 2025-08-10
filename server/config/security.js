import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export const securityConfig = {
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
    expiresIn: '24h',
    issuer: 'sns-platform',
    audience: 'sns-admin'
  },

  // Password Requirements
  password: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: true,
    saltRounds: 12
  },

  // Rate Limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    adminWindowMs: 5 * 60 * 1000, // 5 minutes for admin
    adminMax: 50, // Stricter limits for admin routes
    skipSuccessfulRequests: false
  },

  // API Security
  api: {
    maxRequestSize: '10mb',
    enableCors: true,
    corsOrigin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    enableHelmet: true,
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },

  // Session Configuration
  session: {
    name: 'sns_session',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
};

// Security utility functions
export const SecurityUtils = {
  async hashPassword(password) {
    return await bcrypt.hash(password, securityConfig.password.saltRounds);
  },

  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  },

  generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
  },

  validatePasswordStrength(password) {
    const { minLength, requireUppercase, requireLowercase, requireNumbers, requireSymbols } = securityConfig.password;
    
    const errors = [];
    
    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long`);
    }
    
    if (requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (requireSymbols && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one symbol');
    }
    
    return { isValid: errors.length === 0, errors };
  }
};
