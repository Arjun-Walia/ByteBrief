import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  
  // Database
  MONGODB_URI: z.string().url(),
  REDIS_URL: z.string().url(),
  
  // Authentication
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // AI Provider
  AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  
  // News API Keys
  NEWSAPI_KEY: z.string().optional(),
  GNEWS_API_KEY: z.string().optional(),
  
  // Firebase
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  
  // Caching
  CACHE_TTL: z.string().transform(Number).default('3600'),
  
  // Cron Schedules (6 hours for ingestion)
  INGESTION_CRON: z.string().default('0 */6 * * *'),
  RANKING_CRON: z.string().default('0 */6 * * *'),
  NOTIFICATION_CRON: z.string().default('0 8 * * *'),
  CLEANUP_CRON: z.string().default('0 2 * * *'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(e => e.path.join('.')).join(', ');
      console.error(`❌ Missing or invalid environment variables: ${missingVars}`);
      console.error('Please check your .env file against .env.example');
    }
    throw error;
  }
};

export const env = parseEnv();

export default env;
