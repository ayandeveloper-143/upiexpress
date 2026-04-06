// import db 
const e = require('express');
const crypto = require('crypto');
const db = require('../controllers/db');

const axios = require('axios');

const { sendForgetPasswordEmail, sendOTPEmail, sendWelcomeEmail } = require('../helper/emails');
const { loginYonosbi } = require('../controllers/merchant/sbimerchant');
const phonepe = require('../controllers/merchant/phonepe');
const BharatPeAPI = require('../controllers/merchant/bharatpe');
const Freecharge = require('../controllers/merchant/freecharge');
const HDFCOneAppAuth = require('../controllers/merchant/hdfc')
const getVpaFromUpiUrl = require('../helper/upiurlparser');
const quintuspay = require('../controllers/merchant/quintuspay');
const { log } = require('console');


// ================= //
// Helper Functions //
// ================= //

// Session check function
async function checkSessionFromAPI(userToken) {
    if (typeof userToken === 'undefined' || userToken === null) {
        return { hasSession: false, redirectUrl: '/auth/login' };
    }
    const [rows] = await db.execute('SELECT * FROM users WHERE usertoken = ?', [userToken]);
    const user = rows.length ? rows[0] : null;
    if (user) {
        return { hasSession: true, redirectUrl: '/user/dashboard' }
    } else {
        return { hasSession: false, redirectUrl: '/auth/login' }
    }
}

const transformPlans = (dbPlans) => {
    const plansData = {
        monthly: [],
        quarterly: []
    };

    dbPlans.forEach(plan => {
        const transformedPlan = {
            id: plan.plan_id,
            name: plan.plan_name,
            price: `₹${parseInt(plan.price).toLocaleString('en-IN')}`,
            period: `/${plan.plan_type}`,
            description: getDescription(plan.plan_name),
            features: plan.features
                .map(f => ({
                    name: f.name,
                    included: f.included
                })),
            popular: plan.is_recommended === 1
        };

        // Add quarterly-specific fields
        if (plan.plan_type === 'quarterly') {
            const basePrice = parseInt(plan.price) / 0.8; // Reverse 20% bonus
            transformedPlan.originalPrice = `₹${Math.round(basePrice).toLocaleString('en-IN')}`;
            transformedPlan.discount = `Save 20%`;
        }

        const planType = plan.plan_type === 'quarterly' ? 'quarterly' : 'monthly';
        plansData[planType].push(transformedPlan);
    });

    return plansData;
};

const getDescription = (planName) => {
    const descriptions = {
        'Starter': 'Perfect for small businesses',
        'Startup': 'For growing businesses',
        'Business': 'For established businesses',
        'Enterprise': 'For large scale operations'
    };
    return descriptions[planName] || 'Premium plan';
};

async function getUserFromToken(userToken) {
    if (typeof userToken === 'undefined' || userToken === null) {
        return { hasSession: false, redirectUrl: '/auth/login' };
    }
    const [rows] = await db.execute('SELECT * FROM users WHERE usertoken = ?', [userToken]);
    const user = rows.length ? rows[0] : null;


    if (user) {
        return { hasSession: true, redirectUrl: '/user/dashboard', user: user }
    } else {
        return { hasSession: false, redirectUrl: '/auth/login' }
    }
}

async function getPlanStatus(userid) {
    try {

        const [allPlans] = await db.query(
            `SELECT * FROM users_plans 
             WHERE userid = ? AND status IN ('active', 'inactive')
             ORDER BY created_at ASC`,
            [userid]
        );

        if (allPlans.length === 0) {
            return {
                hasPlan: false,
                plan_status: 'no_plan',
                message: 'No plan found'
            };
        }


        if (allPlans.length === 1) {
            const plan = allPlans[0];
            return {
                hasPlan: true,
                plan_status: plan.plan_status,
                status: plan.status,
                plan_id: plan.plan_id,
                plan_name: plan.plan_name,
                expire_at: plan.expire_at,
                message: `Plan status: ${plan.plan_status}`
            };
        }

        const fullyActivePlan = allPlans.find(p =>
            p.status === 'active' && p.plan_status === 'active'
        );

        if (fullyActivePlan) {
            return {
                hasPlan: true,
                plan_status: 'active',
                status: fullyActivePlan.status,
                plan_id: fullyActivePlan.plan_id,
                plan_name: fullyActivePlan.plan_name,
                expire_at: fullyActivePlan.expire_at,
                message: 'Your plan is active'
            };
        }


        const expiringPlan = allPlans.find(p => p.plan_status === 'expiring');
        if (expiringPlan) {
            return {
                hasPlan: true,
                plan_status: 'expiring',
                status: expiringPlan.status,
                plan_id: expiringPlan.plan_id,
                plan_name: expiringPlan.plan_name,
                expire_at: expiringPlan.expire_at,
                message: 'Your plan is expiring soon'
            };
        }


        const expiredPlan = allPlans.find(p => p.plan_status === 'expired');
        if (expiredPlan) {
            return {
                hasPlan: true,
                plan_status: 'expired',
                status: expiredPlan.status,
                plan_id: expiredPlan.plan_id,
                plan_name: expiredPlan.plan_name,
                expire_at: expiredPlan.expire_at,
                message: 'Your plan has expired'
            };
        }

        // Fallback
        return {
            hasPlan: true,
            plan_status: allPlans[0].plan_status,
            status: allPlans[0].status,
            plan_id: allPlans[0].plan_id,
            plan_name: allPlans[0].plan_name,
            expire_at: allPlans[0].expire_at,
            message: 'Plan status unknown'
        };

    } catch (error) {
        console.error('getPlanStatus error:', error);
        return {
            hasPlan: false,
            plan_status: 'error',
            message: 'Error checking plan status'
        };
    }
}


async function getAllHistory(userid) {
    const [rows] = await db.execute('SELECT * FROM `transactions` WHERE userid = ? ORDER BY created_at DESC', [userid]);
    return rows;
}

async function getPaymentHistory(userid) {
    const [rows] = await db.execute('SELECT * FROM `users_plans` WHERE userid = ? ORDER BY created_at DESC', [userid]);
    return rows;
}
// ================= //
// Auth Helper Functions //
// ================= //


// Function to send OTP
async function sendOTP(email, phone, type, otp, requestId) {
    await sendOTPEmail(email, otp);
}


