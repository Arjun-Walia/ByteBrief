/**
 * Manual Pipeline Runner
 * 
 * Run the news processing pipeline manually from the command line.
 * 
 * Usage:
 *   npx ts-node src/scripts/runPipeline.ts          # Full pipeline
 *   npx ts-node src/scripts/runPipeline.ts ingest   # Ingestion only
 *   npx ts-node src/scripts/runPipeline.ts rank     # Ranking only
 *   npx ts-node src/scripts/runPipeline.ts notify   # Notifications only
 *   npx ts-node src/scripts/runPipeline.ts status   # Show pipeline status
 */

import mongoose from 'mongoose';
import { env } from '../config/env';
import { pipelineOrchestrator, PipelineStage } from '../jobs/pipeline';

const COMMANDS = ['full', 'ingest', 'rank', 'notify', 'status', 'help'];

async function connectDatabase(): Promise<void> {
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(env.MONGODB_URI);
  console.log('✅ Database connected');
}

async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.log('🔌 Database disconnected');
}

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║               ByteBrief Pipeline Runner                       ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Usage: npx ts-node src/scripts/runPipeline.ts [command]     ║
║                                                              ║
║  Commands:                                                   ║
║    full     - Run full pipeline (default)                    ║
║              Fetch → Summarize → Rank → Cluster → Cache      ║
║                                                              ║
║    ingest   - Run ingestion pipeline only                    ║
║              Fetch → Summarize → Rank → Cluster → Cache      ║
║                                                              ║
║    rank     - Run ranking pipeline only                      ║
║              Rank → Cluster → Cache                          ║
║                                                              ║
║    notify   - Run notification pipeline only                 ║
║              Send daily digest notifications                 ║
║                                                              ║
║    status   - Show pipeline status and metrics               ║
║                                                              ║
║    help     - Show this help message                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
}

async function showStatus(): Promise<void> {
  const state = pipelineOrchestrator.getState();
  const health = pipelineOrchestrator.getHealth();
  const metrics = pipelineOrchestrator.getMetrics();

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Pipeline Status                           ║
╠══════════════════════════════════════════════════════════════╣
║  Current State                                               ║
║  ─────────────                                               ║
║  Status: ${health.status.padEnd(20)}                         ║
║  Healthy: ${(health.healthy ? '✅ Yes' : '❌ No').padEnd(19)}║
║  Consecutive Failures: ${String(health.consecutiveFailures).padEnd(10)}                ║
╠══════════════════════════════════════════════════════════════╣
║  Metrics                                                     ║
║  ───────                                                     ║
║  Total Runs: ${String(metrics.totalRuns).padEnd(15)}                       ║
║  Successful: ${String(metrics.successfulRuns).padEnd(15)}                       ║
║  Failed: ${String(metrics.failedRuns).padEnd(19)}                       ║
║  Avg Duration: ${(metrics.averageDurationMs / 1000).toFixed(1)}s                                     ║
╠══════════════════════════════════════════════════════════════╣
║  Last Run                                                    ║
║  ────────                                                    ║`);

  if (state.lastRun) {
    console.log(`║  Pipeline ID: ${state.lastRun.pipelineId.slice(0, 20)}...            ║`);
    console.log(`║  Status: ${state.lastRun.status.padEnd(20)}                        ║`);
    console.log(`║  Duration: ${(state.lastRun.totalDuration / 1000).toFixed(1)}s                                           ║`);
    console.log(`║  Stages: ${state.lastRun.summary.successfulStages}/${state.lastRun.summary.totalStages} successful                              ║`);
    console.log(`║  Items: ${state.lastRun.summary.totalItemsProcessed} processed                                ║`);
  } else {
    console.log(`║  No runs recorded yet                                        ║`);
  }

  console.log(`╚══════════════════════════════════════════════════════════════╝`);
}

function printResult(result: Awaited<ReturnType<typeof pipelineOrchestrator.run>>): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   Pipeline Result                            ║
╠══════════════════════════════════════════════════════════════╣`);
  
  const statusIcon = result.status === 'completed' ? '✅' : 
                     result.status === 'partial' ? '⚠️' : '❌';
  
  console.log(`║  Status: ${statusIcon} ${result.status.toUpperCase().padEnd(15)}                       ║`);
  console.log(`║  Pipeline ID: ${result.pipelineId.slice(0, 20)}...            ║`);
  console.log(`║  Duration: ${(result.totalDuration / 1000).toFixed(1)}s                                           ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  console.log(`║  Stage Results                                               ║`);
  console.log(`║  ─────────────                                               ║`);
  
  for (const stage of result.stageResults) {
    const icon = stage.success ? '✓' : '✗';
    const duration = (stage.duration / 1000).toFixed(1);
    console.log(`║  ${icon} ${stage.stage.padEnd(12)} │ ${String(stage.itemsProcessed).padEnd(5)} items │ ${duration}s              ║`);
    
    if (stage.error) {
      const shortError = stage.error.slice(0, 40);
      console.log(`║    Error: ${shortError}...                ║`);
    }
  }
  
  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  console.log(`║  Summary                                                     ║`);
  console.log(`║  ───────                                                     ║`);
  console.log(`║  Total Stages: ${result.summary.totalStages}                                           ║`);
  console.log(`║  Successful: ${result.summary.successfulStages}                                             ║`);
  console.log(`║  Failed: ${result.summary.failedStages}                                                 ║`);
  console.log(`║  Items Processed: ${result.summary.totalItemsProcessed}                                     ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
}

async function main(): Promise<void> {
  const command = process.argv[2]?.toLowerCase() || 'full';
  
  if (command === 'help') {
    printHelp();
    return;
  }
  
  if (!COMMANDS.includes(command)) {
    console.error(`❌ Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
  
  try {
    await connectDatabase();
    
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║               ByteBrief Pipeline Runner                       ║
╠══════════════════════════════════════════════════════════════╣
║  Command: ${command.padEnd(20)}                              ║
║  Started: ${new Date().toISOString()}                ║
╚══════════════════════════════════════════════════════════════╝
`);
    
    let result;
    
    switch (command) {
      case 'full':
      case 'ingest':
        console.log('🚀 Running ingestion pipeline...');
        console.log('   Stages: Fetch → Summarize → Rank → Cluster → Cache');
        console.log('');
        result = await pipelineOrchestrator.runIngestionPipeline();
        printResult(result);
        break;
        
      case 'rank':
        console.log('🚀 Running ranking pipeline...');
        console.log('   Stages: Rank → Cluster → Cache');
        console.log('');
        result = await pipelineOrchestrator.runRankingPipeline();
        printResult(result);
        break;
        
      case 'notify':
        console.log('🚀 Running notification pipeline...');
        console.log('   Stages: Notify');
        console.log('');
        result = await pipelineOrchestrator.runNotificationPipeline();
        printResult(result);
        break;
        
      case 'status':
        await showStatus();
        break;
    }
    
    await disconnectDatabase();
    
  } catch (error) {
    console.error('❌ Pipeline error:', error);
    await disconnectDatabase();
    process.exit(1);
  }
}

main();
