const mongoose = require('mongoose');
const { envConfig } = require('./envConfig');

const connectDB = async () => {
    try {
        await mongoose.connect(envConfig.mongoURI);
        console.log('DB connected - DineEase');
    } catch (err) {
        console.error(' MongoDB connection error:', err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
