import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
  try {
    console.log('Connecting to MongoDB...');
    console.log('URI:', process.env.MONGODB_URI?.substring(0, 30) + '...');
    
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    if (!db) {
      console.log('❌ No database connection');
      return;
    }
    
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    const articleCount = await db.collection('articles').countDocuments();
    console.log('Article count:', articleCount);
    
    const categoryCount = await db.collection('categories').countDocuments();
    console.log('Category count:', categoryCount);
    
    if (articleCount > 0) {
      const sample = await db.collection('articles').findOne();
      console.log('Sample article title:', sample?.title);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

check();
