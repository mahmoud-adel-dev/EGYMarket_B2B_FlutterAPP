import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const uri = process.env.MONGODB_URI;
const password = process.env.TEST_ADMIN_PASSWORD;
const testEmails = ['memo@seals.local', 'superadmin@seals.local'];

if (!uri || !password || password.length < 12) {
  throw new Error('Set MONGODB_URI and TEST_ADMIN_PASSWORD (minimum 12 characters).');
}

await mongoose.connect(uri);
try {
  const users = mongoose.connection.collection('users');
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await users.updateMany(
    { email: { $in: testEmails }, role: 'Admin', isActive: true },
    {
      $set: { passwordHash, updatedAt: new Date() },
      $unset: { failed_login_attempts: '', locked_until: '' },
    },
  );

  console.log(JSON.stringify({ matched: result.matchedCount, updated: result.modifiedCount, emails: testEmails }));
} finally {
  await mongoose.disconnect();
}
