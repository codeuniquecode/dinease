const Order = require('../model/orderSchema');
const Table = require('../model/tableSchema');
const MenuItem = require('../model/menuSchema');
const User = require('../model/userSchema');
const RevenueLog = require('../model/revenueLogSchema');
const { calculateOrderPriority, calculateDiscount } = require('../services/algorithms');
const { checkInventory, deductInventory, restoreInventory} = require('../services/inventoryCheck');
const { envConfig } = require('../config/envConfig');
const moment = require('moment');

// ---- Place Order ----
exports.placeOrder = async (req, res) => {
    try {
        const { tableId, items, isQROrder } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            req.flash('error', 'No items in order');
            return res.redirect('back');
        }

        const table = await Table.findById(tableId);
        if (!table) { req.flash('error', 'Table not found'); return res.redirect('back'); }

        // Prevent customer ordering from multiple tables
        if (req.user?.role === 'customer') {
            const existingActive = await Order.findOne({
                customer: req.user._id,
                status: { $nin: ['completed', 'cancelled', 'billed'] }
            }).populate('table', 'tableNumber');
            if (existingActive && existingActive.table._id.toString() !== tableId) {
                req.flash('error', `You already have an active order at Table ${existingActive.table.tableNumber}. Complete that first.`);
                return res.redirect('back');
            }
        }

        // ---- Inventory check BEFORE placing ----
        const inventoryResult = await checkInventory(items);
        if (!inventoryResult.canFulfill) {
            req.flash('error', 'Cannot place order: ' + inventoryResult.unavailable.join(', '));
            return res.redirect('back');
        }

        // Build order items
        let subtotal = 0;
        const orderItems = [];
        for (const item of items) {
            const menuItem = await MenuItem.findById(item.menuItemId);
            if (!menuItem || !menuItem.isAvailable) continue;
            subtotal += menuItem.price * item.quantity;
            orderItems.push({
                menuItem: menuItem._id,
                name: menuItem.name,
                price: menuItem.price,
                quantity: item.quantity,
                category: menuItem.category,
                specialNote: item.specialNote || ''
            });
            await MenuItem.findByIdAndUpdate(menuItem._id, { $inc: { orderCount: item.quantity } });
        }

        if (orderItems.length === 0) {
            req.flash('error', 'No valid menu items found');
            return res.redirect('back');
        }

        // Link waiter order to customer already at this table
        let linkedCustomerId = null;
        if (req.user?.role === 'customer') {
            linkedCustomerId = req.user._id;
        } else if (req.user?.role === 'waiter' || req.user?.role === 'admin') {
            const existingTableOrder = await Order.findOne({
                table: tableId,
                status: { $nin: ['completed', 'cancelled'] },
                customer: { $ne: null }
            }).sort({ placedAt: -1 });
            if (existingTableOrder) linkedCustomerId = existingTableOrder.customer;
        }

        const newOrder = new Order({
            table: tableId,
            customer: linkedCustomerId,
            waiter: (req.user?.role === 'waiter' || req.user?.role === 'admin') ? req.user._id : null,
            items: orderItems,
            subtotal,
            isQROrder: isQROrder === 'true' || isQROrder === true,
            tableLocation: table.location
        });

        newOrder.priorityScore = calculateOrderPriority({
            placedAt: new Date(),
            tableLocation: table.location,
            items: orderItems
        });

        await newOrder.save();

        // Deduct inventory after confirmed order
        await deductInventory(orderItems);

       const io = req.app.get('io');

await Table.findByIdAndUpdate(tableId, { status: 'occupied', currentOrderId: newOrder._id });
if (io) io.emit('tableStatusUpdate', { tableId, status: 'occupied' });

if (io) {
    io.to('kitchen').emit('newOrder', {
        orderId: newOrder._id,
        orderNumber: newOrder.orderNumber,
        tableNumber: table.tableNumber,
        items: orderItems,
        priorityScore: newOrder.priorityScore,
        placedAt: newOrder.placedAt
    });
    io.to('waiter').emit('newOrder', {
        orderNumber: newOrder.orderNumber,
        tableNumber: table.tableNumber
    });
}
        if (!inventoryResult.warnings.length) {
            req.flash('success', `Order ${newOrder.orderNumber} placed!`);
        }

        if (req.user?.role === 'waiter' || req.user?.role === 'admin') {
            return res.redirect('/waiter/dashboard');
        }
return res.redirect(`/order/confirmation/${newOrder._id}?tableId=${tableId}`);
    } catch (err) {
        console.error('placeOrder error:', err);
        req.flash('error', 'Failed to place order: ' + err.message);
        res.redirect('back');
    }
};

