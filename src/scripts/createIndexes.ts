/**
 * Database Index Migration Script
 * Creates optimized indexes for high-performance queries
 * 
 * Run: npx ts-node src/scripts/createIndexes.ts
 */

import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface IndexOptions {
  unique?: boolean;
  background?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  weights?: Record<string, number>;
  name?: string;
}

interface IndexDefinition {
  collection: string;
  index: Record<string, 1 | -1 | 'text'>;
  options?: IndexOptions;
  reason: string;
}

/**
 * Comprehensive index definitions for all collections
 */
const INDEX_DEFINITIONS: IndexDefinition[] = [
  // ============================================================
  // ARTICLES COLLECTION - Core feed performance
  // ============================================================
  {
    collection: 'articles',
    index: { publishedAt: -1, score: -1 },
    options: { background: true },
    reason: 'Primary feed query: latest articles sorted by date then score',
  },
  {
    collection: 'articles',
    index: { score: -1, publishedAt: -1 },
    options: { background: true },
    reason: 'Top articles query: highest score, then most recent',
  },
  {
    collection: 'articles',
    index: { categorySlug: 1, publishedAt: -1, score: -1 },
    options: { background: true },
    reason: 'Category feed: articles by category sorted by date/score',
  },
  {
    collection: 'articles',
    index: { isFeatured: 1, publishedAt: -1 },
    options: { background: true },
    reason: 'Featured articles query',
  },
  {
    collection: 'articles',
    index: { fingerprint: 1 },
    options: { unique: true, background: true },
    reason: 'Deduplication lookup by content fingerprint',
  },
  {
    collection: 'articles',
    index: { sourceUrl: 1 },
    options: { unique: true, background: true },
    reason: 'Deduplication by source URL',
  },
  {
    collection: 'articles',
    index: { sourceName: 1, publishedAt: -1 },
    options: { background: true },
    reason: 'Filter by news source',
  },
  {
    collection: 'articles',
    index: { clusterId: 1 },
    options: { sparse: true, background: true },
    reason: 'Clustering related articles',
  },
  {
    collection: 'articles',
    index: { tags: 1 },
    options: { background: true },
    reason: 'Tag-based article filtering',
  },
  {
    collection: 'articles',
    index: { createdAt: 1 },
    options: { background: true, expireAfterSeconds: 30 * 24 * 60 * 60 }, // 30 days TTL
    reason: 'Auto-cleanup old articles (optional TTL index)',
  },
  {
    collection: 'articles',
    index: { title: 'text', summary: 'text', tags: 'text' },
    options: { 
      background: true,
      weights: { title: 10, summary: 5, tags: 3 },
      name: 'articles_text_search',
    },
    reason: 'Full-text search across title, summary, and tags',
  },

  // ============================================================
  // USERS COLLECTION
  // ============================================================
  {
    collection: 'users',
    index: { email: 1 },
    options: { unique: true, background: true },
    reason: 'User lookup by email (authentication)',
  },
  {
    collection: 'users',
    index: { 'preferences.categories': 1 },
    options: { background: true },
    reason: 'Filter users by preferred categories (notifications)',
  },
  {
    collection: 'users',
    index: { fcmToken: 1 },
    options: { sparse: true, background: true },
    reason: 'Push notification token lookup',
  },
  {
    collection: 'users',
    index: { createdAt: -1 },
    options: { background: true },
    reason: 'Sort users by registration date',
  },

  // ============================================================
  // BOOKMARKS COLLECTION
  // ============================================================
  {
    collection: 'bookmarks',
    index: { user: 1, article: 1 },
    options: { unique: true, background: true },
    reason: 'Prevent duplicate bookmarks, fast lookup',
  },
  {
    collection: 'bookmarks',
    index: { user: 1, createdAt: -1 },
    options: { background: true },
    reason: 'User bookmark list sorted by date',
  },
  {
    collection: 'bookmarks',
    index: { article: 1 },
    options: { background: true },
    reason: 'Count bookmarks per article',
  },

  // ============================================================
  // CATEGORIES COLLECTION
  // ============================================================
  {
    collection: 'categories',
    index: { slug: 1 },
    options: { unique: true, background: true },
    reason: 'Category lookup by slug',
  },
  {
    collection: 'categories',
    index: { isActive: 1, sortOrder: 1 },
    options: { background: true },
    reason: 'Active categories sorted for navigation',
  },

  // ============================================================
  // NOTIFICATIONS COLLECTION
  // ============================================================
  {
    collection: 'notifications',
    index: { userId: 1, createdAt: -1 },
    options: { background: true },
    reason: 'User notification history',
  },
  {
    collection: 'notifications',
    index: { status: 1, scheduledFor: 1 },
    options: { background: true },
    reason: 'Pending notifications queue',
  },
  {
    collection: 'notifications',
    index: { createdAt: 1 },
    options: { background: true, expireAfterSeconds: 7 * 24 * 60 * 60 }, // 7 days TTL
    reason: 'Auto-cleanup old notifications',
  },
];

