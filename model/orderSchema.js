const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, default: 1 },
    category: { type: String, required: true },
    specialNote: { type: String, default: '' }
});

const orderSchema = new mongoose.Schema({
    orderNumber: { type: String, unique: true },
    table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    waiter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    items: [orderItemSchema],

    // State machine: Placed → Confirmed → Preparing → Ready → Served → Billed → Completed
    status: {
        type: String,
        enum: ['placed', 'confirmed', 'preparing', 'ready', 'served', 'billed', 'completed', 'cancelled'],
        default: 'placed'
    },

    // Billing
    subtotal: { type: Number, default: 0 },
    discounts: {
        loyalty: { type: Number, default: 0 },
        combo: { type: Number, default: 0 },
        happyHour: { type: Number, default: 0 }
    },
    discountAmount: { type: Number, default: 0 },
    vatAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },

    // For priority algorithm
    priorityScore: { type: Number, default: 0 },
    placedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },

    // Payment
    isPaid: { type: Boolean, default: false },
    paymentMethod: { type: String, enum: ['cash', 'card', 'esewa', null], default: null },

    // QR order flag
    isQROrder: { type: Boolean, default: false }
});

// Auto-generate order number before save
orderSchema.pre('save', async function (next) {
    if (!this.orderNumber) {
        const count = await mongoose.model('Order').countDocuments();
        this.orderNumber = `ORD-${String(count + 1).padStart(4, '0')}`;
    }
    next();
});

module.exports = mongoose.model('Order', orderSchema);