// ---- Update order status ----
exports.updateStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const order = await Order.findById(req.params.id).populate('table', 'tableNumber');
        if (!order) return res.status(404).json({ error: 'Order not found' });

        order.status = status;
        if (status === 'completed') order.completedAt = new Date();
        await order.save();

        const io = req.app.get('io');
        if (io) {
            io.emit('orderStatusUpdate', {
                orderId: order._id,
                orderNumber: order.orderNumber,
                status,
                tableNumber: order.table?.tableNumber
            });
        }

        res.json({ success: true, status, orderNumber: order.orderNumber });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ---- Generate Bill (merges ALL orders for a table into one bill) ----
exports.generateBill = async (req, res) => {
    try {
        // Find the specific order requested
        const triggerOrder = await Order.findById(req.params.id)
            .populate('table', 'tableNumber location capacity')
            .populate('customer', 'name email totalOrders')
            .populate('waiter', 'name');

        if (!triggerOrder) {
            req.flash('error', 'Order not found');
            return res.redirect('back');
        }

        // If already billed, re-render existing bill
        if (triggerOrder.status === 'billed' && triggerOrder.totalAmount > 0) {
            const dr = {
                loyalty: triggerOrder.discounts?.loyalty || 0,
                combo:   triggerOrder.discounts?.combo || 0,
                happyHour: triggerOrder.discounts?.happyHour || 0,
                discountAmount: triggerOrder.discountAmount || 0,
                finalPriceAfterDiscount: triggerOrder.subtotal - (triggerOrder.discountAmount || 0),
                breakdown: {
                    loyaltyApplied:   (triggerOrder.discounts?.loyalty || 0) > 0,
                    comboApplied:     (triggerOrder.discounts?.combo || 0) > 0,
                    happyHourApplied: (triggerOrder.discounts?.happyHour || 0) > 0,
                    loyaltySaving:    Math.round(triggerOrder.subtotal * (triggerOrder.discounts?.loyalty || 0) * 100) / 100,
                    comboSaving:      Math.round(triggerOrder.subtotal * (triggerOrder.discounts?.combo || 0) * 100) / 100,
                    happyHourSaving:  Math.round(triggerOrder.subtotal * (triggerOrder.discounts?.happyHour || 0) * 100) / 100
                }
            };
            return res.render('waiter/bill', {
                order: triggerOrder,
                discountResult: dr,
                vatAmount: triggerOrder.vatAmount || 0,
                totalAmount: triggerOrder.totalAmount,
                vatRate: envConfig.vatRate * 100,
                flashMessage: req.flash()
            });
        }

        // ---- Merge ALL served orders from the same table ----
        const allTableOrders = await Order.find({
            table: triggerOrder.table._id,
            status: 'served',
            isPaid: false
        }).populate('customer', 'name email totalOrders');

        // Include the trigger order even if status differs slightly
        const orderIds = allTableOrders.map(o => o._id.toString());
        if (!orderIds.includes(triggerOrder._id.toString())) {
            allTableOrders.push(triggerOrder);
        }

        // Merge all items from all orders
        const allItems = [];
        let totalSubtotal = 0;
        allTableOrders.forEach(ord => {
            ord.items.forEach(item => {
                // Check if same item already in merged list
                const existing = allItems.find(i =>
                    i.name === item.name && i.price === item.price && i.specialNote === item.specialNote
                );
                if (existing) {
                    existing.quantity += item.quantity;
                } else {
                    allItems.push({ ...item.toObject ? item.toObject() : item });
                }
            });
            totalSubtotal += ord.subtotal;
        });

        // Use the customer from whichever order has one
        const linkedCustomer = allTableOrders.find(o => o.customer)?.customer;
        const customerTotalOrders = linkedCustomer?.totalOrders || 0;
        const orderHour = new Date(triggerOrder.placedAt).getHours();

        const discountResult = calculateDiscount(totalSubtotal, customerTotalOrders, allItems, orderHour);
        const priceAfterDiscount = discountResult.finalPriceAfterDiscount;
        const vatAmount   = Math.round(priceAfterDiscount * envConfig.vatRate * 100) / 100;
        const totalAmount = Math.round((priceAfterDiscount + vatAmount) * 100) / 100;

        // Update ALL served orders with billed status and billing data
        for (const ord of allTableOrders) {
            ord.discounts     = { loyalty: discountResult.loyalty, combo: discountResult.combo, happyHour: discountResult.happyHour };
            ord.discountAmount = discountResult.discountAmount;
            ord.vatAmount     = vatAmount;
            ord.totalAmount   = totalAmount;
            ord.subtotal      = totalSubtotal; // update to merged total
            ord.items         = allItems;       // merged items
            ord.status        = 'billed';
            ord.customer      = linkedCustomer?._id || ord.customer;
            await ord.save();
        }

        // Build a virtual merged order for rendering
        const mergedOrder = {
            ...triggerOrder.toObject(),
            items: allItems,
            subtotal: totalSubtotal,
            discounts: { loyalty: discountResult.loyalty, combo: discountResult.combo, happyHour: discountResult.happyHour },
            discountAmount: discountResult.discountAmount,
            vatAmount,
            totalAmount,
            status: 'billed',
            customer: linkedCustomer,
            orderNumber: allTableOrders.length > 1
                ? allTableOrders.map(o => o.orderNumber).join(' + ')
                : triggerOrder.orderNumber
        };

        const io = req.app.get('io');
        if (io) {
            allTableOrders.forEach(o => {
                io.emit('orderStatusUpdate', { orderId: o._id, status: 'billed' });
            });
        }

        res.render('waiter/bill', {
            order: mergedOrder,
            discountResult, vatAmount, totalAmount,
            vatRate: envConfig.vatRate * 100,
            flashMessage: req.flash()
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to generate bill');
        res.redirect('back');
    }
};

// ---- Confirm Payment (cash only) ----
exports.confirmPayment = async (req, res) => {
    try {
        const { paymentMethod } = req.body;
        const order = await Order.findById(req.params.id).populate('customer');
        if (!order) { req.flash('error', 'Order not found'); return res.redirect('back'); }

        // Mark ALL billed orders for this table as completed
        const allBilledOrders = await Order.find({
            table: order.table,
            status: 'billed',
            isPaid: false
        }).populate('customer');

        // Include this order if not in list
        if (!allBilledOrders.find(o => o._id.toString() === order._id.toString())) {
            allBilledOrders.push(order);
        }

        const linkedCustomer = allBilledOrders.find(o => o.customer)?.customer;

        for (const o of allBilledOrders) {
            o.isPaid        = true;
            o.paymentMethod = paymentMethod;
            o.status        = 'completed';
            o.completedAt   = new Date();
            await o.save();
        }

        await Table.findByIdAndUpdate(order.table, { status: 'available', currentOrderId: null });

        if (linkedCustomer) {
            await User.findByIdAndUpdate(linkedCustomer._id, { $inc: { totalOrders: 1 } });
        }

        await updateRevenueLog(order);

        const io = req.app.get('io');
        if (io) {
            allBilledOrders.forEach(o => {
                io.emit('orderStatusUpdate', { orderId: o._id, status: 'completed' });
            });
        }

        req.flash('success', `Payment confirmed — Table ${order.table?.tableNumber || ''}`);
        res.redirect(`/order/receipt/${order._id}`);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Payment confirmation failed');
        res.redirect('back');
    }
};

// ---- Shared revenue log update ----
async function updateRevenueLog(order) {
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
        await new RevenueLog({
            date: today,
            totalRevenue: order.totalAmount,
            totalOrders: 1,
            hourlyBreakdown: hm
        }).save();
    }
}
exports.updateRevenueLog = updateRevenueLog;

// ---- Receipt ----
exports.renderReceipt = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('table', 'tableNumber')
            .populate('customer', 'name email')
            .populate('waiter', 'name');
        if (!order) return res.status(404).send('Order not found');
        res.render('waiter/receipt', { order, vatRate: envConfig.vatRate * 100, flashMessage: req.flash() });
    } catch (err) {
        res.status(500).send('Error loading receipt');
    }
};

