const MenuItem = require('../model/menuSchema');
const Table = require('../model/tableSchema');
const Reservation = require('../model/reservationSchema');
const Order = require('../model/orderSchema');
const { recommendTable } = require('../services/algorithms');

exports.renderHome = async (req, res) => {
    try {
        const totalMenuItems = await MenuItem.countDocuments({ isAvailable: true });
        const featuredItems = await MenuItem.find({ isAvailable: true })
            .sort({ orderCount: -1 })
            .limit(6);
        res.render('customer/home', {
            counts: { popular: totalMenuItems },
            featuredItems,
            flashMessage: req.flash()
        });
    } catch (error) {
        console.error(error);
        res.render('customer/home', { counts: { popular: 20 }, featuredItems: [], flashMessage: req.flash() });
    }
};

exports.renderOrderNew = async (req, res) => {
    try {
        const tables = await Table.find({ status: 'available' }).sort({ tableNumber: 1 });
        const menuItems = await MenuItem.find({ isAvailable: true }).sort({ category: 1, name: 1 });
        const menuByCategory = {};
        menuItems.forEach(item => {
            if (!menuByCategory[item.category]) menuByCategory[item.category] = [];
            menuByCategory[item.category].push(item);
        });
        res.render('customer/orderNew', { tables, menuByCategory, flashMessage: req.flash() });
    } catch (err) {
        req.flash('error', 'Error loading order page');
        res.redirect('/');
    }
};

exports.renderMenu = async (req, res) => {
    const menuItems = await MenuItem.find({ isAvailable: true }).sort({ category: 1 });
    const menuByCategory = {};
    menuItems.forEach(item => {
        if (!menuByCategory[item.category]) menuByCategory[item.category] = [];
        menuByCategory[item.category].push(item);
    });
    res.render('customer/menu', { menuByCategory, flashMessage: req.flash() });
};

// QR-based table ordering
exports.renderTableOrder = async (req, res) => {
    try {
        const table = await Table.findOne({ tableNumber: req.params.tableNumber });
        if (!table) return res.status(404).render('error', { message: 'Table not found' });

        const menuItems = await MenuItem.find({ isAvailable: true }).sort({ category: 1 });
        const menuByCategory = {};
        menuItems.forEach(item => {
            if (!menuByCategory[item.category]) menuByCategory[item.category] = [];
            menuByCategory[item.category].push(item);
        });

        res.render('customer/tableOrder', {
            table,
            menuByCategory,
            flashMessage: req.flash()
        });
    } catch (err) {
        res.status(500).send('Error loading table order page');
    }
};

// Reservation with Algorithm 3
exports.renderReservationForm = async (req, res) => {
    res.render('customer/reservationForm', { flashMessage: req.flash(), recommendation: null });
};

exports.getTableRecommendation = async (req, res) => {
    try {
        const { partySize, reservationDate, timeSlot } = req.body;

        // Get all tables
        const allTables = await Table.find({ status: 'available' });

        // Check for conflicts: tables already reserved in this slot
        const conflictedReservations = await Reservation.find({
            reservationDate: new Date(reservationDate),
            timeSlot,
            status: { $in: ['pending', 'confirmed'] }
        }).select('table');
        const conflictedTableIds = conflictedReservations.map(r => r.table.toString());

        const availableTables = allTables.filter(t => !conflictedTableIds.includes(t._id.toString()));

        // Algorithm 3: Table Recommendation
        const recommended = recommendTable(availableTables, parseInt(partySize));

        res.render('customer/reservationForm', {
            flashMessage: req.flash(),
            recommendation: recommended,
            formData: { partySize, reservationDate, timeSlot }
        });
    } catch (err) {
        req.flash('error', 'Error finding table recommendation');
        res.redirect('/reserve');
    }
};

exports.createReservation = async (req, res) => {
    try {
        const { tableId, partySize, reservationDate, timeSlot, specialRequests } = req.body;

        // Double-check for conflicts
        const conflict = await Reservation.findOne({
            table: tableId,
            reservationDate: new Date(reservationDate),
            timeSlot,
            status: { $in: ['pending', 'confirmed'] }
        });

        if (conflict) {
            req.flash('error', 'This table is already reserved for that time slot. Please choose another.');
            return res.redirect('/reserve');
        }

        await new Reservation({
            customer: req.user._id,
            table: tableId,
            partySize,
            reservationDate: new Date(reservationDate),
            timeSlot,
            specialRequests
        }).save();

        req.flash('success', 'Reservation confirmed! We look forward to seeing you.');
        res.redirect('/my-reservations');
    } catch (err) {
        req.flash('error', 'Reservation failed: ' + err.message);
        res.redirect('/reserve');
    }
};

exports.renderMyReservations = async (req, res) => {
    const reservations = await Reservation.find({ customer: req.user._id })
        .populate('table', 'tableNumber capacity location')
        .sort({ reservationDate: -1 });
    res.render('customer/myReservations', { reservations, flashMessage: req.flash() });
};

exports.cancelReservation = async (req, res) => {
    await Reservation.findOneAndUpdate(
        { _id: req.params.id, customer: req.user._id },
        { status: 'cancelled' }
    );
    req.flash('success', 'Reservation cancelled');
    res.redirect('/my-reservations');
};

exports.renderMyOrders = async (req, res) => {
    const orders = await Order.find({ customer: req.user._id })
        .populate('table', 'tableNumber')
        .sort({ placedAt: -1 })
        .limit(20);
    res.render('customer/myOrders', { orders, flashMessage: req.flash() });
};
