/**
 * DineEase — eSewa Payment Integration
 * Uses eSewa's free sandbox/test environment
 * Docs: https://developer.esewa.com.np/
 *
 * Sandbox credentials (test only):
 *   eSewa ID: 9711111111/2/3
Password: Test@123
MPIN: 1122 (for application only)
Merchant ID/Service Code: EPAYTEST
Token:123456
Secret Key:8gBm/:&EnhH.1/q
 */

const crypto = require('crypto');

const ESEWA_CONFIG = {
    // Sandbox (test) — change to production URL when deploying
    gatewayUrl: process.env.ESEWA_GATEWAY_URL || 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
    successUrl: process.env.ESEWA_SUCCESS_URL || 'http://localhost:3000/payment/esewa/success',
    failureUrl: process.env.ESEWA_FAILURE_URL || 'http://localhost:3000/payment/esewa/failure',
    // Sandbox product code
    productCode: process.env.ESEWA_PRODUCT_CODE || 'EPAYTEST',
    // Sandbox secret key
    secretKey: process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q'
};

/**
 * Generate HMAC-SHA256 signature for eSewa v2
 * Required fields in signature: total_amount,transaction_uuid,product_code
 */
function generateEsewaSignature(totalAmount, transactionUuid) {
    const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${ESEWA_CONFIG.productCode}`;
    return crypto
        .createHmac('sha256', ESEWA_CONFIG.secretKey)
        .update(message)
        .digest('base64');
}

/**
 * Build eSewa payment form data
 * Returns object to be submitted as hidden form fields
 */
function buildEsewaPaymentData(orderId, orderNumber, totalAmount) {
    // Use orderId + random string to guarantee uniqueness even on page reload
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const transactionUuid = `DE-${orderId.toString().slice(-8)}-${random}`;
    const signature = generateEsewaSignature(totalAmount, transactionUuid);

    return {
        amount: totalAmount,
        tax_amount: 0,
        total_amount: totalAmount,
        transaction_uuid: transactionUuid,
        product_code: ESEWA_CONFIG.productCode,
        product_service_charge: 0,
        product_delivery_charge: 0,
        success_url: ESEWA_CONFIG.successUrl,
        failure_url: ESEWA_CONFIG.failureUrl,
        signed_field_names: 'total_amount,transaction_uuid,product_code',
        signature,
        gatewayUrl: ESEWA_CONFIG.gatewayUrl,
        orderNumber
    };
}

/**
 * Verify eSewa payment after callback
 * Called when eSewa redirects back to success URL
 */
async function verifyEsewaPayment(encodedResponse) {
    try {
        // eSewa returns base64-encoded JSON
        const decoded = JSON.parse(Buffer.from(encodedResponse, 'base64').toString('utf-8'));

        const { transaction_code, status, total_amount, transaction_uuid, signed_field_names, signature } = decoded;

        if (status !== 'COMPLETE') return { verified: false, reason: 'Payment not complete' };

        // Verify signature
        const fields = signed_field_names.split(',');
        const message = fields.map(f => `${f}=${decoded[f]}`).join(',');
        const expectedSig = crypto
            .createHmac('sha256', ESEWA_CONFIG.secretKey)
            .update(message)
            .digest('base64');

        if (signature !== expectedSig) return { verified: false, reason: 'Signature mismatch' };

        // Extract order ID stored in session (more reliable than parsing UUID)
        // UUID format: DE-{last8ofOrderId}-{random}
        // We store orderId in the transaction_uuid but need the full ID from DB
        // Search by partial match of the order ID suffix
        const orderIdSuffix = transaction_uuid.split('-')[1];

        return {
            verified: true,
            transactionCode: transaction_code,
            totalAmount: parseFloat(total_amount),
            orderIdSuffix, // use to find order in DB
            transactionUuid: transaction_uuid
        };
    } catch (err) {
        return { verified: false, reason: err.message };
    }
}

module.exports = { buildEsewaPaymentData, verifyEsewaPayment, ESEWA_CONFIG };
