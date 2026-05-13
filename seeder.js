import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import Series from './models/Series.js';
import Episode from './models/Episode.js';
import Admin from './models/Admin.js';
import bcrypt from 'bcrypt';

dotenv.config();

const args = new Set(process.argv.slice(2));
const weakPasswords = new Set(['password', 'password123', 'admin', 'admin123', '12345678', '123456789']);
let adminCredentials;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function validateAdminPassword(password) {
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters long');
  }

  if (weakPasswords.has(password.toLowerCase())) {
    throw new Error('ADMIN_PASSWORD is too weak');
  }
}

async function upsertAdmin() {
  const { adminUsername, adminPassword } = adminCredentials;

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(adminPassword, salt);

  await Admin.findOneAndUpdate(
    { username: adminUsername },
    { username: adminUsername, passwordHash, role: 'admin' },
    { upsert: true, new: true, runValidators: true }
  );

  console.log(`Admin user "${adminUsername}" created or updated.`);
}

async function clearContent() {
  if (!args.has('--confirm-clear-content')) {
    throw new Error('Refusing to clear content without --confirm-clear-content');
  }

  await Series.deleteMany();
  await Episode.deleteMany();
  console.log('Series and episodes cleared.');
}

async function clearAdmins() {
  if (!args.has('--confirm-clear-admins')) {
    throw new Error('Refusing to clear admins without --confirm-clear-admins');
  }

  await Admin.deleteMany();
  console.log('Admins cleared.');
}

async function run() {
  try {
    if (!args.has('--clear-content') && !args.has('--clear-admins')) {
      const adminUsername = requireEnv('ADMIN_USERNAME');
      const adminPassword = requireEnv('ADMIN_PASSWORD');
      validateAdminPassword(adminPassword);
      adminCredentials = { adminUsername, adminPassword };
    }

    await connectDB();

    if (args.has('--clear-content')) {
      await clearContent();
    }

    if (args.has('--clear-admins')) {
      await clearAdmins();
    }

    if (!args.has('--clear-content') && !args.has('--clear-admins')) {
      await upsertAdmin();
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  }
}

run();
