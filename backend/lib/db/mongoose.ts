import mongoose, { Mongoose } from 'mongoose';

/**
 * Global interface augmentation for caching the Mongoose connection in Node.js global object.
 * Prevents multiple connections during serverless cold starts and Next.js hot-reloading (HMR).
 */
export interface GlobalMongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: GlobalMongooseCache | undefined;
}

function getMongoDbUri(): string {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      'Please define the MONGODB_URI environment variable inside .env.local or environment variables.'
    );
  }

  return uri;
}

/**
 * Ensure global.mongooseCache is initialized and assign to local cached variable.
 */
if (!global.mongooseCache) {
  global.mongooseCache = { conn: null, promise: null };
}

const cached: GlobalMongooseCache = global.mongooseCache;

/**
 * Establishes and returns a singleton Mongoose connection suitable for Next.js App Router serverless environment.
 *
 * @returns {Promise<Mongoose>} Active Mongoose connection instance
 */
export async function connectToDatabase(): Promise<Mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    // Resolve runtime configuration only when a request actually needs the
    // database. Importing an API route during `next build` must not require
    // production credentials to exist in the image builder.
    const mongodbUri = getMongoDbUri();
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose.connect(mongodbUri, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectToDatabase;
