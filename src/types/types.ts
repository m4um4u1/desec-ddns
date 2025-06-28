/**
 * Type definitions for the application
 */

/**
 * Application configuration
 */
export interface Config {
  desecToken: string;
  desecDomain: string;
  desecRecord: string;
  intervalSeconds: number;
  maxRetries: number;
  requestsPerMinute: number;
  ttl: number;
}

/**
 * IP Provider definition
 */
export interface IpProvider {
  name: string;
  url: string;
  parser: (data: any) => string;
}

/**
 * HTTP Request options
 */
export interface RequestOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
  agent?: any;
  timeout?: number;
}

/**
 * Error with additional context
 */
export class AppError extends Error {
  public context?: Record<string, any>;
  
  constructor(message: string, context?: Record<string, any>) {
    super(message);
    this.name = 'AppError';
    this.context = context;
  }
}

/**
 * API Error with status code
 */
export class ApiError extends AppError {
  public statusCode: number;
  
  constructor(message: string, statusCode: number, context?: Record<string, any>) {
    super(message, context);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}