/**
 * Create all indexes with progress tracking
 */
async function createIndexes(): Promise<void> {
  console.log('🔧 Starting database index migration...\n');

  try {
    // Connect to database
    await mongoose.connect(env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const def of INDEX_DEFINITIONS) {
      try {
        const collection = db.collection(def.collection);
        
        // Check if index already exists
        const existingIndexes = await collection.indexes();
        const indexKeys = Object.keys(def.index).sort().join(',');
        const exists = existingIndexes.some(idx => {
          const existingKeys = Object.keys(idx.key).sort().join(',');
          return existingKeys === indexKeys;
        });

        if (exists) {
          console.log(`⏭️  [${def.collection}] Index exists: ${JSON.stringify(def.index)}`);
          skipped++;
          continue;
        }

        // Create index
        await collection.createIndex(def.index, def.options || {});
        console.log(`✅ [${def.collection}] Created index: ${JSON.stringify(def.index)}`);
        console.log(`   Reason: ${def.reason}`);
        created++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`❌ [${def.collection}] Failed: ${JSON.stringify(def.index)}`);
        console.log(`   Error: ${errorMessage}`);
        failed++;
      }
    }

    console.log('\n📊 Index Migration Summary:');
    console.log(`   Created: ${created}`);
    console.log(`   Skipped (existing): ${skipped}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total: ${INDEX_DEFINITIONS.length}`);

    // Print collection stats
    console.log('\n📈 Collection Statistics:');
    const collections = ['articles', 'users', 'bookmarks', 'categories', 'notifications'];
    for (const collName of collections) {
      try {
        const count = await db.collection(collName).countDocuments();
        console.log(`   ${collName}: ${count} documents`);
      } catch {
        console.log(`   ${collName}: (empty or not found)`);
      }
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

/**
 * Drop all non-essential indexes (use with caution)
 */
async function dropNonEssentialIndexes(): Promise<void> {
  console.log('⚠️  Dropping non-essential indexes...\n');

  try {
    await mongoose.connect(env.MONGODB_URI);
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    const collections = ['articles', 'users', 'bookmarks', 'categories', 'notifications'];
    
    for (const collName of collections) {
      const collection = db.collection(collName);
      const indexes = await collection.indexes();
      
      for (const idx of indexes) {
        // Keep _id index and unique indexes
        if (idx.name === '_id_' || idx.unique || !idx.name) {
          continue;
        }
        
        await collection.dropIndex(idx.name);
        console.log(`Dropped: ${collName}.${idx.name}`);
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

/**
 * Analyze index usage (requires profiling enabled)
 */
async function analyzeIndexUsage(): Promise<void> {
  console.log('📊 Analyzing index usage...\n');

  try {
    await mongoose.connect(env.MONGODB_URI);
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    const collection = db.collection('articles');
    const indexes = await collection.indexes();

    console.log('Current indexes on articles collection:');
    for (const idx of indexes) {
      console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
    }

    // Get index stats if available
    try {
      const stats = await collection.aggregate([
        { $indexStats: {} }
      ]).toArray();

      console.log('\nIndex access statistics:');
      for (const stat of stats) {
        console.log(`  ${stat.name}:`);
        console.log(`    Operations: ${stat.accesses?.ops || 0}`);
        console.log(`    Since: ${stat.accesses?.since || 'unknown'}`);
      }
    } catch {
      console.log('\nIndex stats not available (requires MongoDB 3.2+)');
    }

  } finally {
    await mongoose.disconnect();
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// CLI interface
const command = process.argv[2];

switch (command) {
  case 'create':
    createIndexes();
    break;
  case 'drop':
    dropNonEssentialIndexes();
    break;
  case 'analyze':
    analyzeIndexUsage();
    break;
  default:
    createIndexes();
}
