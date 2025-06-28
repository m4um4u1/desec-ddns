import fetch, { RequestInit } from 'node-fetch';
import winston from 'winston';
import pRetry from 'p-retry';
import pLimit from 'p-limit';
import validator from 'validator';
import { Agent } from 'https';

// ===== Configuration and Environment Variables =====
interface Config {
  desecToken: string;
  desecDomain: string;
  desecRecord: string;
  intervalSeconds: number;
  maxRetries: number;
  requestsPerMinute: number;
  ttl: number;
}

// Create a secure HTTPS agent with strict certificate validation
const httpsAgent = new Agent({
  rejectUnauthorized: true, // Enforce certificate validation
  minVersion: 'TLSv1.2',    // Require minimum TLS 1.2
});

// Setup structured logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'desec-ddns' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Read file content (for Docker secrets)
function readFileIfExists(path: string): string | null {
  try {
    const fs = require('fs');
    if (fs.existsSync(path)) {
      return fs.readFileSync(path, 'utf8').trim();
    }
  } catch (err) {
    logger.warn(`Failed to read file: ${path}`, { error: err instanceof Error ? err.message : String(err) });
  }
  return null;
}

// Validate and load configuration from environment variables or Docker secrets
function loadConfig(): Config {
  // Check for Docker secrets first, then fall back to environment variables
  let desecToken: string | null = readFileIfExists('/run/secrets/desec_token');
  if (!desecToken && process.env.DESEC_TOKEN_FILE) {
    desecToken = readFileIfExists(process.env.DESEC_TOKEN_FILE);
  }
  if (!desecToken) {
    desecToken = process.env.DESEC_TOKEN || null;
  }
  
  let desecDomain: string | null = readFileIfExists('/run/secrets/desec_domain');
  if (!desecDomain && process.env.DESEC_DOMAIN_FILE) {
    desecDomain = readFileIfExists(process.env.DESEC_DOMAIN_FILE);
  }
  if (!desecDomain) {
    desecDomain = process.env.DESEC_DOMAIN || null;
  }
  
  const desecRecord = process.env.DESEC_RECORD || '@';
  const intervalSecondsStr = process.env.INTERVAL_SECONDS || '300';
  const maxRetriesStr = process.env.MAX_RETRIES || '3';
  const requestsPerMinuteStr = process.env.REQUESTS_PER_MINUTE || '30';
  const ttlStr = process.env.TTL || '3600';
  
  // Validate required configuration
  if (!desecToken) {
    logger.error('Missing required token. Set DESEC_TOKEN environment variable or provide a Docker secret.');
    process.exit(1);
  }
  
  if (!desecDomain) {
    logger.error('Missing required domain. Set DESEC_DOMAIN environment variable or provide a Docker secret.');
    process.exit(1);
  }
  
  // Validate domain format
  if (!validator.isFQDN(desecDomain)) {
    logger.error(`Invalid domain format: ${desecDomain}`);
    process.exit(1);
  }
  
  // Validate and parse numeric values
  const intervalSeconds = validatePositiveInteger(intervalSecondsStr, 'INTERVAL_SECONDS', 300);
  const maxRetries = validatePositiveInteger(maxRetriesStr, 'MAX_RETRIES', 3);
  const requestsPerMinute = validatePositiveInteger(requestsPerMinuteStr, 'REQUESTS_PER_MINUTE', 30);
  const ttl = validatePositiveInteger(ttlStr, 'TTL', 3600);
  
  logger.info('Configuration loaded successfully', { 
    desecDomain, 
    desecRecord, 
    intervalSeconds,
    maxRetries,
    requestsPerMinute,
    ttl
  });
  
  return {
    desecToken,
    desecDomain,
    desecRecord,
    intervalSeconds,
    maxRetries,
    requestsPerMinute,
    ttl
  };
}

