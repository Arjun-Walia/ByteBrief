/**
 * Jest Test Setup
 */

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.MONGODB_URI = 'mongodb://localhost:27017/bytebrief_test';
process.env.REDIS_URL = 'redis://localhost:6379';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.console = {
  ...console,
  // Suppress logs during tests unless DEBUG is set
  log: process.env.DEBUG ? console.log : jest.fn(),
  debug: jest.fn(),
  info: process.env.DEBUG ? console.info : jest.fn(),
  warn: console.warn,
  error: console.error,
};
