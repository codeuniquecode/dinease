require('dotenv').config();

exports.envConfig = {
    mongoURI: process.env.MONGO_URI || 'mongodb://localhost:27017/dineease',
    port: process.env.PORT || 3000,
    secretKey: process.env.SECRET_KEY || 'dineease_secret_2024',
    vatRate: 0.13 // 13% Nepal VAT
};
