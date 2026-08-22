import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^([^#=]+)=(.*)$/.exec(line);
    if (match && process.env[match[1].trim()] === undefined) process.env[match[1].trim()] = match[2];
  }
}
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

await mongoose.connect(process.env.MONGODB_URI);
const conversations = mongoose.connection.collection('conversations');
await conversations.updateMany(
  { conversation_type: { $exists: false }, order_id: { $exists: true } },
  { $set: { conversation_type: 'order' } }
);
const indexes = await conversations.indexes();
const orderIndex = indexes.find((index) => index.name === 'order_id_1');
if (orderIndex && !orderIndex.sparse) await conversations.dropIndex('order_id_1');
await conversations.createIndex({ order_id: 1 }, { unique: true, sparse: true, name: 'order_id_1' });
await conversations.createIndex(
  { product_id: 1, initiated_by_organization_id: 1 },
  {
    unique: true,
    name: 'product_id_1_initiated_by_organization_id_1',
    partialFilterExpression: { conversation_type: 'inquiry' },
  }
);
console.log(JSON.stringify({ migrated: true }));
await mongoose.disconnect();
