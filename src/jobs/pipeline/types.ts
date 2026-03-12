/**
 * Pipeline Types and Interfaces
 * 
 * Defines the contract for the news processing pipeline.
 */

export enum PipelineStage {
  FETCH = 'fetch',
  DEDUPE = 'dedupe',
  SUMMARIZE = 'summarize',
  RANK = 'rank',
  CLUSTER = 'cluster',
  CACHE = 'cache',
  NOTIFY = 'notify',
}

export enum PipelineStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIAL = 'partial', // Some stages succeeded, some failed
}

export interface StageResult {
  stage: PipelineStage;
  success: boolean;
  duration: number;
  itemsProcessed: number;
  error?: string;
  details?: Record<string, unknown>;
  startedAt: Date;
  completedAt: Date;
}

export interface PipelineResult {
  pipelineId: string;
  status: PipelineStatus;
  startedAt: Date;
  completedAt?: Date;
  totalDuration: number;
  stageResults: StageResult[];
  summary: {
    totalStages: number;
    successfulStages: number;
    failedStages: number;
    totalItemsProcessed: number;
  };
}

export interface PipelineConfig {
  // General settings
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  
  // Stage-specific settings
  stages: {
    fetch: {
      enabled: boolean;
    };
    dedupe: {
      enabled: boolean;
      similarityThreshold: number;
    };
    summarize: {
      enabled: boolean;
      batchSize: number;
      maxConcurrent: number;
    };
    rank: {
      enabled: boolean;
    };
    cluster: {
      enabled: boolean;
    };
    cache: {
      enabled: boolean;
      clearPatterns: string[];
    };
    notify: {
      enabled: boolean;
      sendDigest: boolean;
      sendBreakingNews: boolean;
    };
  };
}

export interface PipelineState {
  currentStage: PipelineStage | null;
  status: PipelineStatus;
  startedAt: Date | null;
  lastRun: PipelineResult | null;
  runHistory: PipelineResult[];
  consecutiveFailures: number;
}

export interface PipelineMetrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDurationMs: number;
  lastRunAt: Date | null;
  uptime: number;
  stageMetrics: Record<PipelineStage, {
    runs: number;
    successes: number;
    failures: number;
    avgDuration: number;
  }>;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  maxRetries: 3,
  retryDelayMs: 5000,
  timeoutMs: 300000, // 5 minutes
  
  stages: {
    fetch: {
      enabled: true,
    },
    dedupe: {
      enabled: true,
      similarityThreshold: 0.8,
    },
    summarize: {
      enabled: true,
      batchSize: 50,
      maxConcurrent: 5,
    },
    rank: {
      enabled: true,
    },
    cluster: {
      enabled: true,
    },
    cache: {
      enabled: true,
      clearPatterns: ['articles:*', 'feed:*'],
    },
    notify: {
      enabled: true,
      sendDigest: true,
      sendBreakingNews: true,
    },
  },
};
