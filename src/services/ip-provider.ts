/**
 * IP Provider Service
 */
import fetch from 'node-fetch';
import { Agent } from 'https';
import pRetry from 'p-retry';
import { IpProvider, Config, AppError } from '../types';
import logger from '../utils/logger';
import { isValidIPv4 } from '../utils/validators';

// Create a secure HTTPS agent with strict certificate validation
export const httpsAgent = new Agent({
  rejectUnauthorized: true, // Enforce certificate validation
  minVersion: 'TLSv1.2',    // Require minimum TLS 1.2
});

// Multiple IP providers for redundancy, prioritizing privacy-focused services
export const ipProviders: IpProvider[] = [
  // ipify claims to be open-source and not store visitor data
  { name: 'ipify', url: 'https://api.ipify.org?format=json', parser: (data: any) => data.ip },
  
  // ident.me is a simple service that doesn't appear to log extensively
  { name: 'ident.me', url: 'https://ident.me', parser: (data: string) => data.trim() },
  
  // wtfismyip.com has a clear privacy policy stating they minimize logging
  { name: 'wtfismyip', url: 'https://wtfismyip.com/text', parser: (data: string) => data.trim() },
  
  // ip.rootnet.in is a minimalist service
  { name: 'rootnet', url: 'https://ip.rootnet.in', parser: (data: string) => data.trim() }
];

/**
 * IP Provider Service class
 */
export class IpProviderService {
  private config: Config;
  private providers: IpProvider[];
  
  constructor(config: Config, providers: IpProvider[] = ipProviders) {
    this.config = config;
    this.providers = providers;
  }
  
  /**
   * Fetch public IP with fallback to multiple providers
   */
  async getPublicIP(): Promise<string> {
    for (const provider of this.providers) {
      try {
        logger.debug(`Attempting to fetch IP from ${provider.name}`);
        
        const response = await pRetry(
          async () => {
            const res = await fetch(provider.url, { 
              agent: httpsAgent,
              timeout: 10000 // 10 second timeout
            });
            
            if (!res.ok) {
              throw new AppError(`Failed to fetch from ${provider.name}`, { 
                status: res.status, 
                statusText: res.statusText 
              });
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
            retries: this.config.maxRetries,
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
        logger.error(`Failed to fetch IP from ${provider.name}`, { 
          error: err instanceof Error ? err.message : String(err) 
        });
        // Continue to next provider
      }
    }
    
    throw new AppError('Failed to fetch public IP from all providers');
  }
}