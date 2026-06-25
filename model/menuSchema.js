const mongoose = require('mongoose');

const menuSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true },
    category: {
        type: String,
        required: true,
        enum: ['Appetizer', 'Main Course', 'Dessert', 'Beverage', 'Snacks', 'Special']
    },
    image: { type: String, default: 'default-food.jpg' },
    isAvailable: { type: Boolean, default: true },
    ingredients: [{ type: String }], // links to inventory
    preparationTime: { type: Number, default: 15 }, // minutes
    orderCount: { type: Number, default: 0 }, // for best-selling algo
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MenuItem', menuSchema);
