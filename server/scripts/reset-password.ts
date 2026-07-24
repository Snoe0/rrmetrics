/**
 * CLI password reset for the self-hosted server.
 * Usage: npm run reset-password -- <email> <new-password>
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { initDb } from '../src/db/connection';
import * as profilesDb from '../src/db/profiles';

const BCRYPT_COST = 10;

const main = async () => {
  const [email, newPassword] = process.argv.slice(2);

  if (!email || !newPassword) {
    console.error('Usage: npm run reset-password -- <email> <new-password>');
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const db = initDb();
  const profile = await profilesDb.findByEmail(db, email.trim().toLowerCase());

  if (!profile) {
    console.error(`No account found for ${email}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await profilesDb.updatePasswordHash(db, profile.id, passwordHash);

  console.log(`Password updated for ${profile.email}`);
};

main();
