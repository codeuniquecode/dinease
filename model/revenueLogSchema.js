const mongoose = require('mongoose');

const revenueLogSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD
    totalRevenue: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    hourlyBreakdown: {
        type: Map,
        of: Number,
        default: {}
    } // { "14": 5, "19": 12 } — order count per hour for peak detection
});

module.exports = mongoose.model('RevenueLog', revenueLogSchema);
