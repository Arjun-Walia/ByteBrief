/**
 * Clustering Module Exports
 * 
 * Duplicate detection and article clustering for news aggregation.
 */

export * from './types';
export * from './similarity';
export * from './clustering';

// Default exports
export { SimilarityEngine, similarityEngine } from './similarity';
export { ClusteringService, clusteringService } from './clustering';
