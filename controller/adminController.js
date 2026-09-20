const User = require('../model/userSchema');
const MenuItem = require('../model/menuSchema');
const Order = require('../model/orderSchema');
const Table = require('../model/tableSchema');
const Inventory = require('../model/inventorySchema');
const RevenueLog = require('../model/revenueLogSchema');
const { buildForecastSeries, detectPeakHours } = require('../services/algorithms');
const moment = require('moment');

exports.renderDashboard = async (req, res) => {
    try {
        // --- Basic stats ---
        const totalUsers = await User.countDocuments({ role: 'customer' });
        const totalOrders = await Order.countDocuments();
        const totalRevenue = await Order.aggregate([
            { $match: { isPaid: true } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        const pendingOrders = await Order.countDocuments({ status: { $in: ['placed', 'confirmed', 'preparing'] } });
        const lowInventory = await Inventory.countDocuments({ isLow: true });

        // --- Algorithm 1: SMA Revenue Forecast ---
        const last14Days = await RevenueLog.find().sort({ date: -1 }).limit(14);
        const revenueHistory = last14Days.reverse();
        const forecastSeries = buildForecastSeries(revenueHistory);

        // --- Algorithm 5: Peak Hour Detection ---
        const today = moment().format('YYYY-MM-DD');
        const todayLog = await RevenueLog.findOne({ date: today });
        const hourlyRaw = new Array(24).fill(0);
        if (todayLog && todayLog.hourlyBreakdown) {
            todayLog.hourlyBreakdown.forEach((val, key) => {
                const h = parseInt(key);
                if (h >= 0 && h < 24) hourlyRaw[h] = val;
            });
        }
        const peakData = detectPeakHours(hourlyRaw);

        // --- Best-selling items ---
        const bestSellers = await MenuItem.find()
            .sort({ orderCount: -1 })
            .limit(5)
            .select('name category orderCount price');

        // --- Category revenue ---
        const categoryRevenue = await Order.aggregate([
            { $match: { isPaid: true } },
            { $unwind: '$items' },
            { $group: { _id: '$items.category', revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }, count: { $sum: '$items.quantity' } } },
            { $sort: { revenue: -1 } }
        ]);

        res.render('admin/dashboard', {
            flashMessage: req.flash(),
            stats: {
                totalUsers,
                totalOrders,
                totalRevenue: totalRevenue[0]?.total || 0,
                pendingOrders,
                lowInventory
            },
            forecastSeries: JSON.stringify(forecastSeries),
            peakData: JSON.stringify(peakData),
            bestSellers,
            categoryRevenue: JSON.stringify(categoryRevenue)
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Dashboard load failed');
        res.redirect('/');
    }
};

// ---- Menu Management ----
exports.renderMenu = async (req, res) => {
    const menuItems = await MenuItem.find().sort({ category: 1, name: 1 });
    res.render('admin/menu', { menuItems, flashMessage: req.flash() });
};

exports.addMenuItem = async (req, res) => {
    try {
        const { name, description, price, category, preparationTime, ingredients } = req.body;
        const image = req.file ? req.file.filename : 'default-food.jpg';
        const ingredientList = ingredients ? ingredients.split(',').map(i => i.trim()) : [];
        await new MenuItem({ name, description, price, category, preparationTime, image, ingredients: ingredientList }).save();
        req.flash('success', `${name} added to menu`);
    } catch (err) {
        req.flash('error', 'Failed to add item: ' + err.message);
    }
    res.redirect('/admin/menu');
};

exports.updateMenuItem = async (req, res) => {
    try {
        const { name, description, price, category, preparationTime, isAvailable } = req.body;
        const update = { name, description, price: Number(price), category, preparationTime, isAvailable: isAvailable === 'true' };
        if (req.file) update.image = req.file.filename;
        await MenuItem.findByIdAndUpdate(req.params.id, update);
        req.flash('success', 'Menu item updated');
    } catch (err) {
        req.flash('error', 'Update failed');
    }
    res.redirect('/admin/menu');
};

exports.deleteMenuItem = async (req, res) => {
    await MenuItem.findByIdAndDelete(req.params.id);
    req.flash('success', 'Item removed from menu');
    res.redirect('/admin/menu');
};

// ---- Table Management ----
exports.renderTables = async (req, res) => {
    const tables = await Table.find().sort({ tableNumber: 1 });
    const Reservation = require('../model/reservationSchema');
    const today = new Date(); today.setHours(0,0,0,0);
    const activeReservations = await Reservation.find({
        status: { $in: ['confirmed','pending'] },
        reservationDate: { $gte: today }
    }).populate('customer','name phone email').sort({ reservationDate: 1 });
    const reservationByTable = {};
    activeReservations.forEach(r => {
        const key = r.table.toString();
        if (!reservationByTable[key]) reservationByTable[key] = r;
    });
    const tablesWithInfo = tables.map(t => {
        const tObj = t.toObject();
        tObj.reservation = reservationByTable[t._id.toString()] || null;
        return tObj;
    });
    res.render('admin/tables', { tables: tablesWithInfo, flashMessage: req.flash() });
};

exports.addTable = async (req, res) => {
    try {
        const { tableNumber, capacity, location } = req.body;
        // Generate QR code data (URL for customer ordering)
        const qrData = `${process.env.BASE_URL || 'http://localhost:3000'}/order/table/${tableNumber}`;
        const QRCode = require('qrcode');
        const qrCode = await QRCode.toDataURL(qrData);
        await new Table({ tableNumber, capacity, location, qrCode }).save();
        req.flash('success', `Table ${tableNumber} added`);
    } catch (err) {
        req.flash('error', 'Failed to add table: ' + err.message);
    }
    res.redirect('/admin/tables');
};

exports.updateTableStatus = async (req, res) => {
    try {
        await Table.findByIdAndUpdate(req.params.id, { status: req.body.status });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

// ---- User Management ----
exports.renderUsers = async (req, res) => {
    const users = await User.find().sort({ createdAt: -1 });
    res.render('admin/users', { users, flashMessage: req.flash() });
};

exports.toggleUserStatus = async (req, res) => {
    const user = await User.findById(req.params.id);
    await User.findByIdAndUpdate(req.params.id, { isActive: !user.isActive });
    req.flash('success', `User ${user.isActive ? 'deactivated' : 'activated'}`);
    res.redirect('/admin/users');
};

exports.updateUserRole = async (req, res) => {
    await User.findByIdAndUpdate(req.params.id, { role: req.body.role });
    req.flash('success', 'Role updated');
    res.redirect('/admin/users');
};

// ---- Inventory Management ----
exports.renderInventory = async (req, res) => {
    const inventory = await Inventory.find().sort({ isLow: -1, name: 1 });
    res.render('admin/inventory', { inventory, flashMessage: req.flash() });
};

exports.addInventory = async (req, res) => {
    try {
        const { name, unit, currentStock, minimumThreshold } = req.body;
        const existing = await Inventory.findOne({ name });
        if (existing) {
            existing.currentStock = Number(existing.currentStock) + Number(currentStock);
            existing.lastRestocked = new Date();
            await existing.save();
            req.flash('success', `${name} restocked`);
        } else {
            await new Inventory({ name, unit, currentStock, minimumThreshold }).save();
            req.flash('success', `${name} added to inventory`);
        }
    } catch (err) {
        req.flash('error', err.message);
    }
    res.redirect('/admin/inventory');
};

exports.updateInventory = async (req, res) => {
    try {
        const { currentStock, minimumThreshold } = req.body;
const inv = await Inventory.findById(req.params.id);
if (!inv) { req.flash('error', 'Not found'); return res.redirect('/admin/inventory'); }
inv.currentStock     = Number(currentStock);
inv.minimumThreshold = Number(minimumThreshold);
inv.lastRestocked    = new Date();
await inv.save();   // triggers pre-save hook → recalculates isLow
    } catch (err) {
        req.flash('error', err.message);
    }
    res.redirect('/admin/inventory');
};

// ---- Orders overview ----
exports.renderOrders = async (req, res) => {
    const orders = await Order.find()
        .populate('table', 'tableNumber location')
        .populate('waiter', 'name')
        .populate('customer', 'name')
        .sort({ placedAt: -1 })
        .limit(100);
    res.render('admin/orders', { orders, flashMessage: req.flash() });
};

// ---- Reservation Management (admin only) ----
exports.renderReservations = async (req, res) => {
    const Reservation = require('../model/reservationSchema');
    const reservations = await Reservation.find()
        .populate('customer', 'name email phone')
        .populate('table', 'tableNumber capacity location')
        .sort({ reservationDate: 1 });
    res.render('admin/reservations', { reservations, flashMessage: req.flash() });
};

exports.confirmReservation = async (req, res) => {
    const Reservation = require('../model/reservationSchema');
    const reservation = await Reservation.findByIdAndUpdate(
        req.params.id,
        { status: 'confirmed' },
        { new: true }
    );
    if (reservation) {
        // Mark table as reserved so it shows correctly on table dashboard
        await Table.findByIdAndUpdate(reservation.table, { status: 'reserved' });
    }
    req.flash('success', 'Reservation confirmed and table marked as reserved');
    res.redirect('/admin/reservations');
};

exports.cancelReservation = async (req, res) => {
    const Reservation = require('../model/reservationSchema');
    await Reservation.findByIdAndUpdate(req.params.id, { status: 'cancelled' });
    req.flash('success', 'Reservation cancelled');
    res.redirect('/admin/reservations');
};

exports.renderAnalytics = async (req, res) => {
    // Full analytics with all algorithm outputs
    const last30Days = await RevenueLog.find().sort({ date: -1 }).limit(30);
    const forecastSeries = buildForecastSeries(last30Days.reverse());

    // Aggregate hourly across all time
    const allOrders = await Order.find({ isPaid: true }).select('placedAt');
    const hourlyRaw = new Array(24).fill(0);
    allOrders.forEach(o => {
        const h = new Date(o.placedAt).getHours();
        hourlyRaw[h]++;
    });
    const peakData = detectPeakHours(hourlyRaw);

    const bestSellers = await MenuItem.find().sort({ orderCount: -1 }).limit(10);
    const categoryRevenue = await Order.aggregate([
        { $match: { isPaid: true } },
        { $unwind: '$items' },
        { $group: { _id: '$items.category', revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } }
    ]);

    res.render('admin/analytics', {
        forecastSeries: JSON.stringify(forecastSeries),
        peakData: JSON.stringify(peakData),
        bestSellers: JSON.stringify(bestSellers),
        categoryRevenue: JSON.stringify(categoryRevenue),
        flashMessage: req.flash()
    });
};
exports.renderRevenueLogs = async (req, res) => {
    try {
        const logs = await RevenueLog.find()
            .sort({ date: -1 })
            .limit(30);
        res.render('admin/revenueLogs', { logs, flashMessage: req.flash() });
    } catch (err) {
        req.flash('error', 'Could not load revenue logs');
        res.redirect('/admin/dashboard');
    }
};