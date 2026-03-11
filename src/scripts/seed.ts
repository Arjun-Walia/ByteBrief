import mongoose from 'mongoose';
import { config } from 'dotenv';
import { Category } from '../models';

config();

const categories = [
  { name: 'AI', slug: 'ai', description: 'Artificial Intelligence & Machine Learning', icon: 'smart_toy', color: '#8B5CF6', sortOrder: 1 },
  { name: 'Startups', slug: 'startups', description: 'Startup news and funding rounds', icon: 'rocket_launch', color: '#F59E0B', sortOrder: 2 },
  { name: 'Security', slug: 'security', description: 'Cybersecurity and privacy', icon: 'security', color: '#EF4444', sortOrder: 3 },
  { name: 'DevTools', slug: 'devtools', description: 'Developer tools and frameworks', icon: 'code', color: '#10B981', sortOrder: 4 },
  { name: 'Tech', slug: 'tech', description: 'General technology news', icon: 'devices', color: '#3B82F6', sortOrder: 5 },
];

async function seed() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bytebrief';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Clear existing categories
    await Category.deleteMany({});
    console.log('Cleared existing categories');

    // Insert categories
    await Category.insertMany(categories);
    console.log(`Inserted ${categories.length} categories`);

    console.log('Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();
