/**
 * Validation utilities
 */
import validator from 'validator';
import logger from './logger';
import { AppError } from '../types/types';

/**
 * Validate if a string is a valid IPv4 address
 */
export const isValidIPv4 = (ip: string): boolean => {
  return validator.isIP(ip, 4);
};

/**
 * Validate if a string is a valid FQDN (Fully Qualified Domain Name)
 */
export const isValidDomain = (domain: string): boolean => {
  return validator.isFQDN(domain);
};

/**
 * Validate and parse a positive integer from a string
 */
export const validatePositiveInteger = (
  value: string, 
  name: string, 
  defaultValue: number
): number => {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    logger.warn(`Invalid ${name} value: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
};

/**
 * Validate required value
 */
export const validateRequired = <T>(
  value: T | null | undefined, 
  name: string
): T => {
  if (value === null || value === undefined) {
    throw new AppError(`Missing required value: ${name}`);
  }
  return value;
};