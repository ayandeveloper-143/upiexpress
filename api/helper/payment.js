// import db 
const e = require('express');
const crypto = require('crypto');
const db = require('../controllers/db');

const axios = require('axios');
const { generateQRPayment } = require('../controllers/merchant/hdfc');
const { decodeUPIFromBase64 } = require('../controllers/base64');
const { getCustomInspectSymbol } = require('tough-cookie/lib/utilHelper');

// ================= //
// Helper Functions //
// ================= //


function generateID(length = 18) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";

    for (let i = 0; i < length; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }

    return id;
}


// Helper function to find unique amount for BharatPE using API + Database
async function findUniqueAmountForBharatPE(baseAmount, merchant) {
    try {
        const originalAmount = parseFloat(baseAmount);
        const endTime = Math.round(Date.now());
        const startTime = endTime - (15 * 60 * 1000); // 15 minutes ago in milliseconds

        // Step 1: Fetch used amounts from BharatPE API
        const usedAmountsFromAPI = {};
        try {
            const apiUrl = 'https://payments-tesseract.bharatpe.in/api/v1/merchant/transactions';
            const params = {
                module: 'PAYMENT_QR',
                merchantId: merchant.merchantId, // You'll need this field from merchant
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
                'token': merchant.access_token, // You'll need this from merchant
                'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
            };

            const apiResponse = await axios.get(fullUrl, { headers });
            const apiData = apiResponse.data;

            // Extract used amounts from API response
            if (apiData && apiData.data && apiData.data.transactions && Array.isArray(apiData.data.transactions)) {
                apiData.data.transactions.forEach(txn => {
                    if (txn.amount && txn.status === 'SUCCESS') {
                        const formattedAmount = parseFloat(txn.amount).toFixed(2);
                        usedAmountsFromAPI[formattedAmount] = true;
                    }
                });
            }
        } catch (apiError) {
            console.warn('Warning: Could not fetch from BharatPE API, proceeding with database check only:', apiError.message);
        }

        // Step 2: Try to find unique amount (check both API and database)
        for (let i = 0; i <= 100; i++) {
            const checkAmount = originalAmount + (i * 0.01);
            const formattedAmount = checkAmount.toFixed(2);

            // Check if amount was used in API
            if (usedAmountsFromAPI[formattedAmount]) {
                continue; // Skip this amount
            }

            // Check if this amount already exists as pending in database in last 15 minutes
            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
            const [rows] = await db.query(
                "SELECT COUNT(*) AS count FROM transactions WHERE amount = ? AND status = 'pending' AND created_at >= ?",
                [formattedAmount, fifteenMinutesAgo]
            );

            if (rows[0].count === 0) {
                // Found unique amount
                return { 'status': true, 'amount': parseFloat(formattedAmount) };
            }
        }

        // If no unique amount found in 100 attempts
        return { 'status': false, 'message': 'Could not find unique amount, try other amount' };
    } catch (error) {
        console.error('Error finding unique amount for BharatPE:', error);
        return { 'status': false, 'message': 'Error checking unique amount' };
    }
}


// create payment 