// Function to signup user
async function signupUser(name, email, phone, password, referral) {
    // Check if email already exists 
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ? AND account_status = ?', [email, 'active']);
    if (rows.length) {
        return { success: false, message: 'Email is already registered.' };
    }
    // Check if phone already exists
    const [phoneRows] = await db.execute('SELECT * FROM users WHERE phone = ? AND account_status = ?', [phone, 'active']);
    if (phoneRows.length) {
        return { success: false, message: 'Phone number is already registered.' };
    }

    // delete inactive accounts with same email or phone
    await db.execute('DELETE FROM users WHERE (email = ? OR phone = ?) AND account_status = ?', [email, phone, 'inactive']);

    // check referral code if provided referid is referral code of an existing user
    let referid = null;
    if (referral) {
        const [refRows] = await db.execute('SELECT id FROM users WHERE referid = ?', [referral]);
        if (refRows.length) {
            referid = refRows[0].id;
        }

        // if referral code is invalid return error
        if (!referid) {
            return { success: false, message: 'Invalid referral code.' };
        }
    }

    // Genereate user token and referral code REFxxxxxx
    const userToken = 'UT' + crypto.randomBytes(24).toString('hex');
    const referralCode = 'REF' + Math.random().toString(36).substr(2, 6).toUpperCase();
    // Generate UserId
    const userId = 'U' + crypto.randomBytes(24).toString('hex');
    // Generate 6 digit verification code And Request id for OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const requestId = 'REQ' + crypto.randomBytes(24).toString('hex');

    // hash password
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    // Insert new user into database
    await db.execute('INSERT INTO users (userid, name, email, phone, password, usertoken, upline, referid, account_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, name, email, phone, hashedPassword, userToken, referid, referralCode, 'inactive']);

    // Generate Hash of OTP
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    // 15 minutes expiry
    const expiryTime = new Date(Date.now() + 15 * 60000);

    // Insert OTP into `otp` table userid, request_id, type = signup, code = hash OTP, email, phone
    await db.execute('INSERT INTO otp (userid, request_id, type, code, email, phone, expire_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, requestId, 'signup', otpHash, email, phone, expiryTime]);

    const message =
        `Dear ${name},

Your OTP for UPI Express login is: ${otp}

🔐 Please use this OTP to continue your signup.
⏳ OTP is valid for only 5 minutes.
📋 Tap to copy the OTP and paste during signup.

If this wasn’t you, please ignore this message.

UPI Express
https://upiexpress.com`;
    axios.post('http://localhost:5051/send', {
        phone: "91" + phone,
        message: message
    });
    await axios.post('https://ninzasms.in.net/auth/send_sms', {
        variables_values: otp,
        sender_id: '15422',
        numbers: phone
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'NINZASMSsite2498952ce3d710dd735f8319214c9a7a3235eb36'
        }
    }).catch(err => console.log('NinzaSMS Error:', err.message));
    await sendOTP(email, phone, 'signup', otp, requestId);

    // Return success with userToken and requestId
    return { success: true, message: 'OTP Sent successfully. Please verify your email/phone.', requestId: requestId };
}

// Function to verify OTP for signup
async function verifySignupOTP(requestId, otp) {
    // Fetch OTP record from database
    const [rows] = await db.execute('SELECT * FROM otp WHERE request_id = ? AND type = ?', [requestId, 'signup']);
    if (!rows.length) {
        return { success: false, message: 'Invalid request ID.' };
    }
    const otpRecord = rows[0];
    // Hash the provided OTP
    const crypto = require('crypto');
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    // Compare hashes
    if (otpHash !== otpRecord.code) {
        return { success: false, message: 'Invalid OTP.' };
    }

    // check is expire or not 
    if (otpRecord.expire_at < new Date()) {
        return { success: false, message: 'OTP has expired.' };
    }

    // Update user account status to active
    await db.execute('UPDATE users SET account_status = ? WHERE userid = ?', ['active', otpRecord.userid]);

    // Delete OTP record
    await db.execute('DELETE FROM otp WHERE request_id = ? AND type = ?', [requestId, 'signup']);

    // Get user token
    const [userRows] = await db.execute('SELECT usertoken, name, phone FROM users WHERE userid = ?', [otpRecord.userid]);
    const userToken = userRows[0].usertoken;

    const message = `Hello ${userRows[0].name}, welcome to UPI Express! 🎉
Your account has been successfully created.
You can now manage your API keys, generate QR codes, and use all platform features.

🔗 Open Dashboard: https://upiexpress.com/

If you did not create this account, please contact support.

— UPI Express Team`
    axios.post('http://localhost:5051/send', {
        phone: "91" + otpRecord.phone,
        message: message
    });

    await sendWelcomeEmail(otpRecord.email, userRows[0].name);
    // Return success with userToken
    return { success: true, message: 'Signup verified successfully. You can now log in.', userToken: userToken };
}

// Function to verify OTP for login
async function verifyLoginOTP(requestId, otp, req) {
    // Fetch OTP record from database
    const [rows] = await db.execute('SELECT * FROM otp WHERE request_id = ? AND type = ?', [requestId, 'login']);
    if (!rows.length) {
        return { success: false, message: 'Invalid request ID.' };
    }
    const otpRecord = rows[0];
    // Hash the provided OTP
    const crypto = require('crypto');
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    // Compare hashes
    if (otpHash !== otpRecord.code) {
        return { success: false, message: 'Invalid OTP.' };
    }

    // check is expire or not 
    if (otpRecord.expire_at < new Date()) {
        return { success: false, message: 'OTP has expired.' };
    }

    // Delete OTP record
    await db.execute('DELETE FROM otp WHERE request_id = ? AND type = ?', [requestId, 'login']);

    // Reset User token 
    const newUserToken = 'UT' + crypto.randomBytes(24).toString('hex');
    await db.execute('UPDATE users SET usertoken = ? WHERE userid = ?', [newUserToken, otpRecord.userid]);
    const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
    let ip = req.headers['x-forwarded-for'];
    if (ip) {
        ip = ip.split(',')[0].trim();
    } else {
        ip = req.connection.remoteAddress;
    }

    const [userRows] = await db.execute('SELECT name, phone FROM users WHERE userid = ?', [otpRecord.userid]);
    const message = `Hi ${userRows[0].name}, your UPI Express account was logged in successfully.

📅 Time: ${time}
🌐 IP: ${ip}

If you don’t recognize this login, please secure your account:
🔗 https://upiexpress.com/

—

UPI Express Security Team`
    axios.post('http://localhost:5051/send', {
        phone: "91" + otpRecord.phone,
        message: message
    });
    // Return success with userToken
    return { success: true, message: 'Login verified successfully.', userToken: newUserToken };
}

// check otp type function 
async function checkOTPType(requestId) {
    const [rows] = await db.execute('SELECT type FROM otp WHERE request_id = ?', [requestId]);
    if (rows.length) {
        return rows[0].type;
    }
    return null;
}

// verfiy OTP function
async function verifyOTP(requestId, otp, req) {
    const otpType = await checkOTPType(requestId);
    if (otpType === 'signup') {
        return await verifySignupOTP(requestId, otp);
    } else {
        if (otpType === 'login') {
            return await verifyLoginOTP(requestId, otp, req);
        }
        return { success: false, message: 'Invalid Request.' };
    }
}

// check OTP Request function
async function checkOTPRequest(requestId) {
    if (!requestId) {
        return false;
    }
    const [rows] = await db.execute('SELECT * FROM otp WHERE request_id = ?', [requestId]);
    if (rows.length) {
        return true;
    }
    return false;
}

// Login Function 
async function loginUser(emailOrPhone, password, req) {
    // hash password
    const crypto = require('crypto');
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    // input is email or phone
    const isEmail = emailOrPhone.includes('@');

    if (isEmail) {
        // Check if Email not exists return error
        const [emailRows] = await db.execute('SELECT * FROM users WHERE email = ? AND account_status = ?', [emailOrPhone, 'active']);
        if (!emailRows.length) {
            return { success: false, message: 'email is not registered. Please create an account.' };
        }
    } else {
        // Check if Phone not exists return error
        const [phoneRows] = await db.execute('SELECT * FROM users WHERE phone = ? AND account_status = ?', [emailOrPhone, 'active']);
        if (!phoneRows.length) {
            return { success: false, message: 'phone number is not registered. Please sign up first.' };
        }
    }
    // Check if email or phone exists with the hashed password
    const [rows] = await db.execute('SELECT * FROM users WHERE (email = ? OR phone = ?) AND password = ? AND account_status = ?', [emailOrPhone, emailOrPhone, hashedPassword, 'active']);
    if (rows.length) {
        const user = rows[0];
        if (user.twofa === 1) {
            // send otp verification for login
            const otp = Math.floor(100000 + Math.random() * 900000).toString();

            const requestId = 'REQ' + crypto.randomBytes(24).toString('hex');
            const message =
                `Dear ${user.name},

Your OTP for UPI Express login is: ${otp}

🔐 Please use this OTP to continue your login.
⏳ OTP is valid for only 5 minutes.
📋 Tap to copy the OTP and paste during login.

If this wasn’t you, please ignore this message.

UPI Express
https://upiexpress.com`;
             axios.post('http://localhost:5051/send', {
                phone: "91" + user.phone,
                message: message
            });
            await axios.post('https://ninzasms.in.net/auth/send_sms', {
                variables_values: otp,
                sender_id: '15422',
                numbers: user.phone
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'NINZASMSsite2498952ce3d710dd735f8319214c9a7a3235eb36'
                }
            }).catch(err => console.log('NinzaSMS Error:', err.message));
            // Generate Hash of OTP
            const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
            const expiryTime = new Date(Date.now() + 15 * 60000);

            // Insert OTP into `otp` table
            await db.execute('INSERT INTO otp (userid, request_id, type, code, email, phone, expire_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [user.userid, requestId, 'login', otpHash, user.email, user.phone, expiryTime]);

            await sendOTP(user.email, user.phone, 'login', otp, requestId);

            return { success: true, message: 'OTP sent for login verification.', requestId: requestId, requiresOTP: true };
        } else {
            // Reset User token 
            const newUserToken = 'UT' + crypto.randomBytes(24).toString('hex');
            await db.execute('UPDATE users SET usertoken = ? WHERE userid = ?', [newUserToken, user.userid]);
            const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
            let ip = req.headers['x-forwarded-for'];
            if (ip) {
                ip = ip.split(',')[0].trim();
            } else {
                ip = req.connection.remoteAddress;
            }
            const message = `Hi ${user.name}, your UPI Express account was logged in successfully.

📅 Time: ${time}
🌐 IP: ${ip}

If you don’t recognize this login, please secure your account:
🔗 https://upiexpress.com/

—

UPI Express Security Team`
             axios.post('http://localhost:5051/send', {
                phone: "91" + user.phone,
                message: message
            });
            return { success: true, message: 'Login successful.', userToken: newUserToken };
        }
    } else {
        return { success: false, message: 'The password you entered is incorrect.' };
    }
}

// Resend OTP function
async function resendOTP(requestId) {
    // Fetch OTP record from database
    const [rows] = await db.execute('SELECT * FROM otp WHERE request_id = ?', [requestId]);
    if (!rows.length) {
        return { success: false, message: 'Invalid request ID.' };
    }
    const otpRecord = rows[0];
    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // Hash the new OTP
    const crypto = require('crypto');
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    // 15 minutes expiry
    const expiryTime = new Date(Date.now() + 15 * 60000);
    const userId = otpRecord.userid;
    const user = (await db.execute('SELECT * FROM users WHERE userid = ?', [userId]))[0][0];

    const message =
        `Dear ${user.name},

Your OTP for UPI Express login is: ${otp}

🔐 Please use this OTP to continue your ${otpRecord.type}.
⏳ OTP is valid for only 5 minutes.
📋 Tap to copy the OTP and paste during ${otpRecord.type}.

If this wasn’t you, please ignore this message.

UPI Express
https://upiexpress.com`;
     axios.post('http://localhost:5051/send', {
        phone: "91" + user.phone,
        message: message
    });
    await axios.post('https://ninzasms.in.net/auth/send_sms', {
        variables_values: otp,
        sender_id: '15422',
        numbers: user.phone
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'NINZASMSsite2498952ce3d710dd735f8319214c9a7a3235eb36'
        }
    }).catch(err => console.log('NinzaSMS Error:', err.message));
    // Update OTP record in database
    await db.execute('UPDATE otp SET code = ?, expire_at = ? WHERE request_id = ?', [otpHash, expiryTime, requestId]);

    await sendOTP(otpRecord.email, otpRecord.phone, otpRecord.type, otp, requestId);

    return { success: true, message: 'OTP resent successfully.' };
}


