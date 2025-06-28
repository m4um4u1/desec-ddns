/**
 * deSEC API Service
 */
import fetch, { RequestInit } from 'node-fetch';
import pRetry from 'p-retry';
import pLimit from 'p-limit';
import { Config, ApiError, RequestOptions } from '../types';
import logger from '../utils/logger';
import { isValidIPv4 } from '../utils/validators';
import { httpsAgent } from './ip-provider';

/**
 * deSEC API Service class
 */
export class DesecApiService {
  private config: Config;
  private rateLimiter: ReturnType<typeof pLimit>;
  
  constructor(config: Config) {
    this.config = config;
    this.rateLimiter = pLimit(config.requestsPerMinute);
  }
  
  /**
   * Get the current A record IP from deSEC
   */
  async getCurrentARecordIP(): Promise<string | null> {
    return this.rateLimiter(async () => {
      const url = this.buildRecordUrl();
      
      return pRetry(
        async () => {
          try {
            const requestOptions: RequestInit = {
              method: 'GET',
              headers: {
                'Authorization': `Token ${this.config.desecToken}`,
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
              throw new ApiError(`Failed to fetch A record: ${errorText}`, res.status, {
                url,
                status: res.status
              });
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
          retries: this.config.maxRetries,
          onFailedAttempt: error => {
            logger.warn(`Attempt ${error.attemptNumber} failed to fetch A record: ${error.message}`);
          }
        }
      );
    });
  }
  
  /**
   * Update the A record in deSEC
   */
  async updateARecord(ip: string): Promise<void> {
    return this.rateLimiter(async () => {
      // Validate IP before updating
      if (!isValidIPv4(ip)) {
        throw new ApiError(`Invalid IP format: ${ip}`, 400);
      }
      
      const url = this.buildRecordUrl();
      
      const body = JSON.stringify({
        subname: this.config.desecRecord !== '@' ? this.config.desecRecord : '',
        records: [ip],
        ttl: this.config.ttl,
        type: 'A'
      });
      
      return pRetry(
        async () => {
          try {
            const requestOptions: RequestInit = {
              method: 'PUT',
              headers: {
                'Authorization': `Token ${this.config.desecToken}`,
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
              throw new ApiError(`Failed to update A record: ${errorText}`, res.status, {
                url,
                status: res.status,
                ip
              });
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
          retries: this.config.maxRetries,
          onFailedAttempt: error => {
            logger.warn(`Attempt ${error.attemptNumber} failed to update A record: ${error.message}`);
          }
        }
      );
    });
  }
  
  /**
   * Build the URL for the A record
   */
  private buildRecordUrl(): string {
    return this.config.desecRecord !== '@'
      ? `https://desec.io/api/v1/domains/${this.config.desecDomain}/rrsets/${this.config.desecRecord}/A/`
      : `https://desec.io/api/v1/domains/${this.config.desecDomain}/rrsets/.../A/`;
  }
}