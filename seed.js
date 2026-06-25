require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const moment = require('moment');

const User = require('./model/userSchema');
const MenuItem = require('./model/menuSchema');
const Table = require('./model/tableSchema');
const Inventory = require('./model/inventorySchema');
const RevenueLog = require('./model/revenueLogSchema');
const Order = require('./model/orderSchema');
const { envConfig } = require('./config/envConfig');

const seed = async () => {
    await mongoose.connect(envConfig.mongoURI);
    console.log('Connected to MongoDB');

    // Clear all collections
    await Promise.all([
        User.deleteMany({}),
        MenuItem.deleteMany({}),
        Table.deleteMany({}),
        Inventory.deleteMany({}),
        RevenueLog.deleteMany({}),
        Order.deleteMany({})
    ]);
    console.log('Collections cleared');

    // ---- Users ----
    const hash = async (p) => bcrypt.hash(p, 10);
    const users = await User.insertMany([
        { name: 'Admin User', email: 'admin@dineease.com', password: await hash('admin123'), role: 'admin' },
        { name: 'Ram Waiter', email: 'waiter@dineease.com', password: await hash('waiter123'), role: 'waiter' },
        { name: 'Sita Kitchen', email: 'kitchen@dineease.com', password: await hash('kitchen123'), role: 'kitchen' },
        { name: 'Unique Shrestha', email: 'customer@dineease.com', password: await hash('customer123'), role: 'customer', totalOrders: 12 },
        { name: 'Hari Prasad', email: 'hari@example.com', password: await hash('pass123'), role: 'customer', totalOrders: 3 },
        { name: 'Gita Sharma', email: 'gita@example.com', password: await hash('pass123'), role: 'customer', totalOrders: 15 }
    ]);
    console.log(`✅ ${users.length} users seeded`);

    // ---- Menu Items ----
    const menuItems = await MenuItem.insertMany([
        // Appetizers
        { name: 'Chicken Momo', description: 'Steamed dumplings with spicy sauce', price: 180, category: 'Appetizer', orderCount: 145, preparationTime: 15, ingredients: ['chicken', 'flour', 'onion', 'garlic'] },
        { name: 'Vegetable Spring Roll', description: 'Crispy roll with mixed vegetables', price: 150, category: 'Appetizer', orderCount: 98, preparationTime: 10, ingredients: ['cabbage', 'carrot', 'flour'] },
        { name: 'Chicken Sekuwa', description: 'Grilled chicken marinated in spices', price: 280, category: 'Appetizer', orderCount: 120, preparationTime: 20, ingredients: ['chicken', 'spices', 'oil'] },
        { name: 'Fish Fry', description: 'Crispy fried fish with tartar sauce', price: 320, category: 'Appetizer', orderCount: 67, preparationTime: 18, ingredients: ['fish', 'flour', 'egg', 'spices'] },
        // Main Course
        { name: 'Dal Bhat Tarkari', description: 'Traditional Nepali set meal', price: 250, category: 'Main Course', orderCount: 210, preparationTime: 20, ingredients: ['rice', 'lentils', 'vegetables', 'ghee'] },
        { name: 'Mutton Curry', description: 'Slow-cooked mutton in rich gravy', price: 450, category: 'Main Course', orderCount: 89, preparationTime: 30, ingredients: ['mutton', 'onion', 'tomato', 'spices'] },
        { name: 'Chicken Biryani', description: 'Fragrant rice with spiced chicken', price: 380, category: 'Main Course', orderCount: 156, preparationTime: 25, ingredients: ['rice', 'chicken', 'saffron', 'spices'] },
        { name: 'Paneer Butter Masala', description: 'Cottage cheese in creamy tomato sauce', price: 320, category: 'Main Course', orderCount: 134, preparationTime: 20, ingredients: ['paneer', 'tomato', 'cream', 'butter'] },
        { name: 'Buff Choila', description: 'Spiced roasted buffalo meat Newari style', price: 350, category: 'Main Course', orderCount: 78, preparationTime: 15, ingredients: ['buffalo meat', 'mustard oil', 'spices'] },
        // Desserts
        { name: 'Sikarni', description: 'Traditional Nepali yogurt dessert', price: 120, category: 'Dessert', orderCount: 88, preparationTime: 5, ingredients: ['yogurt', 'sugar', 'cardamom', 'nuts'] },
        { name: 'Gulab Jamun', description: 'Soft milk dumplings in sugar syrup', price: 100, category: 'Dessert', orderCount: 112, preparationTime: 5, ingredients: ['milk powder', 'flour', 'sugar'] },
        { name: 'Chocolate Lava Cake', description: 'Warm cake with molten chocolate center', price: 220, category: 'Dessert', orderCount: 75, preparationTime: 15, ingredients: ['chocolate', 'butter', 'eggs', 'flour'] },
        // Beverages
        { name: 'Masala Tea', description: 'Spiced milk tea', price: 60, category: 'Beverage', orderCount: 320, preparationTime: 5, ingredients: ['tea', 'milk', 'ginger', 'cardamom'] },
        { name: 'Lassi', description: 'Chilled yogurt drink', price: 80, category: 'Beverage', orderCount: 190, preparationTime: 3, ingredients: ['yogurt', 'milk', 'sugar'] },
        { name: 'Fresh Juice', description: 'Seasonal fresh fruit juice', price: 120, category: 'Beverage', orderCount: 145, preparationTime: 5, ingredients: ['seasonal fruit', 'water'] },
        { name: 'Cold Coffee', description: 'Iced coffee with cream', price: 150, category: 'Beverage', orderCount: 98, preparationTime: 5, ingredients: ['coffee', 'milk', 'sugar', 'cream'] },
        // Snacks
        { name: 'Chatpate', description: 'Spicy tangy puffed rice snack', price: 80, category: 'Snacks', orderCount: 200, preparationTime: 5, ingredients: ['puffed rice', 'spices', 'lemon'] },
        { name: 'Samosa', description: 'Crispy pastry with spiced potatoes', price: 60, category: 'Snacks', orderCount: 178, preparationTime: 8, ingredients: ['potato', 'pastry', 'spices'] },
        // Specials
        { name: "Chef's Thali Special", description: 'Complete meal curated by chef daily', price: 550, category: 'Special', orderCount: 45, preparationTime: 30, ingredients: ['varies'] },
        { name: 'Seafood Platter', description: 'Mixed grilled seafood selection', price: 750, category: 'Special', orderCount: 32, preparationTime: 35, ingredients: ['fish', 'prawns', 'squid', 'spices'] }
    ]);
    console.log(`✅ ${menuItems.length} menu items seeded`);

    // ---- Tables ----
    const QRCode = require('qrcode');
    const tableData = [
        { tableNumber: 1, capacity: 2, location: 'Standard' },
        { tableNumber: 2, capacity: 2, location: 'Window' },
        { tableNumber: 3, capacity: 4, location: 'Standard' },
        { tableNumber: 4, capacity: 4, location: 'Standard' },
        { tableNumber: 5, capacity: 4, location: 'Window' },
        { tableNumber: 6, capacity: 4, location: 'Outdoor' },
        { tableNumber: 7, capacity: 6, location: 'Standard' },
        { tableNumber: 8, capacity: 6, location: 'VIP' },
        { tableNumber: 9, capacity: 8, location: 'VIP' },
        { tableNumber: 10, capacity: 10, location: 'VIP' }
    ];
    for (const t of tableData) {
        const qrData = `http://localhost:3000/order/table/${t.tableNumber}`;
        t.qrCode = await QRCode.toDataURL(qrData);
    }
    const tables = await Table.insertMany(tableData);
    console.log(`✅ ${tables.length} tables seeded`);

    // ---- Inventory ----
    await Inventory.insertMany([
        { name: 'Rice', unit: 'kg', currentStock: 50, minimumThreshold: 10 },
        { name: 'Chicken', unit: 'kg', currentStock: 8, minimumThreshold: 10 }, // low!
        { name: 'Flour', unit: 'kg', currentStock: 25, minimumThreshold: 5 },
        { name: 'Mustard Oil', unit: 'liters', currentStock: 3, minimumThreshold: 5 }, // low!
        { name: 'Onion', unit: 'kg', currentStock: 20, minimumThreshold: 5 },
        { name: 'Tomato', unit: 'kg', currentStock: 15, minimumThreshold: 5 },
        { name: 'Milk', unit: 'liters', currentStock: 30, minimumThreshold: 10 },
        { name: 'Sugar', unit: 'kg', currentStock: 12, minimumThreshold: 5 },
        { name: 'Paneer', unit: 'kg', currentStock: 4, minimumThreshold: 5 }, // low!
        { name: 'Butter', unit: 'kg', currentStock: 6, minimumThreshold: 3 },
        { name: 'Tea Leaves', unit: 'kg', currentStock: 8, minimumThreshold: 2 },
        { name: 'Coffee', unit: 'kg', currentStock: 2, minimumThreshold: 1 }
    ]);
    console.log(`✅ Inventory seeded`);

    // ---- Revenue Logs (14 days for SMA) ----
    const revLogs = [];
    for (let i = 13; i >= 0; i--) {
        const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
        const baseRevenue = 15000 + Math.random() * 10000;
        const totalOrders = Math.floor(20 + Math.random() * 30);
        const hourlyBreakdown = new Map();
        // Simulate realistic hourly patterns
        const peakHours = [12, 13, 19, 20, 21];
        for (let h = 0; h < 24; h++) {
            const isPeak = peakHours.includes(h);
            const count = isPeak ? Math.floor(5 + Math.random() * 8) : Math.floor(Math.random() * 3);
            if (count > 0) hourlyBreakdown.set(String(h), count);
        }
        revLogs.push({ date, totalRevenue: Math.round(baseRevenue), totalOrders, hourlyBreakdown });
    }
    await RevenueLog.insertMany(revLogs);
    console.log(`✅ Revenue logs seeded (14 days)`);

    console.log('\n🎉 DineEase database seeded successfully!\n');
    console.log('Login credentials:');
    console.log('  Admin:   admin@dineease.com   / admin123');
    console.log('  Waiter:  waiter@dineease.com  / waiter123');
    console.log('  Kitchen: kitchen@dineease.com / kitchen123');
    console.log('  Customer:customer@dineease.com/ customer123\n');

    await mongoose.disconnect();
    process.exit(0);
};

seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});
