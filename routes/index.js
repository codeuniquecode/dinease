const express = require('express');
const router = express.Router();
const authController = require('../controller/authController');
const adminController = require('../controller/adminController');
const orderController = require('../controller/orderController');
const waiterController = require('../controller/waiterController');
const kitchenController = require('../controller/kitchenController');
const customerController = require('../controller/customerController');
const { isAuthenticated, isLoggedIn, requireRole } = require('../middleware/auth');
const upload = require('../middleware/multerConfig');

// ---- Auth ----
router.get('/login', authController.renderLogin);
router.post('/login', authController.login);
router.get('/register', authController.renderRegister);
router.post('/register', authController.register);
router.get('/logout', authController.logout);

// ---- Public / Customer ----
router.get('/', isLoggedIn, customerController.renderHome);
router.get('/menu', isLoggedIn, customerController.renderMenu);
router.get('/order/new', isAuthenticated, requireRole('customer'), customerController.renderOrderNew);
router.get('/order/table/:tableNumber', isLoggedIn, customerController.renderTableOrder);
router.get('/order/confirmation/:id', isAuthenticated, orderController.renderConfirmation);
router.get('/order/receipt/:id', isAuthenticated, orderController.renderReceipt);
router.get('/order/invoice/:id', isAuthenticated, orderController.downloadInvoice);
router.get('/reserve', isAuthenticated, requireRole('customer'), customerController.renderReservationForm);
router.post('/reserve/recommend', isAuthenticated, requireRole('customer'), customerController.getTableRecommendation);
router.post('/reserve', isAuthenticated, requireRole('customer'), customerController.createReservation);
router.get('/my-reservations', isAuthenticated, requireRole('customer'), customerController.renderMyReservations);
router.post('/reservation/:id/cancel', isAuthenticated, requireRole('customer'), customerController.cancelReservation);
router.get('/my-orders', isAuthenticated, requireRole('customer'), customerController.renderMyOrders);

// ---- Orders (shared waiter/customer) ----
router.post('/order/place', isAuthenticated, orderController.placeOrder);
router.post('/order/:id/status', isAuthenticated, requireRole('admin', 'waiter', 'kitchen'), orderController.updateStatus);
router.get('/order/:id/bill', isAuthenticated, requireRole('admin', 'waiter'), orderController.generateBill);
router.post('/order/:id/pay', isAuthenticated, requireRole('admin', 'waiter'), orderController.confirmPayment);
router.post('/order/:id/cancel', isAuthenticated, orderController.cancelOrder);
router.get('/api/table/:tableId/orders', isAuthenticated, orderController.getTableOrders);

// ---- Waiter ----
router.get('/waiter/dashboard', isAuthenticated, requireRole('waiter', 'admin'), waiterController.renderDashboard);
router.get('/waiter/new-order', isAuthenticated, requireRole('waiter', 'admin'), waiterController.renderNewOrder);
router.get('/waiter/kitchen-view', isAuthenticated, requireRole('waiter','admin'), waiterController.renderKitchenView);
router.get('/waiter/reservations', isAuthenticated, requireRole('waiter', 'admin'), waiterController.renderReservations);

// ---- Kitchen ----
router.get('/kitchen/display', isAuthenticated, requireRole('kitchen', 'admin'), kitchenController.renderKitchenDisplay);
router.get('/api/kitchen/orders', isAuthenticated, requireRole('kitchen', 'admin'), kitchenController.getUpdatedOrders);

// ---- Admin ----
router.get('/admin/dashboard', isAuthenticated, requireRole('admin'), adminController.renderDashboard);
router.get('/admin/menu', isAuthenticated, requireRole('admin'), adminController.renderMenu);
router.post('/admin/menu', isAuthenticated, requireRole('admin'), upload.single('image'), adminController.addMenuItem);
router.put('/admin/menu/:id', isAuthenticated, requireRole('admin'), upload.single('image'), adminController.updateMenuItem);
router.delete('/admin/menu/:id', isAuthenticated, requireRole('admin'), adminController.deleteMenuItem);
router.get('/admin/tables', isAuthenticated, requireRole('admin'), adminController.renderTables);
router.post('/admin/tables', isAuthenticated, requireRole('admin'), adminController.addTable);
router.patch('/admin/tables/:id/status', isAuthenticated, requireRole('admin'), adminController.updateTableStatus);
router.get('/admin/users', isAuthenticated, requireRole('admin'), adminController.renderUsers);
router.patch('/admin/users/:id/toggle', isAuthenticated, requireRole('admin'), adminController.toggleUserStatus);
router.patch('/admin/users/:id/role', isAuthenticated, requireRole('admin'), adminController.updateUserRole);
router.get('/admin/inventory', isAuthenticated, requireRole('admin'), adminController.renderInventory);
router.post('/admin/inventory', isAuthenticated, requireRole('admin'), adminController.addInventory);
router.put('/admin/inventory/:id', isAuthenticated, requireRole('admin'), adminController.updateInventory);
router.get('/admin/orders', isAuthenticated, requireRole('admin'), adminController.renderOrders);
router.get('/admin/analytics', isAuthenticated, requireRole('admin'), adminController.renderAnalytics);
router.get('/admin/reservations', isAuthenticated, requireRole('admin'), adminController.renderReservations);
router.patch('/admin/reservation/:id/confirm', isAuthenticated, requireRole('admin'), adminController.confirmReservation);
router.patch('/admin/reservation/:id/cancel', isAuthenticated, requireRole('admin'), adminController.cancelReservation);

