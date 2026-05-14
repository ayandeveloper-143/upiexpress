const { getTransactionHistory } = require('../../merchant/freecharge');
const db = require('../../db');
const axios = require("axios");
const { sendTransactionWebhookOnce } = require('../../../helper/webhook');
const { json } = require('body-parser');



async function checkFreechagrePendings() {
    try {
        // Fetch all Pending Freecharge transactions
        const [transactions] = await db.query(`
            SELECT t.* 
            FROM transactions t 
            INNER JOIN merchants_freecharge f 
            ON t.merchant_txnid = f.merchant_txnid 
            WHERE t.status = 'Pending'
        `);

        if (transactions.length === 0) return;

        const promises = transactions.map(async (txn) => {
            try {
                // Get merchant details
                const [merchantDetails] = await db.query(
                    `SELECT * FROM merchants_freecharge WHERE merchant_txnid = ?`,
                    [txn.merchant_txnid]
                );

                if (merchantDetails.length === 0) return;

                const details = merchantDetails[0];

                // Fetch Freecharge transaction history
                const history = await getTransactionHistory(details.fcWalletToken);



                let isFound = false;
                if (history.success) {
                    let transactions = history.transactions;

                    for (let i = 0; i < transactions.length; i++) {
                        let billerMeta = transactions[i]?.billerInfo?.billerMetaData || [];
                        let comment = null;
                        let utr = null;

                        // Loop through billerMetaData sections
                        for (let section of billerMeta) {
                            if (section.sectionDetails && Array.isArray(section.sectionDetails)) {
                                for (let detail of section.sectionDetails) {
                                    if (detail.name === "FC Transaction ID") {
                                        comment = detail.value;
                                    }
                                    if (detail.name === "UPI Transaction ID") {
                                        utr = detail.value;
                                    }
                                }
                            }
                        }

                        // Match orderId with comment
                        if (txn.orderid === comment) {
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
                                    upi_transaction_id: utr,
                                    extraData: transactions[i] || {}
                                }
                            };

                            await sendTransactionWebhookOnce(txn.txn_id, txn.webhook, payload);

                            // Mark transaction success
                            await db.execute(
                                `UPDATE transactions 
                                                                         SET status = 'Success', upi_transaction_id = ?, merchant_data = ?
                                                                         WHERE txn_id = ?`,
                                [utr, JSON.stringify(transactions[i]), txn.txn_id]
                            );
                            isFound = true;
                            break;
                        }

                    }


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
                console.error(`Error processing transaction ${txn.merchant_txnid}:`, error);
            }

        });

        await Promise.all(promises);

    } catch (error) {
        console.error('Error checking Freecharge pendings:', error);
        throw error;
    }
}

exports.checkFreechagrePendings = checkFreechagrePendings;