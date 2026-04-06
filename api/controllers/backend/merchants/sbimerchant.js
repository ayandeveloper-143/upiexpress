const { getHistory } = require('../../merchant/sbimerchant');
const db = require('../../db');
const axios = require("axios");

async function checkSBIMerchantPendings() {
    try {
        // Fetch all Pending YONO SBI transactions
        const [transactions] = await db.query(`
            SELECT t.* 
            FROM transactions t 
            INNER JOIN merchants_yono_sbi s 
            ON t.merchant_txnid = s.merchant_txnid 
            WHERE t.status = 'Pending'
        `);

        if (transactions.length === 0) return;

        const promises = transactions.map(async (txn) => {
            try {
                // Get merchant details
                const [merchantDetails] = await db.query(
                    `SELECT * FROM merchants_yono_sbi WHERE merchant_txnid = ?`,
                    [txn.merchant_txnid]
                );

                if (merchantDetails.length === 0) return;

                const details = merchantDetails[0];

                const history = await getHistory(
                    details.mid,
                    details.finaltid,
                    details.guid
                );
                const totalAmount = (Number(txn.amount) + Number(txn.convenience_fee)).toFixed(2);
                const transactionList = history?.data?.Result?.[0]?.Values || [];

                const isFound = false;

                for (const record of transactionList) {
                    if (record.Invoice_Number === txn.orderid && record.Transaction_Status === 'Paid' && record.Transaction_Amount === totalAmount) {
                        const payload = {
                            success: true,
                            data: {
                                orderid: txn.orderid,
                                client_txn_id: txn.client_txn_id,
                                txn_id: txn.txn_id,
                                status: "Success",
                                amount: txn.amount,
                                convenience_fee: txn.convenience_fee,
                                total_amount: (Number(txn.amount) + Number(txn.convenience_fee)).toFixed(2),
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
                                upi_transaction_id: record.RRN,
                                extraData: record || {}
                            }
                        };

                        // Send webhook
                        try {
                            const response = await axios.post(txn.webhook, payload, { timeout: 10000 });
                            await db.execute(
                                `UPDATE transactions 
                         SET webhook_status = ?, webhook_statusCode = ? 
                         WHERE txn_id = ?`,
                                ["Sent", response.status, txn.txn_id]
                            );

                        } catch (err) {
                            await db.execute(
                                `UPDATE transactions 
                         SET webhook_status = ?, webhook_statusCode = ? 
                         WHERE txn_id = ?`,
                                ["Failed", err.response ? err.response.status : 500, txn.txn_id]
                            );
                        }

                        // Mark transaction success
                        await db.execute(
                            `UPDATE transactions 
                                             SET status = 'Success', upi_transaction_id = ?, merchant_data = ?
                                             WHERE txn_id = ?`,
                            [record.RRN, JSON.stringify(record), txn.txn_id]
                        );
                        isFound = true;
                        break;

                    }
                }

                if (!isFound) {
                    //  check is txn.expires_at is passed 
                    if (new Date(txn.expires_at) < new Date()) {
                        // Check if webhook was already sent
                        const [webhookCheck] = await db.query(
                            `SELECT webhook_status FROM transactions WHERE txn_id = ?`,
                            [txn.txn_id]
                        );

                        if (webhookCheck.length > 0 && webhookCheck[0].webhook_status === 'Sent') {
                            // Webhook already sent, skip
                            return;
                        }

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

                        // Send webhook
                        try {
                            const response = await axios.post(txn.webhook, payload, { timeout: 10000 });

                            await db.execute(
                                `UPDATE transactions 
                         SET webhook_status = ?, webhook_statusCode = ? 
                         WHERE txn_id = ?`,
                                ["Sent", response.status, txn.txn_id]
                            );

                        } catch (err) {
                            await db.execute(
                                `UPDATE transactions 
                         SET webhook_status = ?, webhook_statusCode = ? 
                         WHERE txn_id = ?`,
                                ["Failed", err.response ? err.response.status : 500, txn.txn_id]
                            );
                        }
                        // Mark transaction as Expired
                        await db.execute(
                            `UPDATE transactions 
                             SET status = 'Expired' 
                             WHERE txn_id = ?`,
                            [txn.txn_id]
                        );
                    }

                }
                console.log('SBI History', JSON.stringify(history, null, 2));
            } catch (error) {
                console.error(`Error processing transaction ${txn.txn_id}:`, error);
            }
        });

        await Promise.all(promises);
    } catch (error) {
        console.error('Error checking SBI Merchant pendings:', error);
    }
}

module.exports = {
    checkSBIMerchantPendings,
};