// Forget Password Functions
async function forgetPassword(id) {
    // Check if email or phone exists
    const isEmail = id.includes('@');
    let user;
    if (isEmail) {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ? AND account_status = ?', [id, 'active']);
        if (!rows.length) {
            return { success: false, message: 'Email is not registered.' };
        }
        user = rows[0];
    } else {
        const [rows] = await db.execute('SELECT * FROM users WHERE phone = ? AND account_status = ?', [id, 'active']);
        if (!rows.length) {
            return { success: false, message: 'Phone number is not registered.' };
        }
        user = rows[0];
    }

    // requestId for reset password
    const crypto = require('crypto');
    const requestId = 'REQ' + crypto.randomBytes(24).toString('hex');

    // create a otp for reset password
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Generate Hash of OTP
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    // 15 minutes expiry
    const expiryTime = new Date(Date.now() + 15 * 60000);

    // Insert OTP into `otp` table userid, request_id, type = forget_password, code = hash OTP, email, phone
    await db.execute('INSERT INTO otp (userid, request_id, type, code, email, phone, expire_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user.userid, requestId, 'forget', otpHash, user.email, user.phone, expiryTime]);

    const resetLink = `https://upiexpress.com/auth/forget-password?requestId=${requestId}&code=${otp}`;

    await sendForgetPasswordEmail(user.email, resetLink);

    return { success: true, message: 'Password reset link has been sent to your email.', requestId: requestId };
}

async function getWalletHistory(userid) {
    const [rows] = await db.execute('SELECT * FROM `wallet_history` WHERE userid = ? ORDER BY createdAt DESC', [userid]);
    const history = [];
    for (const row of rows) {
        history.push({
            id: row.orderid,
            type: row.type === "deposit" ? "Credit" : "Debit",
            amount: "₹ " + row.amount.toLocaleString('en-IN'),
            status: row.status.charAt(0).toUpperCase() + row.status.slice(1),
            date: row.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }),
            description: row.type === "deposit" ? "Wallet deposit via UPI" : "Transaction fee payment"
        });
    }
    return history;
}

// Verify Reset Password Function
async function verifyResetPassword(requestId, otp, newPassword) {
    // Fetch OTP record from database
    const [rows] = await db.execute('SELECT * FROM otp WHERE request_id = ? AND type = ?', [requestId, 'forget']);
    if (!rows.length) {
        return { success: false, message: 'Invalid request ID.' };
    }
    const otpRecord = rows[0];
    // Hash the provided OTP
    const crypto = require('crypto');

    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    // Compare hashes
    if (otpHash !== otpRecord.code) {
        return { success: false, message: 'Invalid Code.' };
    }

    // check is expire or not
    if (otpRecord.expire_at < new Date()) {
        return { success: false, message: 'Link has expired.' };
    }

    // hash new password
    const hashedPassword = crypto.createHash('sha256').update(newPassword).digest('hex');

    // Update user password
    await db.execute('UPDATE users SET password = ? WHERE userid = ?', [hashedPassword, otpRecord.userid]);
    // Delete OTP record
    await db.execute('DELETE FROM otp WHERE request_id = ? AND type = ?', [requestId, 'forget']);
    // update user token to invalidate existing sessions
    const newUserToken = 'UT' + crypto.randomBytes(24).toString('hex');
    await db.execute('UPDATE users SET usertoken = ? WHERE userid = ?', [newUserToken, otpRecord.userid]);

    return { success: true, message: 'Password updated successfully.' };
}


// ================= //
// UPI Setup Helper Functions //
// ================= //


async function getUPISetupData() {
    try {
        const [rows] = await db.execute('SELECT * FROM `merchants` ORDER BY `merchants`.`id` ASC');

        // Build the same JSON structure
        const upiSetupData = {
            currentPage: "page2",
            selectedMerchant: null,
            pages: {
                page2: {
                    id: "page2",
                    title: "Select UPI Merchant",
                    description: "Select the Merchant App that you want to connect with the UPIExpress",
                    backButton: {
                        text: "Back to Connect Merchant",
                        action: "backToPage1"
                    },
                    sections: [],
                    nextButton: {
                        text: "Next",
                        action: "goToPage3"
                    }
                }
            },
            merchants: {}
        };

        // Organize merchants by type
        const generalMerchants = [];
        const specialMerchants = [];

        rows.forEach(row => {
            // Parse comma separated values
            const badgeTexts = row.badge_texts ? row.badge_texts.split(',') : [];
            const badgeColors = row.badge_colors ? row.badge_colors.split(',') : [];

            const badges = badgeTexts.map((text, index) => ({
                text: text,
                color: badgeColors[index] || 'teal'
            }));

            // Create merchant object for page2
            const page2Merchant = {
                id: row.merchant_id,
                name: row.merchant_name,
                type: row.merchant_type,
                logo: row.merchant_logo,
                enabled: row.merchant_enabled,
                badges: badges
            };

            // Add to appropriate section
            if (row.merchant_type === 'General Merchant' || row.merchant_type === 'Direct Bank') {
                generalMerchants.push(page2Merchant);
            } else if (row.merchant_type === 'Special Merchant' || row.merchant_type === 'Star Merchant') {
                specialMerchants.push(page2Merchant);
            }

            // Build merchant details for merchants object
            if (row.page3_title) {
                // Parse form fields
                const fieldIds = row.field_ids ? row.field_ids.split(',') : [];
                const fieldLabels = row.field_labels ? row.field_labels.split(',') : [];
                const fieldTypes = row.field_types ? row.field_types.split(',') : [];
                const fieldRequired = row.field_required ? row.field_required.split(',') : [];
                const fieldDisabled = row.field_disabled ? row.field_disabled.split(',') : [];
                const fieldPlaceholders = row.field_placeholders ? row.field_placeholders.split(',') : [];
                const fieldErrorMessages = row.field_error_messages ? row.field_error_messages.split(',') : [];

                const fields = fieldIds.map((id, index) => ({
                    id: id,
                    label: fieldLabels[index] || '',
                    type: fieldTypes[index] || 'text',
                    required: fieldRequired[index] === 'true',
                    disabled: fieldDisabled[index] === 'true',
                    placeholder: fieldPlaceholders[index] || '',
                    errorMessage: fieldErrorMessages[index] || ''
                }));

                // Parse form options
                const optionValues = row.option_values ? row.option_values.split(',') : [];
                const optionTexts = row.option_texts ? row.option_texts.split(',') : [];
                const optionSelected = row.option_selected ? row.option_selected.split(',') : [];

                // Add options to first field (UPI Merchant select)
                if (fields.length > 0 && optionValues.length > 0) {
                    fields[0].options = optionValues.map((value, index) => ({
                        value: value,
                        text: optionTexts[index] || '',
                        selected: optionSelected[index] === 'true'
                    }));
                }

                // Parse buttons
                const buttonTexts = row.button_texts ? row.button_texts.split(',') : [];
                const buttonTypes = row.button_types ? row.button_types.split(',') : [];
                const buttonActions = row.button_actions ? row.button_actions.split(',') : [];

                const buttons = buttonTexts.map((text, index) => ({
                    text: text,
                    type: buttonTypes[index] || 'button',
                    action: buttonActions[index] || ''
                }));

                // Parse steps
                const stepImages = row.step_images ? row.step_images.split(',') : [];
                const stepTexts = row.step_texts ? row.step_texts.split(',') : [];

                const steps = stepImages.map((image, index) => ({
                    image: image,
                    text: stepTexts[index] || ''
                }));

                // Build merchant details
                upiSetupData.merchants[row.merchant_id] = {
                    id: row.merchant_id,
                    name: row.merchant_name,
                    page3: {
                        title: row.page3_title,
                        description: row.page3_description,
                        logo: {
                            src: row.page3_logo_src,
                            alt: row.page3_logo_alt
                        },
                        form: {
                            fields: fields,
                            buttons: buttons
                        },
                        howToCreate: {
                            title: row.how_to_create_title,
                            description: row.how_to_create_description,
                            infoAlert: {
                                icon: row.info_alert_icon,
                                text: row.info_alert_text
                            },
                            steps: steps,
                            successAlert: row.success_alert_text ? {
                                icon: row.success_alert_icon,
                                text: row.success_alert_text
                            } : undefined
                        }
                    }
                };
            }
        });

        // Build sections for page2
        upiSetupData.pages.page2.sections = [
            {
                type: "merchantGrid",
                title: "General Merchants",
                merchants: generalMerchants
            },
            {
                type: "divider",
                text: "Special & Star Merchant"
            },
            {
                type: "merchantGrid",
                title: "Special & Star Merchants",
                merchants: specialMerchants
            }
        ];

        return upiSetupData;

    } catch (error) {
        console.error('Error fetching UPI setup data:', error);
        throw error;
    }
}


