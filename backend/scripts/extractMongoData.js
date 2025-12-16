import { MongoClient } from 'mongodb';

const uri = 'mongodb://localhost:27017';
const dbName = 'suivi2025';

async function extractData() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(dbName);

    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('\n=== Collections ===');
    console.log(collections.map(c => c.name));

    // Try to find districts
    for (const collName of ['districts', 'district', 'Districts']) {
      try {
        const coll = db.collection(collName);
        const count = await coll.countDocuments();
        if (count > 0) {
          console.log(`\n=== ${collName} (${count} documents) ===`);
          const docs = await coll.find({}).limit(5).toArray();
          console.log(JSON.stringify(docs, null, 2));
        }
      } catch (e) {}
    }

    // Try to find groups
    for (const collName of ['groups', 'group', 'Groups', 'groupes', 'Groupes']) {
      try {
        const coll = db.collection(collName);
        const count = await coll.countDocuments();
        if (count > 0) {
          console.log(`\n=== ${collName} (${count} documents) ===`);
          const docs = await coll.find({}).limit(5).toArray();
          console.log(JSON.stringify(docs, null, 2));
        }
      } catch (e) {}
    }

    // Try to find units/troupes
    for (const collName of ['units', 'unit', 'Units', 'troupes', 'Troupes', 'troupe']) {
      try {
        const coll = db.collection(collName);
        const count = await coll.countDocuments();
        if (count > 0) {
          console.log(`\n=== ${collName} (${count} documents) ===`);
          const docs = await coll.find({}).limit(5).toArray();
          console.log(JSON.stringify(docs, null, 2));
        }
      } catch (e) {}
    }

    // Check all collections with sample data
    console.log('\n=== All collections with sample data ===');
    for (const coll of collections) {
      const collection = db.collection(coll.name);
      const count = await collection.countDocuments();
      if (count > 0) {
        console.log(`\n--- ${coll.name} (${count} documents) ---`);
        const sample = await collection.findOne();
        console.log('Sample document keys:', Object.keys(sample || {}));
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

extractData();
