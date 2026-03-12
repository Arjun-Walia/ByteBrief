import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkSources() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  
  // Get source distribution
  const sources = await db.collection('articles').aggregate([
    { $group: { _id: '$sourceName', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  console.log('📊 Source distribution:');
  sources.forEach(s => console.log(`   ${s._id}: ${s.count} articles`));
  
  // Get category distribution
  const categories = await db.collection('articles').aggregate([
    { $group: { _id: '$categorySlug', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  console.log('\n📂 Category distribution:');
  categories.forEach(c => console.log(`   ${c._id}: ${c.count} articles`));
  
  // Get sample from each source
  console.log('\n📰 Sample articles by source:');
  for (const source of sources) {
    const article = await db.collection('articles').findOne({ sourceName: source._id });
    if (article) {
      console.log(`\n   [${source._id}]`);
      console.log(`   Title: ${article.title?.substring(0, 60)}...`);
    }
  }
  
  await mongoose.disconnect();
}

checkSources();
