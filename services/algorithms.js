


// ============================================================
// ALGORITHM 1: Order Priority Scoring (Weighted Normalization)
// Priority = W1×Norm(WaitTime) + W2×Norm(TableImportance) + W3×Norm(ItemCount)
// W1=0.5, W2=0.3, W3=0.2
// ============================================================
function calculateOrderPriority(order) {
    const W1 = 0.5; // wait time weight
    const W2 = 0.3; // table importance weight
    const W3 = 0.2; // item count weight

    // --- Wait Time Normalization (ceiling: 30 minutes = 10 score) ---
    const waitMinutes = (Date.now() - new Date(order.placedAt).getTime()) / 60000;
    const WAIT_CEILING = 30;
    let normWait = waitMinutes / WAIT_CEILING * 10;
    if (normWait > 10) normWait = 10; // cap at 10

    // --- Table Importance Normalization ---
    const tableLocation = order.tableLocation || 'Standard';
    let tableScore;
    if (tableLocation === 'VIP') tableScore = 10;
    else if (tableLocation === 'Window') tableScore = 7;
    else if (tableLocation === 'Outdoor') tableScore = 6;
    else tableScore = 5; // Standard

    // --- Item Count Normalization (ceiling: 10 items = 10 score) ---
    const itemCount = order.items ? order.items.reduce((sum, i) => sum + i.quantity, 0) : 1;
    const ITEM_CEILING = 10;
    let normItems = itemCount / ITEM_CEILING * 10;
    if (normItems > 10) normItems = 10;

    // Weighted linear combination
    const priorityScore = (W1 * normWait) + (W2 * tableScore) + (W3 * normItems);

    return Math.round(priorityScore * 100) / 100;
}

// Sort orders array by priority score descending
function sortOrdersByPriority(orders) {
    // Recalculate scores for all
    const scored = orders.map(order => {
        const score = calculateOrderPriority(order);
        return { ...order, priorityScore: score };
    });

    // Manual insertion sort (from scratch, no library sort)
    for (let i = 1; i < scored.length; i++) {
        const key = scored[i];
        let j = i - 1;
        while (j >= 0 && scored[j].priorityScore < key.priorityScore) {
            scored[j + 1] = scored[j];
            j = j - 1;
        }
        scored[j + 1] = key;
    }

    return scored;
}

// ============================================================
// ALGORITHM 2: Table Recommendation (Seat Utilization Fit Score)
// FitScore = 100 - ((Capacity - PartySize) / Capacity × 100) - LocationPenalty
// ============================================================
function recommendTable(tables, partySize) {
    if (!tables || tables.length === 0) return null;

    let bestTable = null;
    let bestScore = -Infinity;

    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];

        // Skip tables that can't fit the party
        if (table.capacity < partySize) continue;

        // Skip unavailable tables
        if (table.status !== 'available') continue;

        // Seat utilization fit score
        const wastedSeats = table.capacity - partySize;
        const utilizationScore = 100 - ((wastedSeats / table.capacity) * 100);

        // Location penalty: reserve premium tables for larger parties
        let locationPenalty = 0;
        if ((table.location === 'VIP' || table.location === 'Window') && partySize < 4) {
            locationPenalty = 20;
        }

        const fitScore = utilizationScore - locationPenalty;

        if (fitScore > bestScore) {
            bestScore = fitScore;
            bestTable = { ...table.toObject ? table.toObject() : table, fitScore: Math.round(fitScore) };
        }
    }

    return bestTable;
}

