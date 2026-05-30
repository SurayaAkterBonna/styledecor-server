import { MongoClient, ServerApiVersion } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let dbInstance = null;

export const connectDB = async () => {
  if (dbInstance) return dbInstance;
  try {
    await client.connect();
    dbInstance = client.db('styledecor');
    console.log('Successfully linked and connected database instance via MongoDB Driver Client Pool.');
    
    const usersCollection = dbInstance.collection('users');
    
    const adminExists = await usersCollection.findOne({ email: 'admin@styledecor.com' });
    if (!adminExists) {
      await usersCollection.insertOne({
        email: 'admin@styledecor.com',
        name: 'System Admin',
        role: 'admin',
        createdAt: new Date()
      });
    }
    
    const decoratorExists = await usersCollection.findOne({ email: 'decorator@styledecor.com' });
    if (!decoratorExists) {
      await usersCollection.insertOne({
        email: 'decorator@styledecor.com',
        name: 'Lead Decorator',
        role: 'decorator',
        specialty: 'Wedding Planning & Floral Arrangement',
        status: 'approved',
        createdAt: new Date()
      });
    }

    return dbInstance;
  } catch (error) {
    console.error('Database instantiation initialization break:', error);
    throw error;
  }
};

export const getDB = () => {
  if (!dbInstance) {
    throw new Error('Database must be initialized prior to pulling context instances.');
  }
  return dbInstance;
};