async function createPayment(apikey, amount, client_txn_id, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '', customer_mobile, customer_email, customer_name, convenience_fee, user_ip, redirect_url, webhook, merchant_txnid = false, note = null) {
    try {

        // Prepare payment data


        // Validate API key and get user
        const [userRows] = await db.query('SELECT * FROM users WHERE apikey = ?', [apikey]);
        if (userRows.length === 0) {
            return { 'status': false, 'message': 'Invalid API Key' };
        }
        const user = userRows[0];

        const usertype = user.type;

        if (user.account_status !== 'active') {
            return { 'status': false, 'message': 'User account is not active' };
        }

        let plan = null;
        const isAdmin = usertype === 'admin';

        // For admin users, bypass plan checks and use enterprise_quarterly features
        if (isAdmin) {
            // Create a virtual plan object for admin with enterprise features
            plan = {
                plan_id: 'enterprise_quarterly',
                qr_code_requests_used: 0,
                qr_code_requests_limit: Infinity, // Admin has unlimited requests
                id: null // Virtual plan, no database ID
            };
        } else {
            // Get only ONE active plan (oldest plan first) - check both active and expiring status
            const [planRows] = await db.query(
                `SELECT * FROM users_plans 
             WHERE userid = ? AND plan_status IN ('active', 'expiring') AND status = 'active' 
             ORDER BY created_at ASC
             LIMIT 1`,
                [user.userid]
            );

            if (planRows.length === 0) {
                return { status: false, message: "No active plan found for user. Please subscribe to a plan." };
            }

            plan = planRows[0];

            // Check if QR code requests limit is reached
            if (plan.qr_code_requests_used >= plan.qr_code_requests_limit) {
                return { status: false, message: "QR code request limit reached. Please upgrade your plan." };
            }
        }

        const merchants = [
            'merchants_bharatpe',
            'merchants_freecharge',
            'merchants_hdfc',
            'merchants_paytm',
            'merchants_phonepe',
            'merchants_yono_sbi'
        ];

        if (plan.plan_id === 'enterprise_monthly' || plan.plan_id === 'enterprise_quarterly') {
            merchants.push('merchants_quintuspay');
            merchants.push('merchants_gpay');
        }



        let merchant = null;

        if (merchant_txnid) {
            for (const merchantTable of merchants) {
                const [rows] = await db.execute(`SELECT * FROM ${merchantTable} WHERE merchant_txnid = ? AND userid = ? AND (status = 'active' OR status = 1) AND merchant_status = 'true' AND vpa IS NOT NULL`, [merchant_txnid, user.userid]);
                if (rows && rows.length > 0) {
                    merchant = rows[0];
                    merchant.merchant_type = merchantTable;
                    break;
                }
            }
        } else {
            const allMerchants = [];
            for (const merchantTable of merchants) {
                const [rows] = await db.execute(`SELECT * FROM ${merchantTable} WHERE userid = ? AND (status = 'active' OR status = 1) AND merchant_status = 'true' AND vpa IS NOT NULL `, [user.userid]);
                if (rows && rows.length > 0) {
                    rows.forEach(row => row.merchant_type = merchantTable);
                    allMerchants.push(...rows);
                }
            }
            if (allMerchants.length > 0) {
                const idx = (typeof crypto.randomInt === 'function')
                    ? crypto.randomInt(0, allMerchants.length)
                    : Math.floor(Math.random() * allMerchants.length);
                merchant = allMerchants[idx];
            }
        }

        if (!merchant) {
            return { 'status': false, 'message': 'Please connect at least one merchant to create payments.' };
        }

        // check in transactions table if client_txn_id already exists  
        const [txnRows] = await db.query('SELECT * FROM transactions WHERE client_txn_id = ?', [client_txn_id]);
        if (txnRows.length > 0) {
            return { 'status': false, 'message': 'Client Transaction ID already exists' };
        }

        // customer_mobile validation
        if (!/^\d{10}$/.test(customer_mobile)) {
            return { 'status': false, 'message': 'Invalid customer mobile number' };
        }

        // customer_email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
            return { 'status': false, 'message': 'Invalid customer email address' };
        }

        // check user_ip last 15 min max 100 requests
        const [ipRows] = await db.query('SELECT COUNT(*) AS request_count FROM transactions WHERE user_ip = ? AND created_at >= NOW() - INTERVAL 15 MINUTE', [user_ip]);
        if (ipRows[0].request_count >= 100) {
            return { 'status': false, 'message': 'Too many requests from this IP address. Please try again later.' };
        }

        const isIntent = user.isIntent === 1 ? 1 : 0;
        const isUPIRequest = (merchant.merchant_type === 'merchants_hdfc') ? 1 : 0;


        // 10 min expiry time
        const expiryTime = new Date(Date.now() + 10 * 60 * 1000);

        let orderid = '';
        const txn_id = generateID(50);
        const totalAmount = Number(
            (Number(amount) + Number(convenience_fee)).toFixed(2)
        );

        if (merchant.merchant_type === 'merchants_hdfc') {
            let resp = null;
            let lastError = null;

            // Try to generate QR payment up to 2 times
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    resp = await generateQRPayment(
                        merchant.sessionId,  // sessionId
                        merchant.terminal_id,                                // terminalId
                        totalAmount,
                        txn_id,                          // description
                        customer_mobile,                           // customerMobileNumber
                        txn_id,                                // appTxnId,
                        merchant.phone_number,                         // merchantMobileNumber
                        merchant.pin,
                        merchant.deviceid                         // deviceId
                    );

                    // If successful, break the loop
                    if (resp && resp.status === 'success') {
                        break;
                    }

                    lastError = resp?.message || 'Unknown error';
                } catch (error) {
                    lastError = error.message;
                    console.error(`Attempt ${attempt} failed: ${lastError}`);

                    // If this is the last attempt, don't retry
                    if (attempt === 2) {
                        throw error;
                    }

                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            if (!resp || resp.status !== 'success') {
                if (resp && resp.type && resp.type === 'merchant_disconnect') {
                    // update merchants_hdfc table status to inactive
                    await db.execute(
                        `UPDATE merchants_hdfc 
                         SET status = 'inactive' 
                         WHERE merchant_txnid = ?`,
                        [merchant.merchant_txnid]
                    );
                }
                return { 'status': false, 'message': 'Failed to generate QR payment: ' + (lastError || (resp?.message || 'Unknown error')) };
            }

            const sessionId = resp.sessionId;
            // update merchants_hdfc table with new sessionId
            await db.execute(
                `UPDATE merchants_hdfc 
                 SET sessionId = ? 
                 WHERE merchant_txnid = ?`,
                [sessionId, merchant.merchant_txnid]
            );

            const rq = await decodeUPIFromBase64(resp.qrData);

            if (!rq) {
                return { 'status': false, 'message': resp.statusMessage };
            }
            orderid = rq.tr;
        } else {
            orderid = generateID(18);
        }


        if (merchant.merchant_type === 'merchants_bharatpe') {
            // Check for unique amount using both API and database to avoid duplicates
            const totalAmount = amount + convenience_fee;
            const uniqueAmountResult = await findUniqueAmountForBharatPE(totalAmount, merchant);

            if (!uniqueAmountResult.status) {
                return { 'status': false, 'message': uniqueAmountResult.message };
            }

            amount = uniqueAmountResult.amount;

            // Generate order ID for BharatPE
            orderid = generateID(18);
        }
        const [result] = await db.execute(
            'INSERT INTO transactions (userid, merchant_txnid, client_txn_id, amount, convenience_fee, customer_mobile, customer_email, udf1, udf2, udf3, udf4, udf5, user_ip, redirect_url, webhook, status, isIntent, isUPIRequest, expires_at, txn_id, orderid, note, customer_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [user.userid, merchant.merchant_txnid, client_txn_id, amount, convenience_fee, customer_mobile, customer_email, udf1, udf2, udf3, udf4, udf5, user_ip, redirect_url, webhook, 'pending', isIntent, isUPIRequest, expiryTime, txn_id, orderid, note, customer_name]
        );


        const link = `https://upiexpress.com/payment/${txn_id}`;

        // Increment the qr_code_requests_used by 1 (skip for admin users)
        if (!isAdmin) {
            const newUsedCount = plan.qr_code_requests_used + 1;
            let planNameMap = {
                'startup_monthly': 'Startup',
                'startup_quarterly': 'Startup',
                'starter_monthly': 'Starter',
                'starter_quarterly': 'Starter',
                'enterprise_monthly': 'Enterprise',
                'enterprise_quarterly': 'Enterprise',
                'business_monthly': 'Business',
                'business_quarterly': 'Business'
            };
            // Check if after incrementing, the used count equals or exceeds the limit
            if (newUsedCount >= plan.qr_code_requests_limit) {
                // Update current plan status to inactive since limit is reached
                await db.query(
                    `UPDATE users_plans 
             SET qr_code_requests_used = ?, 
                 plan_status = 'expired', 
                 status = 'inactive' 
             WHERE id = ?`,
                    [newUsedCount, plan.id]
                );

                const message = `Dear ${user.name},

Your plan "${planNameMap[plan.plan_id]}" has been successfully used up on UPI Express.

📅 Validity: ${new Date(plan.started_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} to ${new Date(plan.expire_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
🔢 QR Request Limit: ${plan.qr_code_requests_limit}
⚡ Features Enabled: Based on your plan

To continue using our services, please subscribe to a new plan.

Thank you for choosing UPI Express!
Subscribe now: https://upiexpress.com/`;

                // Send message about plan expiry
                await axios.post('http://localhost:5051/send', {
                    phone: "91" + user.phone,
                    message: message
                });
                // Check if there are other plans that are inactive but plan_status is active
                const [otherPlanRows] = await db.query(
                    `SELECT * FROM users_plans 
             WHERE userid = ? 
             AND id != ? 
             AND status = 'inactive' 
             AND plan_status = 'active'
             ORDER BY created_at ASC
             LIMIT 1`,
                    [user.userid, plan.id]
                );

                if (otherPlanRows.length > 0) {
                    const otherPlan = otherPlanRows[0];
                    const now = new Date();

                    // Calculate duration based on started_at and expire_at
                    let expireDate;

                    if (otherPlan.started_at && otherPlan.expire_at) {
                        // Parse existing dates
                        const startedDate = new Date(otherPlan.started_at);
                        const originalExpireDate = new Date(otherPlan.expire_at);

                        // Calculate the duration in milliseconds
                        const durationMs = originalExpireDate.getTime() - startedDate.getTime();
                        const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

                        // Calculate new expire date from now
                        expireDate = new Date(now);
                        expireDate.setDate(expireDate.getDate() + durationDays);
                    }


                    const formatDate = (date) => {
                        return date.toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                        });
                    };

                    // Activate the other plan
                    await db.query(
                        `UPDATE users_plans 
                 SET status = 'active',
                     started_at = ?,
                     expire_at = ?,
                     qr_code_requests_used = 0
                 WHERE id = ?`,
                        [now, expireDate, otherPlan.id]
                    );

                    const message = `Dear ${user.name},

Your plan "${planNameMap[otherPlan.plan_id]}" has been successfully activated on UPI Express.

📅 Validity: ${formatDate(now)} to ${formatDate(expireDate)}
🔢 QR Request Limit: ${otherPlan.qr_code_requests_limit}
⚡ Features Enabled: Based on your plan

Thank you for choosing UPI Express!
Login now: https://upiexpress.com`;

                    // Send message after processing plans
                    await axios.post('http://localhost:5051/send', {
                        phone: "91" + user.phone,
                        message: message
                    });

                }
            } else {
                // Just increment the used count, keep status as is
                await db.query(
                    `UPDATE users_plans 
             SET qr_code_requests_used = ?
             WHERE id = ?`,
                    [newUsedCount, plan.id]
                );
            }
        }

        const upiIntent = `upi://pay?pa=${merchant.vpa}&pn=${encodeURIComponent(user.name)}&tn=${orderid}&am=${parseFloat(amount) + parseFloat(convenience_fee)}&tr=${orderid}`;

        return { 'status': true, 'message': 'Payment created successfully', data: { 'payment_link': link, 'client_txn_id': client_txn_id, 'txn_id': txn_id, 'orderid': orderid, 'expires_at': expiryTime, 'created_at': new Date(), 'amount': amount, 'convenience_fee': convenience_fee, 'total': parseFloat(amount) + parseFloat(convenience_fee), 'upiintent': upiIntent } };
    } catch (error) {
        console.error('Error creating payment:', error);
        return { 'status': false, 'message': 'Internal Server Error' };
    }
}


async function getPaymentDetails(txn_id) {
    try {
        const [rows] = await db.query('SELECT * FROM transactions WHERE txn_id = ?', [txn_id]);
        if (rows.length === 0) {
            return { 'status': false, 'message': 'Transaction not found' };
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
            'merchants_yono_sbi',
            'merchants_gpay'
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

        // get users table data
        const [userRows] = await db.query('SELECT * FROM users WHERE userid = ?', [transaction.userid]);
        const user = userRows[0];

        return { 'status': true, 'transaction': transaction, 'merchant': merchant, 'user': user };
    } catch (error) {
        console.error('Error fetching payment details:', error);
        return { 'status': false, 'message': 'Internal Server Error' };
    }
}


module.exports = {
    createPayment,
    generateID,
    getPaymentDetails,
};

