const express = require('express');
const router = express.Router();
const { getPaymentDetails } = require('../helper/payment');

// Payment Route /:txn_id

router.get('/:txn_id', async (req, res) => {
    // send meessage only for testing
    const { txn_id } = req.params;

    const paymentDetails = await getPaymentDetails(txn_id);
    const transaction = paymentDetails.transaction;

    // check is moblie or dasktop
    const userAgent = req.headers['user-agent'];
    const isMobile = /mobile/i.test(userAgent);
    const redirect_url = transaction?.redirect_url || 'https://upiexpress.com';


    if (!paymentDetails.status) {
        return res.render('payment/status', { status: "failed", redirect_url });
    }

    if (String(transaction.status).toLowerCase() !== 'pending') {
        return res.render('payment/status', { status: transaction.status.toLowerCase(), redirect_url });
    }

    const expires_at = new Date(transaction.expires_at);


    if (expires_at < new Date()) {
        return res.render('payment/status', { status: "expired", redirect_url });
    }

    const user = paymentDetails.user;
    const merchant = paymentDetails.merchant;


    const expiresIn =
        String(Math.floor((expires_at - new Date()) / 60000)).padStart(2, '0') + ':' +
        String(Math.floor(((expires_at - new Date()) % 60000) / 1000)).padStart(2, '0');


    if (!merchant) {
        return res.render('payment/status', { status: "failed", redirect_url });
    }

    let upiIntent = '';
    let paytmIntent = '';
    let freechargeIntent = '';

    const totalAmount = (Number(transaction.amount) + Number(transaction.convenience_fee)).toFixed(2);

    if (merchant.merchant_type === 'merchants_quintuspay') {
        upiIntent = `upi://pay?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&tn=${transaction.note || 'Powered%20by%20UPIExpress'}&am=${totalAmount}&tr=${transaction.orderid}`;
        paytmIntent = `paytmmp://cash_wallet?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&tn=${transaction.note || 'Powered%20by%20UPIExpress'}&am=${totalAmount}&tr=${transaction.orderid}&featuretype=money_transfer`;
        freechargeIntent = `intent://pay?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&am=${totalAmount}&tn=${encodeURIComponent(transaction.note || 'Powered by UPIExpress')}&tr=${transaction.orderid}&cu=INR#Intent;scheme=upi;package=com.freecharge.android;end;`;
        gpayIntent = `upi://pay?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&tn=${transaction.note || 'Powered%20by%20UPIExpress'}&am=${totalAmount}&tr=${transaction.orderid}&app=googlepay`;
    } else if (merchant.merchant_type === 'merchants_gpay') {
        upiIntent = `upi://pay?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&tn=${transaction.orderid}&am=${totalAmount}&tr=${transaction.orderid}`;
        paytmIntent = `paytmmp://cash_wallet?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&tn=${transaction.orderid}&am=${totalAmount}&tr=${transaction.orderid}&featuretype=money_transfer`;
        freechargeIntent = `upi://pay?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&am=${totalAmount}&tn=${transaction.orderid}&tr=${transaction.orderid}&cu=INR#Intent;scheme=upi;package=com.freecharge.android;end;`;
        gpayIntent = `upi://pay?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&tn=${transaction.orderid}&am=${totalAmount}&tr=${transaction.orderid}&app=googlepay`;
    } else {
        upiIntent = `upi://pay?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&tn=${transaction.note || 'Powered%20by%20UPIExpress'}&am=${totalAmount}&tr=${transaction.orderid}&tid=${transaction.orderid}`;
        paytmIntent = `paytmmp://cash_wallet?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&tn=${transaction.note || 'Powered%20by%20UPIExpress'}&am=${totalAmount}&tr=${transaction.orderid}&tid=${transaction.orderid}&featuretype=money_transfer`;
        freechargeIntent = `upi://pay?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&am=${totalAmount}&tn=${encodeURIComponent(transaction.note || 'Powered by UPIExpress')}&tr=${transaction.orderid}&tid=${transaction.orderid}&cu=INR#Intent;scheme=upi;package=com.freecharge.android;end;`;
        gpayIntent = `upi://pay?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&tn=${transaction.note || 'Powered%20by%20UPIExpress'}&am=${totalAmount}&tr=${transaction.orderid}&tid=${transaction.orderid}&app=googlepay`;
    }
    if (isMobile) {
        res.render('payment/mobile', {
            user: {
                name: user.business_name || user.name,
                business_icon: user.business_icon,
                theme_color: user.theme_color || '#7B2CF6'
            },
            data: {
                expiresIn: expiresIn,
                subtotal: Number(transaction.amount).toFixed(2),
                convenience_fee: Number(transaction.convenience_fee).toFixed(2),
                total: (Number(transaction.amount) + Number(transaction.convenience_fee)).toFixed(2),
                upiIntent: upiIntent,
                paytmIntent: paytmIntent,
                freechargeIntent: freechargeIntent,
                gpayIntent: gpayIntent,
                isIntent: transaction.isIntent === 1 ? true : false,
                isUPIRequest: transaction.isUPIRequest === 1 ? true : false,
                orderid: transaction.orderid
            }
        });
    } else {
        res.render('payment/desktop', {
            user: {
                name: user.business_name || user.name,
                business_icon: user.business_icon,
                theme_color: user.theme_color || '#7B2CF6'
            },
            data: {
                expiresIn: expiresIn,
                subtotal: Number(transaction.amount).toFixed(2),
                convenience_fee: Number(transaction.convenience_fee).toFixed(2),
                total: (Number(transaction.amount) + Number(transaction.convenience_fee)).toFixed(2),
                upiIntent: upiIntent,
                paytmIntent: paytmIntent,
                isIntent: transaction.isIntent === 1 ? true : false,
                isUPIRequest: transaction.isUPIRequest === 1 ? true : false,
                orderid: transaction.orderid
            }
        });
    }
});

module.exports = router;