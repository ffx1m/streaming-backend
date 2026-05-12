import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import Series from './models/Series.js';
import Episode from './models/Episode.js';
import Admin from './models/Admin.js';
import bcrypt from 'bcrypt';

dotenv.config();
connectDB();

const importData = async () => {
  try {
    await Series.deleteMany();
    await Episode.deleteMany();
    await Admin.deleteMany();

    // Create Admin
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'password123';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);
    await Admin.create({ username: adminUsername, passwordHash, role: 'admin' });

    console.log('Admin User Created and Data Cleared!');
    process.exit();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

if (process.argv[2] === '-d') {
  // Can add logic to destroy data here
} else {
  importData();
}