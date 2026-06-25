const Order = require('../model/orderSchema');
const Table = require('../model/tableSchema');
const MenuItem = require('../model/menuSchema');

exports.renderDashboard = async (req, res) => {
    try {
        const tables = await Table.find().sort({ tableNumber: 1 });
        // isPaid: false ensures completed/paid orders don't linger in active list
        const activeOrders = await Order.find({
            status: { $in: ['placed', 'confirmed', 'preparing', 'ready', 'served', 'billed'] },
            isPaid: false
        })
            .populate('table', 'tableNumber location capacity')
            .populate('customer', 'name')
            .populate('waiter', 'name')
            .sort({ placedAt: 1 });

        const readyOrders = activeOrders.filter(o => o.status === 'ready');

        res.render('waiter/dashboard', {
            tables,
            activeOrders,
            readyOrders,
            flashMessage: req.flash()
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Dashboard load failed');
        res.redirect('/');
    }
};

exports.renderNewOrder = async (req, res) => {
    try {
        const tables = await Table.find({ status: { $in: ['available', 'occupied'] } }).sort({ tableNumber: 1 });
        const menuItems = await MenuItem.find({ isAvailable: true }).sort({ category: 1, name: 1 });

        // Group menu by category for display
        const menuByCategory = {};
        menuItems.forEach(item => {
            if (!menuByCategory[item.category]) menuByCategory[item.category] = [];
            menuByCategory[item.category].push(item);
        });

        res.render('waiter/newOrder', {
            tables,
            menuByCategory,
            menuItems,
            selectedTableId: req.query.tableId || null,
            flashMessage: req.flash()
        });
    } catch (err) {
        req.flash('error', 'Error loading order form');
        res.redirect('/waiter/dashboard');
    }
};

exports.renderReservations = async (req, res) => {
    const Reservation = require('../model/reservationSchema');
    const reservations = await Reservation.find()
        .populate('customer', 'name email phone')
        .populate('table', 'tableNumber capacity location')
        .sort({ reservationDate: 1 });
    res.render('waiter/reservations', { reservations, flashMessage: req.flash() });
};

exports.renderKitchenView = async (req, res) => {
    try {
        const Order = require('../model/orderSchema');
        const { sortOrdersByPriority } = require('../services/algorithms');
        const raw = await Order.find({
            status: { $in: ['placed', 'confirmed', 'preparing', 'ready'] }
        })
            .populate('table', 'tableNumber location')
            .lean();

        const withLocation = raw.map(o => ({
            ...o,
            tableLocation: o.table?.location || 'Standard'
        }));

        const orders = sortOrdersByPriority(withLocation);

        res.render('waiter/kitchenView', { orders, flashMessage: req.flash() });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Could not load kitchen view');
        res.redirect('/waiter/dashboard');
    }
};
