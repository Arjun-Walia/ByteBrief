/**
 * Pipeline Module
 * 
 * Production-ready automation pipeline for ByteBrief news processing.
 * 
 * ## Features
 * - Sequential stage execution
 * - Retry logic with exponential backoff
 * - Comprehensive logging
 * - Health monitoring
 * - Metrics collection
 * 
 * ## Usage
 * 
 * ```typescript
 * import { pipelineOrchestrator } from './jobs/pipeline';
 * 
 * // Run full pipeline
 * const result = await pipelineOrchestrator.run();
 * 
 * // Run specific stages
 * const result = await pipelineOrchestrator.run({
 *   stages: [PipelineStage.FETCH, PipelineStage.SUMMARIZE],
 * });
 * 
 * // Get health status
 * const health = pipelineOrchestrator.getHealth();
 * ```
 */

export * from './types';
export * from './stages';
export * from './orchestrator';
