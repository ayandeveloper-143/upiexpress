const express = require('express');
const router = express.Router();
const db = require('../../controllers/db'); // db connction mysql 
const { validateVPA, upiCollectPayment } = require('../../controllers/merchant/hdfc');
const axios = require("axios");
const { sendTransactionWebhookOnce } = require('../../helper/webhook');

function generateID(length = 18) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";

    for (let i = 0; i < length; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }

    return id;
}


// check vpa router api 
router.post('/check_vpa', async (req, res) => {
    const { vpa, orderid } = req.body;

    if (!vpa) {
        return res.status(400).json({ status: false, message: 'VPA is required' });
    }

    if (!orderid) {
        return res.status(400).json({ status: false, message: 'Order ID is required' });
    }

    try {
        // get transaction details using orderid
        const [rows] = await db.query('SELECT * FROM transactions WHERE orderid = ?', [orderid]);
        if (rows.length === 0) {
            return res.status(404).json({ status: false, message: 'Transaction not found' });
        }
        const transaction = rows[0];

        const merchant_txnid = transaction.merchant_txnid;

        const merchants = [
            'merchants_bharatpe',
            'merchants_freecharge',
            'merchants_hdfc',
            'merchants_paytm',
            'merchants_phonepe',
            'merchants_quintuspay',
            'merchants_yono_sbi'
        ];

        let merchant = null;

        for (const merchantTable of merchants) {
            const [mRows] = await db.execute(`SELECT * FROM ${merchantTable} WHERE merchant_txnid = ? AND userid = ?`, [merchant_txnid, transaction.userid]);
            if (mRows && mRows.length > 0) {
                merchant = mRows[0];
                merchant.merchant_type = merchantTable;
                break;
            }
        }

        if (!merchant) {
            return res.status(404).json({ status: false, message: 'Merchant not found for this transaction' });
        }

        // if merchant_type === 'merchants_hdfc' 
        if (merchant.merchant_type !== 'merchants_hdfc') {
            return res.status(400).json({ status: false, message: 'VPA check is not supported' });
        }

        // const upiAPI = await axios.request({
        //     method: 'GET',
        //     url: `https://vector.jodo.in/flowengine/api/v1/client/verify-vpa/${vpa}`,
        //     headers: {
        //         accept: 'application/json, text/plain, */*',
        //         'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
        //         origin: 'https://app.jodo.in',
        //         priority: 'u=1, i',
        //         referer: 'https://app.jodo.in/',
        //         'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        //         'sec-ch-ua-mobile': '?1',
        //         'sec-ch-ua-platform': '"Android"',
        //         'sec-fetch-dest': 'empty',
        //         'sec-fetch-mode': 'cors',
        //         'sec-fetch-site': 'same-site',
        //         'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
        //         'x-auth-token': 'c08f1fdd79e75cf36764cbb7c6239b71628560528c0a7995e55d60cb240a3a20'
        //     }
        // });

        let isValid = null;

        // if (upiAPI.data.status !== 'success' || !upiAPI.data.data.exists || upiAPI.status !== 200) {
        isValid = await validateVPA(merchant.sessionId, vpa, merchant.terminal_id);
        if (isValid === null) {
            return res.status(500).json({ status: false, message: 'Error validating VPA' });
        }

        if (isValid.status === "Success") {
            return res.json({ status: true, valid: true, message: 'VPA is valid' });
        } else {
            return res.json({ status: true, valid: false, message: 'VPA is invalid' });
        }
        // }

        // return res.json({
        //     status: true, valid: upiAPI.data.data.exists, name: upiAPI.data.data.name || null, message: upiAPI.data.data.exists ? 'VPA is valid' : 'VPA is invalid'
        // });

    } catch (error) {

        return res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

router.post('/upi_request', async (req, res) => {
    const { orderid, upi_vpa } = req.body;

    if (!orderid || !upi_vpa) {
        return res.status(400).json({ status: false, message: 'Order ID and UPI VPA are required' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM transactions WHERE orderid = ?', [orderid]);
        if (rows.length === 0) {
            return res.status(404).json({ status: false, message: 'Transaction not found' });
        }
        const transaction = rows[0];

        if (transaction.isUPIRequest !== 1) {
            return res.status(400).json({ status: false, message: 'UPI Request not enabled for this transaction' });
        }

        const merchant_txnid = transaction.merchant_txnid;

        const merchants = [
            'merchants_bharatpe',
            'merchants_freecharge',
            'merchants_hdfc',
            'merchants_paytm',
            'merchants_phonepe',
            'merchants_quintuspay',
            'merchants_yono_sbi'
        ];

        let merchant = null;

        for (const merchantTable of merchants) {
            const [mRows] = await db.execute(`SELECT * FROM ${merchantTable} WHERE merchant_txnid = ? AND userid = ?`, [merchant_txnid, transaction.userid]);
            if (mRows && mRows.length > 0) {
                merchant = mRows[0];
                merchant.merchant_type = merchantTable;
                break;
            }
        }

        if (!merchant) {
            return res.status(404).json({ status: false, message: 'Merchant not found for this transaction' });
        }

        // if merchant_type === 'merchants_hdfc' 
        if (merchant.merchant_type !== 'merchants_hdfc') {
            return res.status(400).json({ status: false, message: 'VPA check is not supported' });
        }


        const isValid = await validateVPA(merchant.sessionId, upi_vpa, merchant.terminal_id);

        if (isValid === null) {
            return res.status(500).json({ status: false, message: 'Error validating VPA' });
        }

        if (isValid.status !== "Success") {
            return res.status(400).json({ status: false, message: 'Invalid UPI VPA' });
        }
        const totalAmount = (Number(transaction.amount) + Number(transaction.convenience_fee)).toFixed(2);
        const txn_id = generateID(50);
        const upiResult = await upiCollectPayment(
            merchant.sessionId,  // sessionId
            merchant.terminal_id,   // terminalId
            totalAmount,           // amount
            transaction.txn_id,   // description
            transaction.customer_mobile,  // customerMobileNumber
            upi_vpa,     // payerVpa
            txn_id       // appTxnId
        );

        if (upiResult.status !== 'InProgress') {
            return res.status(500).json({ status: false, message: 'Failed to initiate UPI Collect Payment: ' + upiResult.message });
        }

        return res.json({ status: true, message: 'UPI Request initiated successfully' });
    } catch (error) {
        console.error('Error processing UPI request:', error);
        return res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

// cancel payment route
router.post('/cancel_payment', async (req, res) => {
    const { orderid } = req.body;

    if (!orderid) {
        return res.status(400).json({ status: false, message: 'Order ID is required' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM transactions WHERE orderid = ?', [orderid]);
        if (rows.length === 0) {
            return res.status(404).json({ status: false, message: 'Transaction not found' });
        }
        const transaction = rows[0];

        if (transaction.status !== 'Pending') {
            return res.status(400).json({ status: false, message: 'Only pending transactions can be cancelled' });
        }
        const totalAmount = (Number(transaction.amount) + Number(transaction.convenience_fee)).toFixed(2);

        // Prepare webhook payload
        const payload = {
            status: "Cancel",
            orderid: transaction.orderid,
            amount: transaction.amount,
            convenience_fee: transaction.convenience_fee,
            total_amount: totalAmount,
            upi_transaction_id: null
        };

        await sendTransactionWebhookOnce(transaction.txn_id, transaction.webhook, payload);
        // Mark transaction as Expired
        await db.execute(
            `UPDATE transactions 
                                     SET status = 'Cancel' 
                                     WHERE txn_id = ?`,
            [transaction.txn_id]
        );

        return res.json({ status: true, message: 'Transaction cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling transaction:', error);
        return res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

module.exports = {
    apiPaymentRoutes: router
};

