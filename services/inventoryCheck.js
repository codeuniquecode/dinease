/**
 * Inventory check and deduction service
 * Called when an order is placed
 */
const Inventory = require('../model/inventorySchema');
const MenuItem = require('../model/menuSchema');

/**
 * Check if ingredients are available for ordered items
 * Returns { canFulfill, warnings }
 * warnings = items with low/zero stock
 */
async function checkInventory(orderItems) {
    const warnings = [];
    const unavailable = [];

    for (const item of orderItems) {
        const menuItem = await MenuItem.findById(item.menuItemId || item.menuItem)
            .select('name ingredients');
        if (!menuItem) continue;

        for (const ingredientName of (menuItem.ingredients || [])) {
            const inv = await Inventory.findOne({
                name: { $regex: new RegExp('^' + ingredientName + '$', 'i') }
            });
            if (!inv) continue; // ingredient not tracked

            if (inv.currentStock <= 0) {
                unavailable.push(`${menuItem.name} (${ingredientName} is out of stock)`);
            } else if (inv.isLow) {
                warnings.push(`${ingredientName} is running low (${inv.currentStock} ${inv.unit} left)`);
            }
        }
    }

    return {
        canFulfill: unavailable.length === 0,
        unavailable,
        warnings
    };
}

/**
 * Deduct inventory when order is confirmed
 * Simple deduction — 1 unit per menu item ordered
 */
async function deductInventory(orderItems) {
    for (const item of orderItems) {
        const menuItem = await MenuItem.findById(item.menuItem)
            .select('name ingredients');
        if (!menuItem) continue;

        for (const ingredientName of (menuItem.ingredients || [])) {
            const inv = await Inventory.findOne({
                name: { $regex: new RegExp('^' + ingredientName + '$', 'i') }
            });
            if (!inv || inv.currentStock <= 0) continue;

            // Deduct quantity ordered (1 unit of ingredient per dish)
            inv.currentStock = Math.max(0, inv.currentStock - item.quantity);
            await inv.save(); // pre-save hook auto-updates isLow
        }
    }
}

module.exports = { checkInventory, deductInventory };
