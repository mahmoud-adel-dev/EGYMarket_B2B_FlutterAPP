import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^([^#=]+)=(.*)$/.exec(line);
    if (match && process.env[match[1].trim()] === undefined) {
      process.env[match[1].trim()] = match[2];
    }
  }
}

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

await mongoose.connect(process.env.MONGODB_URI);
try {
  const products = mongoose.connection.collection('products');
  const duplicateSkus = await products
    .aggregate([
      { $match: { organization_id: { $exists: true }, sku: { $type: 'string' } } },
      {
        $group: {
          _id: { organization_id: '$organization_id', sku: '$sku' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 10 },
    ])
    .toArray();

  if (duplicateSkus.length) {
    throw new Error(
      `Cannot create the product SKU index: duplicate organization/SKU values exist: ${JSON.stringify(duplicateSkus)}`
    );
  }

  const indexName = 'organization_id_1_sku_1';
  const indexes = await products.indexes();
  const current = indexes.find((index) => index.name === indexName);
  const alreadyPartial =
    current?.unique === true &&
    current.partialFilterExpression?.sku?.$type === 'string';

  if (!alreadyPartial) {
    if (current) await products.dropIndex(indexName);
    await products.createIndex(
      { organization_id: 1, sku: 1 },
      {
        name: indexName,
        unique: true,
        partialFilterExpression: { sku: { $type: 'string' } },
      }
    );
  }

  console.log(
    JSON.stringify({
      migrated: !alreadyPartial,
      index: indexName,
      rule: 'unique organization/SKU only when SKU is a string',
    })
  );
} finally {
  await mongoose.disconnect();
}
