const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    unit: { type: String, required: true }, // kg, liters, pieces
    currentStock: { type: Number, required: true, default: 0 },
    minimumThreshold: { type: Number, required: true, default: 10 },
    lastRestocked: { type: Date, default: Date.now },
    isLow: { type: Boolean, default: false }
});

// Auto-calculate isLow
inventorySchema.pre('save', function (next) {
    this.isLow = this.currentStock <= this.minimumThreshold;
    next();
});

module.exports = mongoose.model('Inventory', inventorySchema);
