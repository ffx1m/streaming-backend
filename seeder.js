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
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);
    await Admin.create({ username: 'admin', passwordHash, role: 'admin' });

    // Create Series
    const seriesList = [];
    for (let i = 1; i <= 24; i++) {
      const category = i % 3 === 0 ? 'romance' : i % 2 === 0 ? 'action' : 'comedy';
      const languageType = i % 2 === 0 ? 'thai_dub' : 'thai_sub';
      const isPopular = i <= 6;
      const isNewSeries = i >= 18;

      seriesList.push({
        title: `ซีรีส์สุดฮิตเรื่องที่ ${i}`,
        slug: `popular-series-${i}`,
        description: 'นี่คือคำอธิบายของซีรีส์เรื่องนี้ เป็นเรื่องราวที่น่าติดตามและสนุกสนาน',
        posterUrl: `https://placehold.co/300x400/1C1C1E/FFFFFF?text=Series+${i}`,
        category,
        languageType,
        totalEpisodes: 10,
        views: Math.floor(Math.random() * 100000),
        isPopular,
        isNewSeries
      });
    }

    const createdSeries = await Series.insertMany(seriesList);

    // Create Episodes for each series
    const episodesList = [];
    for (const series of createdSeries) {
      for (let j = 1; j <= series.totalEpisodes; j++) {
        episodesList.push({
          seriesId: series._id,
          episodeNumber: j,
          title: `ตอนที่ ${j}`,
          videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
          views: Math.floor(Math.random() * 10000)
        });
      }
    }

    await Episode.insertMany(episodesList);

    console.log('Data Imported!');
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