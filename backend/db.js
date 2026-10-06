 

const mongoose = require('mongoose');

async function connectDB() {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1); // stop the app if we can't connect to the database
  }
}

module.exports = connectDB;