// ============================================================
// ALGORITHM 3: Peak Hour Detection (Mean + Standard Deviation)
// μ = Σ f(i) / 24     σ = √(Σ(f(i) - μ)² / 24)
// Peak if f(hour) > μ + σ
// ============================================================
function detectPeakHours(hourlyOrderData) {
    // hourlyOrderData: array of 24 values (index = hour, value = order count)
    const n = 24;
    const freq = new Array(n).fill(0);

    // Fill in provided data
    for (let h = 0; h < n; h++) {
        freq[h] = hourlyOrderData[h] || 0;
    }

    // Step 1: Compute mean (μ) from first principles
    let sum = 0;
    for (let i = 0; i < n; i++) {
        sum = sum + freq[i];
    }
    const mean = sum / n;

    // Step 2: Compute standard deviation (σ) from first principles
    let squaredDiffSum = 0;
    for (let i = 0; i < n; i++) {
        const diff = freq[i] - mean;
        squaredDiffSum = squaredDiffSum + (diff * diff);
    }
    const variance = squaredDiffSum / n;
    const stdDev = Math.sqrt(variance); // Math.sqrt is a built-in, not a library

    // Step 3: Classify peak hours
    const threshold = mean + stdDev;
    const peakHours = [];
    const hourAnalysis = [];

    for (let i = 0; i < n; i++) {
        const isPeak = freq[i] > threshold;
        if (isPeak) peakHours.push(i);
        hourAnalysis.push({
            hour: i,
            orderCount: freq[i],
            isPeak,
            label: `${String(i).padStart(2, '0')}:00`
        });
    }

    return {
        hourAnalysis,
        peakHours,
        mean: Math.round(mean * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        threshold: Math.round(threshold * 100) / 100
    };
}






// ============================================================
// ALGORITHM 1: Simple Moving Average (SMA) Revenue Forecasting
// Formula: SMA(t) = (1/n) × Σ Sales(t-i)  for i = 0 to n-1
// ============================================================
function simpleMovingAverage(salesData, windowSize = 7) {
    if (!salesData || salesData.length === 0) return 0;

    // Use last n days only (sliding window)
    const window = salesData.slice(-windowSize);
    const n = window.length;

    if (n === 0) return 0;

    // Manual summation — no reduce/library
    let sum = 0;
    for (let i = 0; i < n; i++) {
        sum = sum + window[i];
    }

    const sma = sum / n;
    return Math.round(sma * 100) / 100; // round to 2 decimal places
}

// Build forecast array for chart (last 7 days actual + next 3 predicted)
function buildForecastSeries(revenueHistory, windowSize = 7) {
    const result = [];
    const data = revenueHistory.map(r => r.totalRevenue);

    for (let i = 0; i < data.length; i++) {
        result.push({ type: 'actual', value: data[i] });
    }

    // Predict next 3 days using sliding window
    let workingData = [...data];
    for (let day = 1; day <= 3; day++) {
        const predicted = simpleMovingAverage(workingData, windowSize);
        result.push({ type: 'predicted', value: predicted });
        workingData.push(predicted); // slide forward
    }

    return result;
}


// ============================================================
// ALGORITHM 4: Dynamic Discount Engine (Multiplicative Stacking)
// FinalPrice = BasePrice × (1 - D_loyalty) × (1 - D_combo) × (1 - D_happyhour)
// ============================================================
function calculateDiscount(subtotal, customerTotalOrders, orderItems, orderHour) {
    // --- Condition 1: Loyalty Discount (5% if 10+ past orders) ---
    const LOYALTY_THRESHOLD = 10;
    const LOYALTY_RATE = 0.05;
    const hasLoyalty = customerTotalOrders >= LOYALTY_THRESHOLD;
    const D_loyalty = hasLoyalty ? LOYALTY_RATE : 0;

    // --- Condition 2: Combo Discount (10% if 3+ items in same category) ---
    const COMBO_THRESHOLD = 3;
    const COMBO_RATE = 0.10;
    const categoryCounts = {};
    for (let i = 0; i < orderItems.length; i++) {
        const cat = orderItems[i].category;
        categoryCounts[cat] = (categoryCounts[cat] || 0) + orderItems[i].quantity;
    }
    let hasCombo = false;
    const cats = Object.keys(categoryCounts);
    for (let i = 0; i < cats.length; i++) {
        if (categoryCounts[cats[i]] >= COMBO_THRESHOLD) {
            hasCombo = true;
            break;
        }
    }
    const D_combo = hasCombo ? COMBO_RATE : 0;

    // --- Condition 3: Happy Hour Discount (15% between 14:00–17:00) ---
    const HAPPY_START = 14;
    const HAPPY_END = 17;
    const HAPPY_RATE = 0.15;
    const isHappyHour = orderHour >= HAPPY_START && orderHour < HAPPY_END;
    const D_happyhour = isHappyHour ? HAPPY_RATE : 0;

    // Multiplicative stacking (mathematically correct — prevents >100% discount)
    const finalPrice = subtotal * (1 - D_loyalty) * (1 - D_combo) * (1 - D_happyhour);
    const discountAmount = subtotal - finalPrice;

    return {
        loyalty: D_loyalty,
        combo: D_combo,
        happyHour: D_happyhour,
        discountAmount: Math.round(discountAmount * 100) / 100,
        finalPriceAfterDiscount: Math.round(finalPrice * 100) / 100,
        breakdown: {
            loyaltyApplied: hasLoyalty,
            comboApplied: hasCombo,
            happyHourApplied: isHappyHour,
            loyaltySaving: Math.round(subtotal * D_loyalty * 100) / 100,
            comboSaving: Math.round(subtotal * (1 - D_loyalty) * D_combo * 100) / 100,
            happyHourSaving: Math.round(subtotal * (1 - D_loyalty) * (1 - D_combo) * D_happyhour * 100) / 100
        }
    };
}
module.exports = {
    simpleMovingAverage,
    buildForecastSeries,
    calculateOrderPriority,
    sortOrdersByPriority,
    recommendTable,
    calculateDiscount,
    detectPeakHours
};
