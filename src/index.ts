/**
 * deSEC DDNS Updater
 * 
 * A secure tool to update a desec.io A record to the current public IP
 */
import { loadConfig } from './config';
import { IpProviderService } from './services/ip-provider';
import { DesecApiService } from './services/desec-api';
import logger from './utils/logger';

/**
 * Main application class
 */
class DesecDdnsUpdater {
  private config = loadConfig();
  private ipProviderService: IpProviderService;
  private desecApiService: DesecApiService;
  
  constructor() {
    this.ipProviderService = new IpProviderService(this.config);
    this.desecApiService = new DesecApiService(this.config);
    
    // Setup global error handlers
    this.setupErrorHandlers();
  }
  
  /**
   * Setup global error handlers
   */
  private setupErrorHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { 
        error: err.message, 
        stack: err.stack 
      });
      process.exit(1);
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { 
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined
      });
      process.exit(1);
    });
  }
  
  /**
   * Start the monitoring and update process
   */
  async start(): Promise<void> {
    logger.info('Starting deSEC DDNS updater', { 
      domain: this.config.desecDomain, 
      record: this.config.desecRecord 
    });
    
    await this.monitorAndUpdateIP();
  }
  
  /**
   * Monitor and update IP address
   */
  private async monitorAndUpdateIP(): Promise<void> {
    let lastIp: string | null = null;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;
    
    // Initial fetch of current A record
    try {
      lastIp = await this.desecApiService.getCurrentARecordIP();
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
        const ip = await this.ipProviderService.getPublicIP();
        
        // Check if IP has changed
        if (ip !== lastIp) {
          logger.info('IP address change detected', { oldIp: lastIp, newIp: ip });
          await this.desecApiService.updateARecord(ip);
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
      logger.debug(`Waiting ${this.config.intervalSeconds} seconds until next check`);
      await new Promise(resolve => setTimeout(resolve, this.config.intervalSeconds * 1000));
    }
  }
}

// Create and start the application
const app = new DesecDdnsUpdater();
app.start().catch(err => {
  logger.error('Fatal error in main process', { 
    error: err instanceof Error ? err.message : String(err) 
  });
  process.exit(1);
});