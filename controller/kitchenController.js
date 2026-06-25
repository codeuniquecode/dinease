const Order = require('../model/orderSchema');
const { sortOrdersByPriority, calculateOrderPriority } = require('../services/algorithms');

exports.renderKitchenDisplay = async (req, res) => {
    try {
        const rawOrders = await Order.find({
            status: { $in: ['placed', 'confirmed', 'preparing'] }
        })
            .populate('table', 'tableNumber location capacity')
            .populate('waiter', 'name')
            .lean(); // plain objects for algorithm processing

        // Add tableLocation for priority algorithm
        const ordersWithLocation = rawOrders.map(o => ({
            ...o,
            tableLocation: o.table?.location || 'Standard'
        }));

        // Algorithm 2: Sort by priority score
        const prioritizedOrders = sortOrdersByPriority(ordersWithLocation);

        res.render('kitchen/display', {
            orders: prioritizedOrders,
            flashMessage: req.flash()
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Kitchen display error');
        res.redirect('/');
    }
};

// Refresh priority scores — called periodically via AJAX
exports.getUpdatedOrders = async (req, res) => {
    try {
        const rawOrders = await Order.find({
            status: { $in: ['placed', 'confirmed', 'preparing'] }
        })
            .populate('table', 'tableNumber location capacity')
            .lean();

        const ordersWithLocation = rawOrders.map(o => ({
            ...o,
            tableLocation: o.table?.location || 'Standard'
        }));

        const prioritized = sortOrdersByPriority(ordersWithLocation);

        // Persist updated priority scores to DB
        for (const order of prioritized) {
            await Order.findByIdAndUpdate(order._id, { priorityScore: order.priorityScore });
        }

        res.json({ orders: prioritized });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