// ---- Order Confirmation (customer QR) ----
exports.renderConfirmation = async (req, res) => {
    const order = await Order.findById(req.params.id).populate('table', 'tableNumber');
    res.render('customer/confirmation', { order, flashMessage: req.flash() });
};

// ---- PDF Receipt ----
exports.downloadInvoice = async (req, res) => {
    try {
        const PDFDocument = require('pdfkit');
        const order = await Order.findById(req.params.id)
            .populate('table', 'tableNumber')
            .populate('customer', 'name phone email')
            .populate('waiter', 'name');

        if (!order) return res.status(400).send('Order not found');

        const W      = 227;   // 80mm thermal receipt width
        const MARGIN = 14;
        const C      = W - MARGIN * 2;  // content width

        const doc = new PDFDocument({ size: [W, 900], margin: MARGIN });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=receipt-${order.orderNumber}.pdf`);
        doc.pipe(res);

        const MID = { align: 'center', width: C };

        // ---- HEADER ----
        doc.fontSize(15).font('Helvetica-Bold').text('DineEase', MARGIN, 18, MID);
        doc.fontSize(7).font('Helvetica').fillColor('#555')
            .text('Restaurant Management System', MARGIN, doc.y, MID)
            .text('Kathmandu, Nepal', MARGIN, doc.y, MID);
        doc.fillColor('black').moveDown(0.5);
        doc.moveTo(MARGIN, doc.y).lineTo(W - MARGIN, doc.y).stroke();
        doc.moveDown(0.4);

        // ---- ORDER META ----
        doc.fontSize(8).font('Helvetica-Bold').text('RECEIPT', MARGIN, doc.y, MID);
        doc.moveDown(0.2);

        const meta = [
            ['Receipt No.', order.orderNumber],
            ['Date',        moment(order.completedAt || order.placedAt).format('DD MMM YYYY, hh:mm A')],
            ['Table',       'Table ' + (order.table?.tableNumber || '-')],
            ['Payment',     (order.paymentMethod || 'cash').toUpperCase()],
        ];
        if (order.customer?.name)  meta.push(['Customer', order.customer.name]);
        if (order.customer?.phone) meta.push(['PAN No.', '123456789']);
        if (order.waiter?.name)    meta.push(['Waiter',   order.waiter.name]);

        doc.font('Helvetica').fontSize(7).fillColor('#333');
        meta.forEach(([k, v]) => {
            const y = doc.y;
            doc.text(k + ':', MARGIN, y, { width: C * 0.42 });
            doc.text(v, MARGIN + C * 0.44, y, { width: C * 0.56, align: 'right' });
            doc.moveDown(0.28);
        });

        doc.fillColor('black').moveDown(0.3);
        doc.moveTo(MARGIN, doc.y).lineTo(W - MARGIN, doc.y).dash(1, { space: 2 }).stroke();
        doc.undash().moveDown(0.3);

        // ---- ITEMS HEADER ----
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#333');
        const hY = doc.y;
        doc.text('Item',   MARGIN,            hY, { width: C * 0.44 });
        doc.text('Qty',    MARGIN + C * 0.45, hY, { width: C * 0.13, align: 'center' });
        doc.text('Rate',   MARGIN + C * 0.59, hY, { width: C * 0.18, align: 'right' });
        doc.text('Amount', MARGIN + C * 0.78, hY, { width: C * 0.22, align: 'right' });
        doc.moveDown(0.3);
        doc.moveTo(MARGIN, doc.y).lineTo(W - MARGIN, doc.y).stroke();
        doc.moveDown(0.3);

        // ---- ITEMS ----
        doc.font('Helvetica').fontSize(7).fillColor('black');
        order.items.forEach(item => {
            const iY  = doc.y;
            const amt = (item.price * item.quantity).toFixed(2);
            doc.text(item.name,           MARGIN,            iY, { width: C * 0.44 });
            doc.text(String(item.quantity), MARGIN + C * 0.45, iY, { width: C * 0.13, align: 'center' });
            doc.text('Rs.' + item.price,  MARGIN + C * 0.59, iY, { width: C * 0.18, align: 'right' });
            doc.text('Rs.' + amt,         MARGIN + C * 0.78, iY, { width: C * 0.22, align: 'right' });
            if (item.specialNote) {
                doc.moveDown(0.15).fontSize(6).fillColor('#888')
                   .text('  Note: ' + item.specialNote, MARGIN, doc.y, { width: C });
                doc.fontSize(7).fillColor('black');
            }
            doc.moveDown(0.35);
        });

        doc.moveTo(MARGIN, doc.y).lineTo(W - MARGIN, doc.y).dash(1, { space: 2 }).stroke();
        doc.undash().moveDown(0.3);

        // ---- TOTALS ----
        const tRow = (label, value, bold, color) => {
            const y = doc.y;
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
               .fontSize(bold ? 8 : 7)
               .fillColor(color || 'black');
            doc.text(label, MARGIN, y, { width: C * 0.6 });
            doc.text(value, MARGIN + C * 0.6, y, { width: C * 0.4, align: 'right' });
            doc.fillColor('black').moveDown(0.28);
        };

        tRow('Subtotal:', 'Rs. ' + (order.subtotal || 0).toFixed(2));
        if ((order.discountAmount || 0) > 0) {
            if ((order.discounts?.loyalty || 0) > 0) {
                tRow('  Loyalty Discount (5%):', '- Rs. ' + (order.subtotal * order.discounts.loyalty).toFixed(2), false, '#1E8449');
            }
            if ((order.discounts?.combo || 0) > 0) {
                tRow('  Combo Discount (10%):', '- Rs. ' + (order.subtotal * order.discounts.combo).toFixed(2), false, '#1E8449');
            }
            if ((order.discounts?.happyHour || 0) > 0) {
                tRow('  Happy Hour (15%):', '- Rs. ' + (order.subtotal * order.discounts.happyHour).toFixed(2), false, '#1E8449');
            }
            tRow('Total Savings:', '- Rs. ' + (order.discountAmount || 0).toFixed(2), false, '#1E8449');
        }
        tRow('VAT (13%):', 'Rs. ' + (order.vatAmount || 0).toFixed(2));
        doc.moveTo(MARGIN, doc.y).lineTo(W - MARGIN, doc.y).stroke();
        doc.moveDown(0.25);
        tRow('TOTAL PAID:', 'Rs. ' + (order.totalAmount || 0).toFixed(2), true);

        // ---- FOOTER ----
        doc.moveDown(0.8);
        doc.moveTo(MARGIN, doc.y).lineTo(W - MARGIN, doc.y).dash(1, { space: 2 }).stroke();
        doc.undash().moveDown(0.4);
        doc.fontSize(7).font('Helvetica').fillColor('#666')
            .text('Thank you for dining with DineEase!', MARGIN, doc.y, MID)
            .text('This is a computer-generated receipt.', MARGIN, doc.y, MID)
            .text('No signature required.', MARGIN, doc.y, MID);

        doc.end();
    } catch (err) {
        console.error(err);
        res.status(500).send('Error generating PDF');
    }
};;

// ---- Table orders (AJAX) ----
exports.getTableOrders = async (req, res) => {
    try {
        const orders = await Order.find({
            table: req.params.tableId,
            status: { $nin: ['completed', 'cancelled'] }
        });
        res.json({ orders });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ---- Cancel order ----
// NEW
exports.cancelOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order || order.status === 'billed' || order.isPaid) {
            req.flash('error', 'Cannot cancel a billed or paid order');
            return res.redirect('back');
        }

        // Restore inventory only if kitchen has NOT started preparing yet.
        // Once preparing begins, ingredients are already in use — no restore.
        const preKitchenStatuses = ['placed', 'confirmed'];
        if (preKitchenStatuses.includes(order.status)) {
            await restoreInventory(order.items);
        }

        order.status = 'cancelled';
        await order.save();
        await Table.findByIdAndUpdate(order.table, { status: 'available', currentOrderId: null });

        const io = req.app.get('io');
        if (io) io.emit('orderStatusUpdate', { orderId: order._id, status: 'cancelled' });

        req.flash('success', 'Order cancelled');
        res.redirect('back');
    } catch (err) {
        req.flash('error', 'Cancel failed');
        res.redirect('back');
    }
};