module.exports = router;

// ---- eSewa Payment ----
const { buildEsewaPaymentData, verifyEsewaPayment } = require('../services/esewaPayment');
const Order = require('../model/orderSchema');

router.get('/payment/esewa/initiate/:orderId', isAuthenticated, async (req, res) => {
    const order = await Order.findById(req.params.orderId).populate('table', 'tableNumber');
    if (!order || !order.totalAmount) { req.flash('error', 'Generate bill first'); return res.redirect('back'); }
    const paymentData = buildEsewaPaymentData(order._id, order.orderNumber, order.totalAmount);
    res.render('payment/esewa', { order, paymentData, flashMessage: req.flash() });
});

// Customer-facing eSewa page (from My Orders)
router.get('/payment/esewa/customer/:orderId', isAuthenticated, requireRole('customer'), async (req, res) => {
    const order = await Order.findById(req.params.orderId).populate('table', 'tableNumber');
    if (!order || order.status !== 'billed' || order.isPaid) {
        req.flash('error', 'This order is not ready for payment');
        return res.redirect('/my-orders');
    }
    if (order.customer && order.customer.toString() !== req.user._id.toString()) {
        req.flash('error', 'Unauthorized');
        return res.redirect('/my-orders');
    }
    const paymentData = buildEsewaPaymentData(order._id, order.orderNumber, order.totalAmount);
    res.render('payment/esewaCustomer', { order, paymentData, flashMessage: req.flash() });
});

// eSewa success callback — NO auth middleware (eSewa redirects from their domain)
// Uses payment signature verification instead of session auth
router.get('/payment/esewa/success', async (req, res) => {
    const { data } = req.query;
    if (!data) {
        req.flash('error', 'Invalid payment response');
        return res.redirect('/login');
    }

    const result = await verifyEsewaPayment(data);
    if (!result.verified) {
        req.flash('error', 'Payment verification failed: ' + result.reason);
        return res.redirect('/login');
    }

    const User = require('../model/userSchema');
    const Table = require('../model/tableSchema');
    const RevenueLog = require('../model/revenueLogSchema');
    const moment = require('moment');

    // Find order by last 8 chars of ID (from UUID format DE-{8chars}-{random})
    const allOrders = await Order.find({ isPaid: false, status: 'billed' }).populate('customer');
    const order = allOrders.find(o => o._id.toString().slice(-8) === result.orderIdSuffix);
    if (order && !order.isPaid) {
        order.isPaid        = true;
        order.paymentMethod = 'esewa';
        order.status        = 'completed';
        order.completedAt   = new Date();
        await order.save();
        await Table.findByIdAndUpdate(order.table, { status: 'available', currentOrderId: null });
        if (order.customer) {
            await User.findByIdAndUpdate(order.customer._id, { $inc: { totalOrders: 1 } });
        }
        const today = moment().format('YYYY-MM-DD');
        const hour  = String(new Date().getHours());
        const log   = await RevenueLog.findOne({ date: today });
        if (log) {
            log.totalRevenue += order.totalAmount;
            log.totalOrders  += 1;
            log.hourlyBreakdown.set(hour, (log.hourlyBreakdown.get(hour) || 0) + 1);
            await log.save();
        } else {
            const hm = new Map(); hm.set(hour, 1);
            await new RevenueLog({ date: today, totalRevenue: order.totalAmount, totalOrders: 1, hourlyBreakdown: hm }).save();
        }
        const io = req.app.get('io');
        if (io) io.emit('orderStatusUpdate', { orderId: order._id, status: 'completed' });
    }

    // Flash stored in session — will show after redirect even without cookie
    req.session.flashSuccess = `eSewa payment successful! Order ${order?.orderNumber || ''} paid.`;

    // Redirect based on who placed the order (no req.user since cross-site)
    if (order?.customer) {
        // Customer paid — send to my-orders with a token to re-login if needed
        return res.redirect('/my-orders');
    }
    // Walk-in (no customer linked) — send to receipt
    res.redirect(`/order/receipt/${result.orderId}`);
});

// eSewa failure — no auth required
router.get('/payment/esewa/failure', (req, res) => {
    req.session.flashError = 'eSewa payment was cancelled or failed. Please try again.';
    res.redirect('/my-orders');
});
