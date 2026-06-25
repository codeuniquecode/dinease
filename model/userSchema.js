const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ['admin', 'waiter', 'kitchen', 'customer'],
        default: 'customer'
    },
    phone: { type: String, required: true, default: null },
    totalOrders: { type: Number, default: 0 }, // for loyalty discount
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
