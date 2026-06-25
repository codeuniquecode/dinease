const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
    tableNumber: { type: Number, required: true, unique: true },
    capacity: { type: Number, required: true },
    location: {
        type: String,
        enum: ['Standard', 'Window', 'VIP', 'Outdoor'],
        default: 'Standard'
    },
    status: {
        type: String,
        enum: ['available', 'occupied', 'reserved', 'maintenance'],
        default: 'available'
    },
    qrCode: { type: String, default: null }, // base64 QR code
    currentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null }
});

module.exports = mongoose.model('Table', tableSchema);
