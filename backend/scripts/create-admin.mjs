import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const uri = process.env.MONGODB_URI;
const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const name = process.env.ADMIN_BOOTSTRAP_NAME || 'Platform Admin';
if (!uri || !email || !password || password.length < 12) {
  throw new Error('Set MONGODB_URI, ADMIN_BOOTSTRAP_EMAIL, and ADMIN_BOOTSTRAP_PASSWORD (12+ characters).');
}
await mongoose.connect(uri);
const users = mongoose.connection.collection('users');
const existing = await users.findOne({ email });
if (existing && existing.role !== 'Admin') throw new Error('Email belongs to a non-admin account. Refusing to change its role.');
const passwordHash = await bcrypt.hash(password, 12);
await users.updateOne(
  { email },
  {
    $set: { name, email, passwordHash, role: 'Admin', isActive: true, email_verified_at: new Date(), updatedAt: new Date() },
    $setOnInsert: { phone: 'admin', location: { governorate: 'Cairo' }, session_version: 0, createdAt: new Date() },
  },
  { upsert: true }
);
await mongoose.disconnect();
console.log('Admin account is ready. Remove bootstrap password from the environment now.');
