const db = require('../../db');
const axios = require("axios");
const { sendTransactionWebhookOnce } = require('../../../helper/webhook');

// function to check pending transactions for paytm for business merchants
async function checkPaytmPendings() {
    try {
        // Fetch all Pending Paytm transactions
        const [transactions] = await db.query(`
            SELECT t.* 
            FROM transactions t 
            INNER JOIN merchants_paytm p 
            ON t.merchant_txnid = p.merchant_txnid 
            WHERE t.status = 'Pending'
        `);

        if (transactions.length === 0) return;

        const promises = transactions.map(async (txn) => {
            try {
                // Get merchant details
                const [merchantDetails] = await db.query(
                    `SELECT * FROM merchants_paytm WHERE merchant_txnid = ?`,
                    [txn.merchant_txnid]
                );

                if (merchantDetails.length === 0) return;

                const details = merchantDetails[0];
                const totalAmount = (Number(txn.amount) + Number(txn.convenience_fee)).toFixed(2);

                // Fetch Paytm transaction status
                const response = await axios.get(`https://securegw.paytm.in/order/status?JsonData={"MID":"${details.mappingId}","ORDERID": "${txn.orderid}"}`);

                const data = response.data;


                let isFound = false;
                if (data.STATUS === "TXN_SUCCESS" && data.TXNAMOUNT === totalAmount) {
                    const payload = {
                        success: true,
                        data: {
                            orderid: txn.orderid,
                            client_txn_id: txn.client_txn_id,
                            txn_id: txn.txn_id,
                            status: "Success",
                            amount: txn.amount,
                            convenience_fee: txn.convenience_fee,
                            total_amount: totalAmount,
                            created_at: txn.created_at,
                            expires_at: txn.expires_at,
                            merchant_txnid: txn.merchant_txnid,
                            customer_mobile: txn.customer_mobile,
                            customer_email: txn.customer_email,
                            customer_name: txn.customer_name,
                            note: txn.note,
                            udf1: txn.udf1,
                            udf2: txn.udf2,
                            udf3: txn.udf3,
                            udf4: txn.udf4,
                            udf5: txn.udf5,
                            redirect_url: txn.redirect_url,
                            webhook_url: txn.webhook_url,
                            upi_transaction_id: data.BANKTXNID,
                            extraData: data || {}
                        }
                    };
                    await sendTransactionWebhookOnce(txn.txn_id, txn.webhook, payload);

                    // Mark transaction success
                    await db.execute(
                        `UPDATE transactions 
                                             SET status = 'Success', upi_transaction_id = ?, merchant_data = ?
                                             WHERE txn_id = ?`,
                        [data.BANKTXNID, JSON.stringify(data), txn.txn_id]
                    );
                    isFound = true;

                }

                if (!isFound) {
                    //  check is txn.expires_at is passed 
                    if (new Date(txn.expires_at) < new Date()) {
                        // Prepare webhook payload
                        const payload = {
                            success: false,
                            data: {
                                orderid: txn.orderid,
                                client_txn_id: txn.client_txn_id,
                                txn_id: txn.txn_id,
                                status: "Expired",
                                amount: txn.amount,
                                convenience_fee: txn.convenience_fee,
                                total_amount: totalAmount,
                                created_at: txn.created_at,
                                expires_at: txn.expires_at,
                                merchant_txnid: txn.merchant_txnid,
                                customer_mobile: txn.customer_mobile,
                                customer_email: txn.customer_email,
                                customer_name: txn.customer_name,
                                note: txn.note,
                                udf1: txn.udf1,
                                udf2: txn.udf2,
                                udf3: txn.udf3,
                                udf4: txn.udf4,
                                udf5: txn.udf5,
                                redirect_url: txn.redirect_url,
                                webhook_url: txn.webhook_url,
                                upi_transaction_id: null,
                                extraData: {}
                            }
                        };

                        await sendTransactionWebhookOnce(txn.txn_id, txn.webhook, payload);
                        // Mark transaction as Expired
                        await db.execute(
                            `UPDATE transactions 
                             SET status = 'Expired' 
                             WHERE txn_id = ?`,
                            [txn.txn_id]
                        );
                    }

                }
            } catch (error) {
                console.error('Error checking Paytm pendings:', error);
            }
        });

        await Promise.all(promises);
    } catch (error) {
        console.error('Error checking Paytm pendings:', error);
    }
}

exports.checkPaytmPendings = checkPaytmPendings;