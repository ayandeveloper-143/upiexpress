const db = require('../../db');
const axios = require("axios");

async function checkBharatpePendings() {
    try {
        // Fetch all Pending Bharatpe transactions
        const [transactions] = await db.query(`
            SELECT t.* 
            FROM transactions t 
            INNER JOIN merchants_bharatpe b 
            ON t.merchant_txnid = b.merchant_txnid 
            WHERE t.status = 'Pending'
        `);

        if (transactions.length === 0) return;

        const promises = transactions.map(async (txn) => {
            try {
                // Get merchant details
                const [merchantDetails] = await db.query(
                    `SELECT * FROM merchants_bharatpe WHERE merchant_txnid = ?`,
                    [txn.merchant_txnid]
                );

                if (merchantDetails.length === 0) return;

                const details = merchantDetails[0];
                try {
                    const endTime = Math.round(Date.now());
                    const startTime = endTime - (15 * 60 * 1000); // 15 minutes ago in milliseconds
                    const apiUrl = 'https://payments-tesseract.bharatpe.in/api/v1/merchant/transactions';
                    const params = {
                        module: 'PAYMENT_QR',
                        merchantId: details.merchantId, // You'll need this field from merchant
                        sDate: startTime,
                        eDate: endTime,
                        pageSize: 10,
                        pageCount: 0,
                        isFromOtDashboard: 1
                    };

                    const queryString = new URLSearchParams(params).toString();
                    const fullUrl = `${apiUrl}?${queryString}`;

                    const headers = {
                        'accept': 'application/json, text/javascript, */*; q=0.01',
                        'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8,hi;q=0.7',
                        'origin': 'https://enterprise.bharatpe.in',
                        'priority': 'u=1, i',
                        'referer': 'https://enterprise.bharatpe.in/',
                        'sec-ch-ua': '\'Google Chrome\';v=\'137\', \'Chromium\';v=\'137\', \'Not/A )Brand\';v=\'24\'',
                        'sec-ch-ua-mobile': '?1',
                        'sec-ch-ua-platform': '\'Android\'',
                        'sec-fetch-dest': 'empty',
                        'sec-fetch-mode': 'cors',
                        'sec-fetch-site': 'same-site',
                        'token': details.access_token, // You'll need this from merchant
                        'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
                    };

                    const apiResponse = await axios.get(fullUrl, { headers });
                    const apiData = apiResponse.data;
                    const totalAmount = (Number(txn.amount) + Number(txn.convenience_fee)).toFixed(2);

                    let isFound = false;
                    // Extract used amounts from API response
                    if (apiData && apiData.data && apiData.data.transactions && Array.isArray(apiData.data.transactions)) {
                        apiData.data.transactions.forEach(async t => {
                            if (t.amount && t.status === 'SUCCESS') {
                                if (Number(t.amount).toFixed(2) === totalAmount) {

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
                                            upi_transaction_id: t.bankReferenceNo,
                                            extraData: t || {}
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
                                        [t.bankReferenceNo, JSON.stringify(t), txn.txn_id]
                                    );
                                    isFound = true;
                                    return;
                                }
                            }
                        });
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

                } catch (apiError) {
                    console.warn('Warning: Could not fetch from BharatPE API, proceeding with database check only:', apiError.message);
                }


            } catch (error) {
                console.error(`Error processing transaction ${txn.txn_id}:`, error);
            }
        }
        );

        await Promise.all(promises);
    } catch (error) {
        console.error('Error checking Bharatpe pendings:', error);
    }
}

exports.checkBharatpePendings = checkBharatpePendings;