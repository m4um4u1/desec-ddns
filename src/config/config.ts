/**
 * Configuration management
 */
import fs from 'fs';
import { Config } from '../types/types';
import logger from '../utils/logger';
import { isValidDomain, validatePositiveInteger } from '../utils/validators';

/**
 * Read file content (for Docker secrets)
 */
export const readFileIfExists = (path: string): string | null => {
  try {
    if (fs.existsSync(path)) {
      return fs.readFileSync(path, 'utf8').trim();
    }
  } catch (err) {
    logger.warn(`Failed to read file: ${path}`, { 
      error: err instanceof Error ? err.message : String(err) 
    });
  }
  return null;
};

/**
 * Load configuration from environment variables or Docker secrets
 */
export const loadConfig = (): Config => {
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
  if (!isValidDomain(desecDomain)) {
    logger.error(`Invalid domain format: ${desecDomain}`);
    process.exit(1);
  }
  
  // Validate and parse numeric values
  const intervalSeconds = validatePositiveInteger(intervalSecondsStr, 'INTERVAL_SECONDS', 300);
  const maxRetries = validatePositiveInteger(maxRetriesStr, 'MAX_RETRIES', 3);
  const requestsPerMinute = validatePositiveInteger(requestsPerMinuteStr, 'REQUESTS_PER_MINUTE', 30);
  const ttl = validatePositiveInteger(ttlStr, 'TTL', 3600);
  
  const config: Config = {
    desecToken,
    desecDomain,
    desecRecord,
    intervalSeconds,
    maxRetries,
    requestsPerMinute,
    ttl
  };
  
  logger.info('Configuration loaded successfully', { 
    desecDomain, 
    desecRecord, 
    intervalSeconds,
    maxRetries,
    requestsPerMinute,
    ttl
  });
  
  return config;
};