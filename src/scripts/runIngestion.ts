/**
 * Run news ingestion manually
 * Fetches articles from all configured news sources
 */

import mongoose from 'mongoose';
import { config } from 'dotenv';
import { IngestionOrchestrator } from '../services/ingestion/orchestrator';

config();

async function runIngestion() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bytebrief';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔄 Starting news ingestion...\n');
    
    const orchestrator = new IngestionOrchestrator();
    const result = await orchestrator.runIngestion();

    console.log('\n📊 Ingestion Results:');
    console.log(`   Total fetched: ${result.totalFetched}`);
    console.log(`   New articles: ${result.totalNew}`);
    console.log(`   Duplicates: ${result.totalDuplicates}`);
    console.log(`   Errors: ${result.totalErrors}`);
    
    console.log('\n📰 Source breakdown:');
    for (const source of result.sourceResults) {
      console.log(`   ${source.source}: ${source.new} new, ${source.fetched} fetched, ${source.errors} errors`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Ingestion failed:', error);
    process.exit(1);
  }
}

runIngestion();