function validatePositiveInteger(value: string, name: string, defaultValue: number): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    logger.warn(`Invalid ${name} value: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

// ===== IP Address Utilities =====

// Validate if a string is a valid IPv4 address
function isValidIPv4(ip: string): boolean {
  return validator.isIP(ip, 4);
}

// Multiple IP providers for redundancy
const ipProviders = [
  { name: 'ipify', url: 'https://api.ipify.org?format=json', parser: (data: any) => data.ip },
  { name: 'ifconfig.me', url: 'https://ifconfig.me/ip', parser: (data: string) => data.trim() },
  { name: 'ipinfo.io', url: 'https://ipinfo.io/ip', parser: (data: string) => data.trim() },
  { name: 'icanhazip', url: 'https://icanhazip.com', parser: (data: string) => data.trim() }
];

// Load configuration first (moved from below)
const config = loadConfig();

// Rate limiting for API requests
const rateLimiter = pLimit(config.requestsPerMinute);

// Fetch public IP with fallback to multiple providers
async function getPublicIP(): Promise<string> {
  for (const provider of ipProviders) {
    try {
      logger.debug(`Attempting to fetch IP from ${provider.name}`);
      
      const response = await pRetry(
        async () => {
          const res = await fetch(provider.url, { 
            agent: httpsAgent,
            timeout: 10000 // 10 second timeout
          });
          
          if (!res.ok) {
            throw new Error(`Failed to fetch from ${provider.name}: ${res.status} ${res.statusText}`);
          }
          
          const contentType = res.headers.get('content-type') || '';
          let data;
          
          if (contentType.includes('application/json')) {
            data = await res.json();
          } else {
            data = await res.text();
          }
          
          return provider.parser(data);
        },
        { 
          retries: config.maxRetries,
          onFailedAttempt: error => {
            logger.warn(`Attempt ${error.attemptNumber} failed to fetch IP from ${provider.name}: ${error.message}`);
          }
        }
      );
      
      // Validate the IP address
      if (!isValidIPv4(response)) {
        logger.warn(`Invalid IP address received from ${provider.name}: ${response}`);
        continue;
      }
      
      logger.info(`Successfully fetched IP from ${provider.name}: ${response}`);
      return response;
    } catch (err) {
      logger.error(`Failed to fetch IP from ${provider.name}`, { error: err instanceof Error ? err.message : String(err) });
      // Continue to next provider
    }
  }
  
  throw new Error('Failed to fetch public IP from all providers');
}

// ===== deSEC API Interaction =====

// Get the current A record IP from deSEC
async function getCurrentARecordIP(): Promise<string | null> {
  return rateLimiter(async () => {
    const url = config.desecRecord !== '@'
      ? `https://desec.io/api/v1/domains/${config.desecDomain}/rrsets/${config.desecRecord}/A/`
      : `https://desec.io/api/v1/domains/${config.desecDomain}/rrsets/.../A/`;
    
    return pRetry(
      async () => {
        try {
          const requestOptions: RequestInit = {
            method: 'GET',
            headers: {
              'Authorization': `Token ${config.desecToken}`,
              'Content-Type': 'application/json',
              'User-Agent': 'desec-ddns/1.0.0'
            },
            agent: httpsAgent,
            timeout: 15000 // 15 second timeout
          };
          
          logger.debug('Fetching current A record', { url });
          const res = await fetch(url, requestOptions);
          
          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Failed to fetch A record: ${res.status} ${errorText}`);
          }
          
          const data = await res.json();
          const currentIP = data.records && data.records.length > 0 ? data.records[0] : null;
          
          if (currentIP && !isValidIPv4(currentIP)) {
            logger.warn(`Invalid IP format in current A record: ${currentIP}`);
            return null;
          }
          
          logger.info('Current A record fetched successfully', { currentIP });
          return currentIP;
        } catch (err) {
          logger.error('Error fetching current A record', { 
            error: err instanceof Error ? err.message : String(err) 
          });
          throw err;
        }
      },
      { 
        retries: config.maxRetries,
        onFailedAttempt: error => {
          logger.warn(`Attempt ${error.attemptNumber} failed to fetch A record: ${error.message}`);
        }
      }
    );
  });
}

// Update the A record in deSEC
async function updateDesecARecord(ip: string): Promise<void> {
  return rateLimiter(async () => {
    // Validate IP before updating
    if (!isValidIPv4(ip)) {
      throw new Error(`Invalid IP format: ${ip}`);
    }
    
    const url = config.desecRecord !== '@'
      ? `https://desec.io/api/v1/domains/${config.desecDomain}/rrsets/${config.desecRecord}/A/`
      : `https://desec.io/api/v1/domains/${config.desecDomain}/rrsets/.../A/`;
    
    const body = JSON.stringify({
      subname: config.desecRecord !== '@' ? config.desecRecord : '',
      records: [ip],
      ttl: config.ttl,
      type: 'A'
    });
    
    return pRetry(
      async () => {
        try {
          const requestOptions: RequestInit = {
            method: 'PUT',
            headers: {
              'Authorization': `Token ${config.desecToken}`,
              'Content-Type': 'application/json',
              'User-Agent': 'desec-ddns/1.0.0'
            },
            body,
            agent: httpsAgent,
            timeout: 15000 // 15 second timeout
          };
          
          logger.debug('Updating A record', { url, ip });
          const res = await fetch(url, requestOptions);
          
          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Failed to update A record: ${res.status} ${errorText}`);
          }
          
          logger.info('A record updated successfully', { ip });
        } catch (err) {
          logger.error('Error updating A record', { 
            error: err instanceof Error ? err.message : String(err),
            ip 
          });
          throw err;
        }
      },
      { 
        retries: config.maxRetries,
        onFailedAttempt: error => {
          logger.warn(`Attempt ${error.attemptNumber} failed to update A record: ${error.message}`);
        }
      }
    );
  });
}

// ===== Main Application Logic =====

async function monitorAndUpdateIP() {
  let lastIp: string | null = null;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;
  
  // Initial fetch of current A record
  try {
    lastIp = await getCurrentARecordIP();
    logger.info('Initial A record IP fetched', { ip: lastIp });
    consecutiveErrors = 0;
  } catch (err) {
    logger.error('Failed to retrieve initial A record IP', { 
      error: err instanceof Error ? err.message : String(err) 
    });
    // Continue with lastIp as null
  }
  
  // Main monitoring loop
  while (true) {
    try {
      // Get current public IP
      const ip = await getPublicIP();
      
      // Check if IP has changed
      if (ip !== lastIp) {
        logger.info('IP address change detected', { oldIp: lastIp, newIp: ip });
        await updateDesecARecord(ip);
        lastIp = ip;
      } else {
        logger.info('IP unchanged, no update needed', { ip });
      }
      
      // Reset error counter on success
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      logger.error('Error in monitoring cycle', { 
        error: err instanceof Error ? err.message : String(err),
        consecutiveErrors,
        maxConsecutiveErrors: MAX_CONSECUTIVE_ERRORS
      });
      
      // Only exit if we have too many consecutive errors
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        logger.error(`Too many consecutive errors (${consecutiveErrors}), exiting`);
        process.exit(1);
      }
    }
    
    // Wait for next check interval
    logger.debug(`Waiting ${config.intervalSeconds} seconds until next check`);
    await new Promise(resolve => setTimeout(resolve, config.intervalSeconds * 1000));
  }
}

// ===== Application Startup =====

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { 
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
  process.exit(1);
});

// Start the application
logger.info('Starting deSEC DDNS updater', { 
  domain: config.desecDomain, 
  record: config.desecRecord 
});

monitorAndUpdateIP().catch(err => {
  logger.error('Fatal error in main process', { 
    error: err instanceof Error ? err.message : String(err) 
  });
  process.exit(1);
});