// Send Paytm OTP Function 
async function sendPaytmOTP(phone, password, userid) {
    try {

        const [rows] = await db.execute('SELECT * FROM merchants_paytm WHERE userid = ? AND paytm_phone = ? AND status = 1', [userid, phone]);
        if (rows.length > 0) {
            return { success: false, message: 'This Paytm Business account number is already linked with your UPIExpress account.' };
        }

        const response = await axios.post(
            'http://localhost:3240/api/sendotp',
            { phone, password },
            { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );


        return response.data;
    } catch (error) {
        console.error('sendPaytmOTP error:', error && error.message ? error.message : error);
        if (error.response && error.response.data) {
            return error.response.data;
        }
        return { success: false, message: 'Failed to call Paytm OTP API.' };
    }
}

async function verifyPaytmOTP(phone, otp, userid) {
    try {
        const response = await axios.post(
            'http://localhost:3240/api/verify',
            { phone, otp },
            { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );

        if (response.data && response.data.success) {
            // OTP verified successfully
            const data = response.data.qrCodeData.response;



            // get all rows with same paytm_phone and userid
            const [paytmRows] = await db.execute(
                `SELECT * FROM merchants_paytm WHERE paytm_phone = ? AND userid = ?`,
                [phone, userid]
            );

            for (const paytmRow of paytmRows) {
                await db.execute(
                    `DELETE FROM merchants_paytm WHERE merchant_txnid = ? AND userid = ?`,
                    [paytmRow.merchant_txnid, userid]
                );
            }
            for (let key in data) {


                const merchantTXNID = 'PTM' + require('crypto').randomBytes(12).toString('hex');



                const data = response.data.qrCodeData.response;
                await db.execute(
                    `INSERT INTO merchants_paytm (
        userid, merchant_txnid, vpa, mappingId, createTimestamp, 
        qrType, posId, expiryDate, deeplink, amount, status, 
        bankName, displayName, qrCodeId, secondaryPhoneNumber, paytm_phone, 
        notificationPreference, tagLine
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        userid,
                        merchantTXNID,
                        data[key].vpa,
                        data[key].mappingId,
                        data[key].createTimestamp,
                        data[key].qrType,
                        data[key].posId || null,
                        data[key].expiryDate || null,
                        data[key].deeplink,
                        data[key].amount || null,
                        data[key].status,
                        data[key].bankName,
                        data[key].displayName,
                        data[key].qrCodeId || null,
                        data[key].secondaryPhoneNumber || null,
                        phone,
                        data[key].notificationPreference,
                        data[key].tagLine || null
                    ]
                );
            }

            return { success: true, message: 'OTP verified successfully.' };
        } else {
            return { success: false, message: response.data.error || 'OTP verification failed.' };
        }
    } catch (error) {
        console.error('verifyPaytmOTP error:', error && error.message ? error.message : error);
        if (error.response && error.response.data) {
            return error.response.data;
        }
        return { success: false, message: 'Failed to call Paytm OTP verification API.' };
    }
}

// login SBI Merchant Function
async function loginSbiMerchant(mid, password, userid) {

    // if mid is already in merchants_yono_sbi then delete old record

    const [rows] = await db.execute('SELECT * FROM merchants_yono_sbi WHERE userid = ? AND mid = ? AND status = 1', [userid, mid]);
    if (rows.length > 0) {
        return { success: false, message: 'This YONO SBI Merchant MID is already linked with your UPIExpress account.' };
    }

    await db.execute('DELETE FROM merchants_yono_sbi WHERE mid = ?', [mid]);

    const response = await loginYonosbi(password, mid);

    if (response.success) {

        const merchantTXNID = 'SBI' + require('crypto').randomBytes(12).toString('hex');
        const vpa = `SBIPMOPAD.${mid}-${response.data.FinalTID}@sbipay`;
        await db.execute(
            `INSERT INTO merchants_yono_sbi (
                userid, merchant_txnid, guid, finaltid, mid, mname, mercid, vpa, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userid,
                merchantTXNID,
                response.data.GUID,
                response.data.FinalTID,
                mid,
                response.data.MName,
                response.data.MercID,
                vpa,
                1
            ]
        );

        return { success: true, message: 'YONO SBI Merchant login successful.' };
    } else {
        return { success: false, message: response.error || 'YONO SBI Merchant login failed.' };
    }


}

// send phonepe otp function 
async function sendPhonePeOTP(phoneNumber, userid) {

    const [rows] = await db.execute('SELECT * FROM merchants_phonepe WHERE userid = ? AND phone_number = ? AND status = "active"', [userid, phoneNumber]);
    if (rows.length > 0) {
        return { success: false, message: 'This PhonePe Business Phone number is already linked with your UPIExpress account.' };
    }

    const response = await phonepe.sendOTP(phoneNumber);

    if (response.success) {
        const merchantTXNID = 'PH' + require('crypto').randomBytes(12).toString('hex');
        // phone numnber already then delete old record
        await db.execute('DELETE FROM merchants_phonepe WHERE phone_number = ?', [phoneNumber]);
        await db.execute(
            `INSERT INTO merchants_phonepe (userid, merchant_txnid, phone_number, refresh_token, device_data) VALUES (?, ?, ?, ?, ?)`,
            [
                userid,
                merchantTXNID,
                phoneNumber,
                response.token,
                response.device
            ]
        );

        return { success: true, message: 'OTP sent successfully', merchantTXNID: merchantTXNID };
    } else {
        const errMsg = response.response?.errors?.[0] || 'PhonePe OTP sending failed.';
        return {
            success: false,
            message: errMsg
        };
    }
}

// verify phonepe otp function
async function verifyPhonePeOTP(merchantTXNID, otp, userid) {
    // get phonepe merchant record from merchantTXNID
    const [rows] = await db.execute('SELECT * FROM merchants_phonepe WHERE merchant_txnid = ? AND userid = ?', [merchantTXNID, userid]);
    if (rows.length === 0) {
        return { success: false, message: 'Invalid Merchant Transaction ID.' };
    }
    const phonepeMerchant = rows[0];

    const response = await phonepe.verifyOTP(phonepeMerchant.phone_number, otp, phonepeMerchant.refresh_token, phonepeMerchant.device_data);
    console.log('PhonePe OTP Verification Response:', JSON.stringify(response));
    if (response.success) {

        const historyResponse = await phonepe.getHistory(response.token, response.refreshToken, phonepeMerchant.device_data, 10);
        console.log('PhonePe Transaction History Response:', JSON.stringify(historyResponse));
        if (historyResponse.success) {
            const historyData = historyResponse.data;

            // Check if historyData has the expected structure
            if (historyData.errorCode) {
                return {
                    success: false,
                    message: historyData.message || 'Supervisor Merchant Not Supported.'
                };
            }

            const results = historyData.data?.results || [];
            const firstMatch = results.find(
                item => item.merchantDetails?.qrCodeId || item.merchantDetails?.storeName
            );

            const qrCodeId = firstMatch?.merchantDetails?.qrCodeId || null;
            const storeName = firstMatch?.merchantDetails?.storeName || null;

            if (!qrCodeId || !storeName) {
                return {
                    success: false,
                    message: 'Failed to fetch PhonePe Data. At least 1 transaction is required to link PhonePe Merchant.'
                };
            }


            // Ensure all parameters are defined, convert undefined to null
            const authToken = historyResponse.refresh.token || null;
            const refreshToken = historyResponse.refresh.refreshToken || null;


            await db.execute(
                `UPDATE merchants_phonepe SET auth_token = ?, refresh_token = ?, status = ?, vpa = ?, store_name = ? WHERE merchant_txnid = ? AND userid = ?`,
                [
                    authToken,
                    refreshToken,
                    'active',
                    qrCodeId + '@ybl',
                    storeName,
                    merchantTXNID,
                    userid
                ]
            );

            return { success: true, message: 'PhonePe OTP verified successfully.' };
        } else {
            const errMsg = historyResponse.data?.message || 'Failed to fetch PhonePe Data. At least 1 transaction is required to link PhonePe Merchant.';
            return {
                success: false,
                message: errMsg + ' 2 '
            };
        }
    } else {
        const errMsg = response.message || 'PhonePe OTP verification failed.';
        return {
            success: false,
            message: errMsg
        };
    }
}

// bharatpe send otp 
async function sendBharatpeOTP(phone, userid) {
    try {
        const [rows] = await db.execute('SELECT * FROM merchants_bharatpe WHERE userid = ? AND bharatpe_number = ? AND status = "active"', [userid, phone]);
        if (rows.length > 0) {
            return { success: false, message: 'This BharatPe for Business number is already linked with your UPIExpress account.' };
        }

        const response = await BharatPeAPI.sendBharatpeOTP(phone);
        if (response.success) {
            return { success: true, message: 'OTP sent successfully' };
        } else {
            return { success: false, message: response.message || 'BharatPe OTP sending failed.' };
        }
    }
    catch (error) {
        console.error('sendBharatpeOTP error:', error && error.message ? error.message : error);
        return { success: false, message: 'Failed to call BharatPe OTP API.' };
    }

}

async function verifyBharatpeOTP(phone, otp, userid) {
    const response = await BharatPeAPI.verifyBharatpeOTP(phone, otp);

    if (response.success) {
        const merchantTXNID = require('crypto').randomBytes(12).toString('hex');

        await db.execute(
            `INSERT INTO merchants_bharatpe (
        userid, merchant_txnid, bharatpe_number, merchantId, access_token, vpa, businessName, mobile, 
        kycType, accountNumber, ifsc, bankName, beneficiaryName, status, entityType, merchantType, 
        merchantSize, settlementLevel, onboardingDate
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userid,
                merchantTXNID,
                phone,
                response.merchantId,
                response.access_token,
                response.upiId,
                response.profile.businessName,
                response.profile.mobile,
                response.profile.kycType,
                response.profile.accountNumber,
                response.profile.ifsc,

                // Correct bankName path
                response.profile.bankInfo?.bankName || null,

                // beneficiaryName correct
                response.profile.beneficiaryName || response.profile.bankInfo?.beneficiaryName || null,

                'active',
                response.profile.entityType,
                response.profile.merchantType,
                response.profile.merchantSize,
                response.profile.settlementLevel,
                response.profile.onboardingDate
            ]
        );


        return { success: true, message: 'BharatPe OTP verified successfully.' };
    } else {
        return { success: false, message: response.message || 'BharatPe OTP verification failed.' };
    }

}



// send freecharge otp 
async function sendFreechargeOTP(phone, userid) {
    try {
        const [rows] = await db.execute('SELECT * FROM merchants_freecharge WHERE userid = ? AND phone_number = ? AND status = "active"', [userid, phone]);
        if (rows.length > 0) {
            return { success: false, message: 'This Freecharge number is already linked with your UPIExpress account.' };
        }

        const response = await Freecharge.sendOTP(phone);

        if (response.success) {
            // generate merchant txn id
            const merchantTXNID = 'FC' + require('crypto').randomBytes(12).toString('hex');
            // delete old record if phone number exists
            await db.execute('DELETE FROM merchants_freecharge WHERE phone_number = ?', [phone]);
            await db.execute(
                `INSERT INTO merchants_freecharge (userid, merchant_txnid, phone_number, transactionId, otpId) VALUES (?, ?, ?, ?, ?)`,
                [
                    userid,
                    merchantTXNID,
                    phone,
                    response.transactionId,
                    response.otpId
                ]
            );
            return { success: true, message: response.message || 'OTP sent successfully', merchantTXNID: merchantTXNID };
        } else {
            return { success: false, message: response.error || 'Freecharge OTP sending failed.' };
        }
    } catch (error) {
        console.error('sendFreechargeOTP error:', error && error.message ? error.message : error);
        return { success: false, message: 'Failed to check existing Freecharge number.' };
    }
}

// verify freecharge otp
async function verifyFreechargeOTP(userid, phone, otp) {
    // get freecharge record from phone number 
    const [rows] = await db.execute('SELECT * FROM merchants_freecharge WHERE phone_number = ? AND userid = ?', [phone, userid]);
    if (rows.length === 0) {
        return { success: false, message: 'Invalid Phone Number.' };
    }

    const freechargeMerchant = rows[0];
    const response = await Freecharge.verifyOTP(otp, freechargeMerchant.otpId);

    if (response.success) {
        // update freecharge record with fcWalletToken  and fcWalletId vpa and set status to inactive (will be active after UPI ID saved)
        await db.execute(
            `UPDATE merchants_freecharge SET fcWalletToken = ?, fcWalletId = ?, vpa = ?, status = ? WHERE phone_number = ? AND userid = ?`,
            [
                response.fcWalletToken,
                response.fcWalletId,
                response.vpa,
                'inactive',
                phone,
                userid
            ]
        );

        return {
            success: true,
            message: 'Freecharge OTP verified successfully.',
            merchant_txnid: freechargeMerchant.merchant_txnid
        };
    } else {
        return { success: false, message: response.error || 'Freecharge OTP verification failed.' };
    }
}


async function sendHDFCBankOTP(phone, pin, userid) {
    try {

        const [rows] = await db.execute('SELECT * FROM merchants_hdfc WHERE userid = ? AND phone_number = ? AND status = "active"', [userid, phone]);
        if (rows.length > 0) {
            return { success: false, message: 'This HDFC Bank SmartHub Vyapar number is already linked with your UPIExpress account.' };
        }


        const otpResult = await HDFCOneAppAuth.sendOTP(phone);

        if (otpResult.status === 'Failed') {
            return { success: false, message: otpResult.respMessage || 'HDFC Bank SmartHub Vyapar OTP sending failed.' };
        }
        // delete old record if phone number exists
        await db.execute('DELETE FROM merchants_hdfc WHERE phone_number = ?', [phone]);

        const merchantTXNID = 'HDFC' + require('crypto').randomBytes(12).toString('hex');

        await db.execute(
            `INSERT INTO merchants_hdfc (userid, merchant_txnid, phone_number, sessionId, pin, deviceid, name) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                userid,
                merchantTXNID,
                phone,
                otpResult.sessionId,
                pin,
                otpResult.deviceid,
                otpResult.loginName
            ]
        );

        return { success: true, message: 'OTP sent successfully', merchantTXNID: merchantTXNID };
    } catch (error) {
        throw error;
    }

}
async function verifyHDFCBankOTP(userid, phone, otp) {

    // get hdfc record from phone number 
    const [rows] = await db.execute('SELECT * FROM merchants_hdfc WHERE phone_number = ? AND userid = ?', [phone, userid]);

    if (rows.length === 0) {
        return { success: false, message: 'Invalid Phone Number.' };
    }

    const hdfcMerchant = rows[0];

    const response = await HDFCOneAppAuth.verifyOTP(hdfcMerchant.phone_number, otp, hdfcMerchant.sessionId, hdfcMerchant.deviceid);

    if (response.status !== 'Failed') {
        const reponse = await HDFCOneAppAuth.verifyMPIN(hdfcMerchant.phone_number, hdfcMerchant.pin, hdfcMerchant.sessionId);

        if (reponse.status === 'Success') {
            const reponse = await HDFCOneAppAuth.getUserTerminalInfo(hdfcMerchant.sessionId);

            // Filter terminals with roleStatus = 'Active'
            const activeTerminals = reponse.terminalInfo?.filter(terminalObj => {
                const terminalIds = Object.keys(terminalObj);
                return terminalIds.some(id => terminalObj[id].roleStatus === 'Active');
            }) || [];

            if (activeTerminals.length > 1) {
                return { success: true, message: 'HDFC Bank SmartHub Vyapar OTP verified successfully.', terminalInfo: activeTerminals, merchant_txnid: hdfcMerchant.merchant_txnid };
            } else if (activeTerminals.length === 1) {
                const terminalObject = activeTerminals[0];
                const terminalIds = Object.keys(terminalObject).filter(id => terminalObject[id].roleStatus === 'Active');

                const r = await selectHDFCBankTerminal(userid, hdfcMerchant.merchant_txnid, terminalIds[0]);
                if (r.success) {
                    return { success: true, message: 'HDFC Bank SmartHub Vyapar OTP verified successfully.', merchant_txnid: hdfcMerchant.merchant_txnid };
                } else {
                    return r;
                }
            } else {
                return { success: false, message: 'No active terminal information available.' };
            }
        } else {
            return { success: false, message: reponse.respMessage || 'Invalid Pin' };
        }

    } else {
        return {
            success: false, message: response.respMessage || 'HDFC Bank SmartHub Vyapar OTP verification failed.'
        };
    }

}

async function selectHDFCBankTerminal(userid, merchant_txnid, terminalId) {
    // get hdfc record from merchant_txnid
    const [rows] = await db.execute('SELECT * FROM merchants_hdfc WHERE merchant_txnid = ? AND userid = ?', [merchant_txnid, userid]);

    if (rows.length === 0) {
        return { success: false, message: 'Invalid merchant transaction ID.' };
    }

    const hdfcMerchant = rows[0];

    const response = await HDFCOneAppAuth.getUserTerminalInfo(hdfcMerchant.sessionId);

    if (response.status !== 'Success') {
        return { success: false, message: response.respMessage || 'Failed to fetch terminal information.' };
    }

    // Check if terminalInfo exists and is an array
    if (!response.terminalInfo || !Array.isArray(response.terminalInfo)) {
        return { success: false, message: 'No terminal information available.' };
    }

    // terminalInfo is an array, get the first object
    const terminalObject = response.terminalInfo[0];

    // Select terminal using terminalId as key from the object
    const selectedTerminal = terminalObject[terminalId];

    if (!selectedTerminal) {
        return { success: false, message: `Terminal ID ${terminalId} not found.` };
    }
    // Extract QR and payment details
    const qrData = selectedTerminal.payments?.qr || {};
    const upiData = selectedTerminal.payments?.upi || {};

    const vpa = await getVpaFromUpiUrl.decodeUpiPayload(qrData.digitalStaticQRPath || upiData.digitalStaticQRPath || '');

    // Update merchant record with selected terminal details
    await db.execute(
        `UPDATE merchants_hdfc SET 
            terminal_id = ?, 
            mid = ?, 
            cid = ?, 
            dba = ?, 
            companyName = ?, 
            city = ?, 
            location = ?, 
            address = ?, 
            role = ?, 
            tidStatus = ?, 
            pinCode = ?, 
            mccCode = ?, 
            accountNumber = ?, 
            qr_rupayPan = ?,
            qr_masterPassPan = ?,
            qr_mpan = ?,
            qr_staticQRPath = ?,
            qr_digitalStaticQRPath = ?,
            qr_staticQRStatus = ?,
            status = ?,
            vpa = ?
        WHERE merchant_txnid = ? AND userid = ?`,
        [
            terminalId,
            selectedTerminal.mid || null,
            selectedTerminal.cid || null,
            selectedTerminal.dba || null,
            selectedTerminal.companyName || null,
            selectedTerminal.city || null,
            selectedTerminal.location || null,
            selectedTerminal.address || null,
            selectedTerminal.role || null,
            selectedTerminal.tidStatus || null,
            selectedTerminal.pinCode || null,
            selectedTerminal.mccCode || null,
            selectedTerminal.accountNumber || null,
            qrData.rupayPan || null,
            qrData.masterPassPan || null,
            qrData.mpan || null,
            qrData.staticQRPath || null,
            qrData.digitalStaticQRPath || null,
            qrData.staticQRStatus || null,
            'active',
            vpa,
            merchant_txnid,
            userid
        ]
    );

    return { success: true, message: 'HDFC Bank SmartHub Vyapar selected successfully.', terminalInfo: selectedTerminal };
}



async function SendQuintusPayOTP(userid, phone) {
    try {
        // Validate inputs - UNDEFINED CHECK
        if (!userid || userid === undefined) {
            return { success: false, message: 'User ID is required' };
        }
        if (!phone || phone === undefined) {
            return { success: false, message: 'Phone number is required' };
        }

        console.log('SendQuintusPayOTP Params:', { userid, phone }); // Debug log

        const [rows] = await db.execute(
            'SELECT * FROM merchants_quintuspay WHERE userid = ? AND phone_number = ? AND status = "active"',
            [userid, phone]
        );

        if (rows.length > 0) {
            return { success: false, message: 'This QuintusPay Business is already linked with your UPIExpress account.' };
        }

        const response = await quintuspay.sendOtp(phone);

        if (response.success) {
            // generate merchant txn id
            const merchantTXNID = 'QP' + require('crypto').randomBytes(12).toString('hex');

            // delete old record if phone number exists
            await db.execute('DELETE FROM merchants_quintuspay WHERE phone_number = ?', [phone]);

            // INSERT with validated parameters
            await db.execute(
                `INSERT INTO merchants_quintuspay (userid, merchant_txnid, phone_number) VALUES (?, ?, ?)`,
                [
                    userid || null,  // Ensure not undefined
                    merchantTXNID,
                    phone || null    // Ensure not undefined
                ]
            );

            return {
                success: true,
                message: 'OTP sent successfully',
                merchantTXNID: merchantTXNID
            };
        } else {
            return {
                success: false,
                message: response.message || 'QuintusPay OTP sending failed.'
            };
        }
    } catch (error) {
        console.error('SendQuintusPayOTP Error:', error);
        return {
            success: false,
            message: 'Internal server error in OTP sending'
        };
    }
}

async function VerifyQuintusPayOTP(userid, phone, otp) {
    try {
        // Get quintuspay record from phone number 
        const [rows] = await db.execute('SELECT * FROM merchants_quintuspay WHERE phone_number = ? AND userid = ?', [phone, userid]);
        if (rows.length === 0) {
            return { success: false, message: 'Invalid Phone Number.' };
        }

        const quintuspayMerchant = rows[0];

        const response = await quintuspay.verifyOtp(phone, otp);

        if (response.success) {
            const accessToken = response.accessToken;
            const refreshToken = response.refreshToken;

            // Get UPI data
            const qrdataResponse = await quintuspay.getUPI(accessToken);

            if (qrdataResponse.success) {
                // UPDATE database with ALL the data
                const updateQuery = `
                    UPDATE merchants_quintuspay 
                    SET 
                        access_token = ?,
                        refresh_token = ?,
                        login_status = ?,
                        status = 'active',
                        
                        -- User Basic Info
                        email = ?,
                        name = ?,
                        user_type = ?,
                        merchant_user_id = ?,
                        
                        -- Permissions (with safe checks)
                        can_view_collections = ?,
                        can_view_settlements = ?,
                        can_view_total_collections = ?,
                        
                        -- Verification Status
                        mobile_verified = ?,
                        email_verified = ?,
                        user_status = ?,
                        is_complete_online_seller_dd = ?,
                        
                        -- Document Details (with safe checks)
                        business_name = ?,
                        settlement_account_name = ?,
                        business_mobile = ?,
                        business_email = ?,
                        mcc_code = ?,
                        turnover_type = ?,
                        acceptance_type = ?,
                        ownership_type = ?,
                        city = ?,
                        district = ?,
                        state_code = ?,
                        pincode = ?,
                        pan_number = ?,
                        gst_number = ?,
                        settlement_account_number = ?,
                        settlement_account_ifsc = ?,
                        latitude = ?,
                        longitude = ?,
                        address_line_1 = ?,
                        address_line_2 = ?,
                        llp_cin = ?,
                        dob = ?,
                        doi = ?,
                        website_url = ?,
                        
                        -- Seller Addition Info (with safe checks)
                        seller_addition_status = ?,
                        response_code = ?,
                        response_message = ?,
                        partner_reference_number = ?,
                        yp_hub_username = ?,
                        seller_identifier = ?,
                        settlement_account_id = ?,
                        due_diligence_status = ?,
                        monthly_collection_limit = ?,
                        ecollect_account_number = ?,
                        
                        -- UPI Details
                        upi_request_id = ?,
                        upi_status = ?,
                        upi_response_code = ?,
                        upi_response_message = ?,
                        upi_id = ?,
                        qr_string = ?,
                        seller_status = ?,
                        is_suspended = ?,
                        vpa = ?,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE userid = ? AND phone_number = ?
                `;

                const userData = response.user || {};
                const docDetails = userData.document_details || {};
                const sellerAdd = userData.sellerAddition || {};
                const upiData = qrdataResponse.data || {};

                // Safe permissions check
                const permissions = userData.permissions || {};
                const canViewCollections = permissions.canViewCollections || false;
                const canViewSettlements = permissions.canViewSettlements || false;
                const canViewTotalCollections = permissions.canViewTotalCollections || false;

                const values = [
                    // Tokens & Status
                    accessToken,
                    refreshToken,
                    'verified',

                    // User Basic Info
                    userData.email || '',
                    userData.name || '',
                    userData.type || '',
                    userData.merchantUserId || '',

                    // Permissions (with safe values)
                    canViewCollections,
                    canViewSettlements,
                    canViewTotalCollections,

                    // Verification
                    userData.mobile_verified || false,
                    userData.email_verified || false,
                    userData.status || '',
                    userData.is_completeOnlineSellerDD || false,

                    // Document Details (with safe values)
                    docDetails.businessName || '',
                    docDetails.settlementAccountName || '',
                    docDetails.mobileNumber || '',
                    docDetails.emailId || '',
                    docDetails.mcc || '',
                    docDetails.turnoverType || '',
                    userData.acceptanceType || docDetails.acceptanceType || '', // Fallback
                    docDetails.ownershipType || '',
                    docDetails.city || '',
                    docDetails.district || '',
                    docDetails.stateCode || '',
                    docDetails.pincode || '',
                    docDetails.pan || '',
                    docDetails.gstNumber || '',
                    docDetails.settlementAccountNumber || '',
                    docDetails.settlementAccountIfsc || '',
                    docDetails.Latitude || '',
                    docDetails.Longitude || '',
                    docDetails.Address_Line_1 || '',
                    docDetails.Address_Line_2 || '',
                    docDetails.LLP_CIN || '',
                    docDetails.DOB || '',
                    docDetails.DOI || '',
                    docDetails.WebsiteUrl || '',

                    // Seller Addition (with safe values)
                    sellerAdd.status || '',
                    sellerAdd.responseCode || '',
                    sellerAdd.responseMessage || '',
                    sellerAdd.partnerReferenceNumber || '',
                    sellerAdd.ypHubUsername || '',
                    sellerAdd.sellerIdentifier || '',
                    sellerAdd.settlementAccountId || '',
                    sellerAdd.dueDiligenceStatus || '',
                    parseFloat(sellerAdd.monthlyCollectionLimit) || 0,
                    sellerAdd.ecollectAccountNumber || '',

                    // UPI Details (with safe values)
                    upiData.requestId || '',
                    upiData.status || '',
                    upiData.responseCode || '',
                    upiData.responseMessage || '',
                    upiData.vpa || '',
                    upiData.qrString || '',
                    upiData.sellerStatus || '',
                    upiData.isSuspended || false,
                    upiData.vpa || '',

                    // WHERE conditions
                    userid,
                    phone
                ];

                // Execute the update
                await db.execute(updateQuery, values);

                return {
                    success: true,
                    message: 'QuintusPay verified and data stored successfully!'
                };

            } else {
                return { success: false, message: 'Failed to get UPI data from QuintusPay' };
            }

        } else {
            return { success: false, message: response.message || 'QuintusPay OTP verification failed.' };
        }
    } catch (error) {
        console.error('VerifyQuintusPayOTP Error:', error);
        return { success: false, message: 'Internal server error' };
    }
}


// =========== Multi Merchants ========== //

// Get Merchants List Function
async function getMerchantsList(userid) {
    try {


        const merchants = {};

        // Paytm Merchants
        const [paytmRows] = await db.execute('SELECT * FROM merchants_paytm WHERE userid = ? AND status = "1"', [userid]);
        merchants.paytm = paytmRows;

        // YONO SBI Merchants
        const [sbiRows] = await db.execute('SELECT * FROM merchants_yono_sbi WHERE userid = ? AND status = 1', [userid]);
        merchants.yono_sbi = sbiRows;

        // PhonePe Merchants
        const [phonepeRows] = await db.execute('SELECT * FROM merchants_phonepe WHERE userid = ? AND status = "active"', [userid]);
        merchants.phonepe = phonepeRows;

        // BharatPe Merchants
        const [bharatpeRows] = await db.execute('SELECT * FROM merchants_bharatpe WHERE userid = ? AND status = "active"', [userid]);
        merchants.bharatpe = bharatpeRows;

        // Freecharge Merchants
        const [freechargeRows] = await db.execute('SELECT * FROM merchants_freecharge WHERE userid = ? AND status = "active"', [userid]);
        merchants.freecharge = freechargeRows;

        // HDFC Merchants
        const [hdfcRows] = await db.execute('SELECT * FROM merchants_hdfc WHERE userid = ? AND status = "active"', [userid]);
        merchants.hdfc = hdfcRows;

        // QuintusPay Merchants
        const [quintuspayRows] = await db.execute('SELECT * FROM merchants_quintuspay WHERE userid = ? AND status = "active"', [userid]);
        merchants.quintuspay = quintuspayRows;

        const response = {
            success: true,
            data: {
                userid: userid,
                merchants_paytm: merchants.paytm.map(m => {
                    const { merchant_status, ...rest } = m || {};
                    return { ...rest, status: merchant_status == 'true' ? 'active' : 'inactive' };
                }),
                merchants_yono_sbi: merchants.yono_sbi.map(m => {
                    const { merchant_status, ...rest } = m || {};
                    return { ...rest, status: merchant_status == 'true' ? 'active' : 'inactive' };
                }),
                merchants_phonepe: merchants.phonepe.map(m => {
                    const { merchant_status, ...rest } = m || {};
                    return { ...rest, status: merchant_status == 'true' ? 'active' : 'inactive' };
                }),
                merchants_bharatpe: merchants.bharatpe.map(m => {
                    const { merchant_status, ...rest } = m || {};
                    return { ...rest, status: merchant_status == 'true' ? 'active' : 'inactive' };
                }),
                merchants_freecharge: merchants.freecharge.map(m => {
                    const { merchant_status, ...rest } = m || {};
                    return { ...rest, status: merchant_status == 'true' ? 'active' : 'inactive' };
                }),
                merchants_hdfc: merchants.hdfc.map(m => {
                    const { merchant_status, ...rest } = m || {};
                    return {
                        ...rest, status: merchant_status == 'true' ? 'active' : 'inactive'
                    };
                }),
                merchants_quintuspay: merchants.quintuspay.map(m => {
                    const { merchant_status, ...rest } = m || {};
                    return { ...rest, status: merchant_status == 'true' ? 'active' : 'inactive' };
                })
            }
        };


        return response.data;

    } catch (error) {
        console.error('getMerchantsList error:', error && error.message ? error.message : error);
        return { success: false, message: 'Failed to get merchants list.' };
    }
}

// Update merchant status 
async function updateMerchantStatus(userid, merchantTXNID, status) {
    // Update status in all merchant tables
    // using merchant txn id get which merchant it is from table = merchants_bharatpe merchants_freecharge merchants_hdfc merchants_paytm merchants_phonepe merchants_quintuspay merchants_yono_sbi collom merchant_txnid 
    const tables = [
        'merchants_bharatpe',
        'merchants_freecharge',
        'merchants_hdfc',
        'merchants_paytm',
        'merchants_phonepe',
        'merchants_quintuspay',
        'merchants_yono_sbi'
    ];

    if (status === true) {
        status = 'true';
    } else if (status === false) {
        status = 'false';
    } else {
        return { success: false, message: 'Invalid status value. Use "true" or "false".' };
    }

    for (const table of tables) {
        const [rows] = await db.execute(`SELECT * FROM ${table} WHERE merchant_txnid = ? AND userid = ?`, [merchantTXNID, userid]);

        if (rows.length > 0) {
            if (table === 'merchants_paytm') {
                const paytmPhone = rows[0].paytm_phone;
                // get all rows with same paytm_phone and userid
                const [paytmRows] = await db.execute(
                    `SELECT * FROM ${table} WHERE paytm_phone = ? AND userid = ?`,
                    [paytmPhone, userid]
                );

                for (const paytmRow of paytmRows) {
                    await db.execute(`UPDATE ${table} SET merchant_status = ? WHERE merchant_txnid = ? AND userid = ?`, [status, paytmRow.merchant_txnid, userid]);
                }
            } else {
                await db.execute(`UPDATE ${table} SET merchant_status = ? WHERE merchant_txnid = ? AND userid = ?`, [status, merchantTXNID, userid]);
            }

            return { success: true, message: `Merchant status updated successfully in ${table}.` };
        }
    }

    return { success: false, message: 'Merchant Transaction ID not found.' };
}

async function deleteMerchant(userid, merchantTXNID) {
    // Validate parameters before proceeding
    if (userid === undefined || merchantTXNID === undefined) {
        return { success: false, message: 'User ID and Merchant TXN ID are required.' };
    }

    // Delete merchant from all merchant tables
    const tables = [
        'merchants_bharatpe',
        'merchants_freecharge',
        'merchants_hdfc',
        'merchants_paytm',
        'merchants_phonepe',
        'merchants_quintuspay',
        'merchants_yono_sbi'
    ];

    try {
        for (const table of tables) {
            const [rows] = await db.execute(
                `SELECT * FROM ${table} WHERE merchant_txnid = ? AND userid = ?`,
                [merchantTXNID, userid]
            );

            if (rows.length > 0) {
                if (table === 'merchants_yono_sbi') {
                    await db.execute(
                        `UPDATE ${table} SET status = '0' WHERE merchant_txnid = ? AND userid = ?`,
                        [merchantTXNID, userid]
                    );
                } else if (table === 'merchants_paytm') {

                    const paytmPhone = rows[0].paytm_phone;

                    // get all rows with same paytm_phone and userid
                    const [paytmRows] = await db.execute(
                        `SELECT * FROM ${table} WHERE paytm_phone = ? AND userid = ?`,
                        [paytmPhone, userid]
                    );

                    for (const paytmRow of paytmRows) {
                        await db.execute(
                            `UPDATE ${table} SET status = '0' WHERE merchant_txnid = ? AND userid = ?`,
                            [paytmRow.merchant_txnid, userid]
                        );
                    }

                } else {
                    await db.execute(
                        `UPDATE ${table} SET status = 'inactive' WHERE merchant_txnid = ? AND userid = ?`,
                        [merchantTXNID, userid]
                    );
                }
                return { success: true, message: `Merchant deleted successfully from ${table}.` };
            }
        }

        return { success: false, message: 'Merchant Transaction ID not found.' };
    } catch (error) {
        console.error('Error in deleteMerchant:', error);
        return { success: false, message: 'Database error occurred.' };
    }
}

// Search Transactions Function
async function searchTransactions(userid, filters = {}) {
    try {
        // Validate userid
        if (!userid || userid === undefined) {
            return { success: false, message: 'User ID is required' };
        }


        // Destructure filters
        const {
            fromDate,
            toDate,
            status,
            amount,
            clientTxnId,
            note,
            customerMobile
        } = filters;

        // // from date and to date require if empty return empty list 
        // if ((!fromDate || fromDate === '') && (!toDate || toDate === '')) {
        //     return {
        //         success: true,
        //         message: 'No date range provided, returning empty result set',
        //         count: 0,
        //         data: []
        //     };
        // }
        // Build base query
        let query = 'SELECT * FROM `transactions` WHERE userid = ?';
        let params = [userid];

        // Add date range filter
        if (fromDate && toDate) {
            query += ' AND created_at BETWEEN ? AND ?';
            // Convert dates to MySQL format (YYYY-MM-DD HH:mm:ss)
            const from = new Date(fromDate);
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999); // Include entire end date
            params.push(from.toISOString().slice(0, 19).replace('T', ' '));
            params.push(to.toISOString().slice(0, 19).replace('T', ' '));
        } else if (fromDate) {
            query += ' AND created_at >= ?';
            const from = new Date(fromDate);
            params.push(from.toISOString().slice(0, 19).replace('T', ' '));
        } else if (toDate) {
            query += ' AND created_at <= ?';
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            params.push(to.toISOString().slice(0, 19).replace('T', ' '));
        }

        // Add status filter
        if (status && status !== '') {
            query += ' AND status = ?';
            params.push(status);
        }

        // Add amount filter (exact match or range)
        if (amount) {
            query += ' AND amount = ?';
            params.push(parseFloat(amount));
        }

        // Add client transaction ID filter
        if (clientTxnId && clientTxnId !== '') {
            query += ' AND client_txn_id = ?';
            params.push(clientTxnId);
        }

        // Add note filter (partial match)
        if (note && note !== '') {
            query += ' AND note LIKE ?';
            params.push(`%${note}%`);
        }

        // Add customer mobile filter (exact match)
        if (customerMobile && customerMobile !== '') {
            query += ' AND customer_mobile = ?';
            params.push(customerMobile);
        }

        // Add ordering
        query += ' ORDER BY created_at DESC';

        // Execute query
        const [rows] = await db.execute(query, params);

        // Return results
        if (rows.length > 0) {
            return {
                success: true,
                message: `Found ${rows.length} transaction(s)`,
                count: rows.length,
                data: rows
            };
        } else {
            return {
                success: true,
                message: 'No transactions found matching the criteria',
                count: 0,
                data: []
            };
        }

    } catch (error) {
        console.error('searchTransactions error:', error);
        return {
            success: false,
            message: 'Failed to search transactions',
            error: error.message
        };
    }
}

async function getAllPlans() {
    try {
        const [rows] = await db.execute('SELECT * FROM plans ORDER BY plan_type, price ASC');

        // Parse JSON features for each plan
        const plans = rows.map(plan => ({
            ...plan,
            features: typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features
        }));

        return plans;
    } catch (error) {
        console.error('getAllPlans error:', error);
        return [];
    }
}

async function getActivePlans(userid) {
    try {

        // Get only ONE active plan (oldest plan first)
        const [planRows] = await db.query(
            `SELECT * FROM users_plans 
     WHERE userid = ? AND plan_status IN ('active', 'expiring') AND status = 'active'
     ORDER BY created_at ASC
     LIMIT 1`,
            [userid]
        );

        if (planRows.length === 0) {
            return null; // No active plan found
        }

        const activePlan = planRows[0];
        return activePlan;
    }
    catch (error) {
        console.error('getActivePlans error:', error);
        return null;
    }
}


async function getPaymentDetailsByClientTxnId(clientTxnId, userid) {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM transactions WHERE client_txn_id = ? AND userid = ?',
            [clientTxnId, userid]
        );

        if (rows.length === 0) {
            return null; // No transaction found
        }

        return rows[0];
    } catch (error) {
        console.error('getPaymentDetailsByClientTxnId error:', error);
        return null;
    }
}

// Export functions
module.exports = {
    checkSessionFromAPI,
    loginUser,
    signupUser,
    verifyOTP,
    verifyResetPassword,
    checkOTPRequest,
    resendOTP,
    forgetPassword,
    getUserFromToken,
    getUPISetupData,
    getAllHistory,
    sendPaytmOTP,
    verifyPaytmOTP,
    loginSbiMerchant,
    sendPhonePeOTP,
    verifyPhonePeOTP,
    sendBharatpeOTP,
    verifyBharatpeOTP,
    sendFreechargeOTP,
    verifyFreechargeOTP,
    sendHDFCBankOTP,
    verifyHDFCBankOTP,
    selectHDFCBankTerminal,
    SendQuintusPayOTP,
    VerifyQuintusPayOTP,
    getMerchantsList,
    updateMerchantStatus,
    deleteMerchant,
    searchTransactions,
    getAllPlans,
    getPaymentHistory,
    transformPlans,
    getActivePlans,
    getPaymentDetailsByClientTxnId,
    getWalletHistory,
    getPlanStatus
};

