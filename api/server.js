const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const path = require('path');  // ✅ Add this
const app = express();
const socketIo = require('socket.io');
const qr = require('qrcode');
const server = require('http').createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const axios = require('axios');

const { checkSessionFromAPI } = require('./helper/functions');
const { getUserToken } = require('./helper/utils');
const mainRoutes = require('./routes/main');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const payRoutes = require('./routes/payment');
const apiAuthRoutes = require('./routes/api/auth');
const setupPaymentSocket = require('./controllers/backend/socket');
const apiUserRoutes = require('./routes/api/user');
const { apiPaymentRoutes } = require('./routes/api/payment');
const { generateID } = require('./helper/payment');
const { sendActivePlanEmail } = require('./helper/emails');
const { generateSitemap, generateSitemapIndex, generateRobots } = require('./helper/sitemap');
const { reloginHFDFCSessionAll } = require('./controllers/jobs/session_hdfc');
const { checkAndExpireJobs } = require('./controllers/jobs/expiry_checker');
const db = require('./controllers/db');
require('./controllers/backend/queue');

// ==========================
// EJS setup
// ==========================
app.set('view engine', 'ejs');
app.set('views', './views');

// ==========================
// Middleware setup
// ==========================
app.set('trust proxy', 1);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

const publicDir = path.join(__dirname, '../public');
const uploadsAssetsDir = path.join(publicDir, 'uploads');
const imagesDir = path.join(__dirname, '../images');
const assetsImagesDir = path.join(__dirname, '../assets/images');
const othersDir = path.join(__dirname, '../others');
const socketIoClientPath = require.resolve('socket.io-client/dist/socket.io.js');

const uploadsProtection = (req, res, next) => {
    const normalizedPath = path.posix.normalize(req.path);

    if (normalizedPath.includes('..')) {
        return res.status(400).end();
    }

    const blockedExtensions = /\.(php|phtml|phar|cgi|sh|exe|pl|py|js|asp|aspx|jsp|bash|bin|cmd|msi|dll|shtml?)$/i;
    if (blockedExtensions.test(normalizedPath) || path.basename(normalizedPath).startsWith('.')) {
        return res.status(404).end();
    }

    next();
};

app.use('/uploads', uploadsProtection, express.static(uploadsAssetsDir, { dotfiles: 'deny', index: false }));
app.use('/images', express.static(imagesDir, { dotfiles: 'deny', index: false }));
app.use('/assets/images', express.static(assetsImagesDir, { dotfiles: 'deny', index: false }));
app.use('/others', express.static(othersDir, { dotfiles: 'deny', index: false }));
app.use(express.static(publicDir));

app.use((req, res, next) => {
    if (req.path.startsWith('/socket.io')) {
        console.log('PROXY SOCKET.IO REQUEST', req.method, req.originalUrl, req.path, req.url);
    }
    next();
});

app.get('/socket.io/socket.io.js', (req, res) => {
    res.sendFile(socketIoClientPath);
});

app.get('/qr', async (req, res) => {
    const text = req.query.text;
    if (!text) {
        return res.status(400).send('Missing QR text');
    }

    try {
        const svg = await qr.toString(text, { type: 'svg', margin: 1, width: 260 });
        res.type('image/svg+xml');
        res.send(svg);
    } catch (error) {
        console.error('QR generation failed:', error);
        res.status(500).send('QR generation failed');
    }
});

app.use('/admin/api/daily/plan/check', async (req, res, next) => {

});

app.use('/api/webhook', async (req, res, next) => {
    // Webhook does not require CSRF token
    const data = req.body.data;

    if (data.status === 'Success') {
        const orderid = data.orderid;

        // get transaction from database using orderid 
        const db = require('./controllers/db'); // db connection mysql 
        const [rows] = await db.query(
            'SELECT * FROM transactions WHERE orderid = ?',
            [orderid]
        );

        if (!rows || rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Transaction not found' });
        }

        const userid = rows[0].udf1;
        const planid = rows[0].udf4;
        const quantity = parseInt(rows[0].udf3) || 1;
        const amount = rows[0].udf2 * quantity;
        const price = rows[0].udf2;

        // ✅ CHECK FOR DUPLICATE WEBHOOK - Count existing users_plans with same orderid
        const [duplicateCheck] = await db.query(
            'SELECT COUNT(*) as count FROM users_plans WHERE orderid = ? AND userid = ?',
            [orderid, userid]
        );

        const existingQuantity = duplicateCheck[0].count;

        // ✅ If orderid already exists and has all quantity rows processed, reject duplicate
        if (existingQuantity > 0 && existingQuantity === quantity) {
            return res.status(200).json({
                success: false,
                message: 'Duplicate webhook received - Order already processed',
                type: 'DUPLICATE'
            });
        }

        // ✅ If partial processing exists (shouldn't happen), also reject
        if (existingQuantity > 0 && existingQuantity < quantity) {
            return res.status(200).json({
                success: false,
                message: 'Webhook already partially processed - Skipping to prevent duplication',
                type: 'PARTIAL_DUPLICATE'
            });
        }

        // get plans from plans table using plan_id column
        const [planRows] = await db.query(
            'SELECT * FROM plans WHERE plan_id = ?',
            [planid]
        );

        if (!planRows || planRows.length === 0) {
            return res.status(403).json({ success: false, message: 'Plan not found' });
        }

        const plan = planRows[0];
        const qr_code_requests_limit = plan.qr_code_requests_limit;

        const plan_name = plan.plan_name;
        const plan_cycle_days = plan.plan_cycle_days;
        const plan_type = plan.plan_type;

        const [userRows] = await db.query(
            'SELECT * FROM users WHERE userid = ?',
            [userid]
        );

        if (!userRows || userRows.length === 0) {
            return res.status(403).json({ success: false, message: 'User not found' });
        }

        const user = userRows[0];

        // Get the latest user plan based on created_at (not expire_at)
        const [lastPlanRows] = await db.query(
            'SELECT * FROM users_plans WHERE userid = ? ORDER BY created_at DESC LIMIT 1',
            [userid]
        );

        let currentStartDate = new Date();
        let currentExpiryDate = new Date();

        // If user has existing plans, start from the last plan's expiry
        if (lastPlanRows && lastPlanRows.length > 0) {
            currentExpiryDate = new Date(lastPlanRows[0].expire_at);
            currentStartDate = new Date(currentExpiryDate); // Start from last plan's expiry
        }

        // Process multiple plans based on quantity
        let firstPlanStartDate = null;
        let firstPlanExpiryDate = null;

        for (let i = 0; i < quantity; i++) {
            const txnid = generateID();

            // Calculate dates for this plan instance
            const startedAt = new Date(currentStartDate);
            let newExpireAt = new Date(currentStartDate);

            if (plan.plan_cycle_days) {
                newExpireAt.setDate(newExpireAt.getDate() + plan.plan_cycle_days);
            }

            // Store first plan dates for the message
            if (i === 0) {
                firstPlanStartDate = startedAt;
                firstPlanExpiryDate = newExpireAt;
            }

            // Status: First plan active, others inactive
            const status = (i === 0 && (!lastPlanRows || lastPlanRows.length === 0)) ? 'active' : 'inactive';

            // ✅ INSERT orderid and quantity in users_plans
            await db.query(
                'INSERT INTO users_plans (userid, plan_id, qr_code_requests_limit, txnid, expire_at, started_at, status, created_at, amount, orderid, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)',
                [userid, planid, qr_code_requests_limit, txnid, newExpireAt, startedAt, status, price, orderid, quantity]
            );

            // Update dates for next plan - next plan should start from this plan's expiry
            currentStartDate = new Date(newExpireAt);
            currentExpiryDate = new Date(newExpireAt);
        }

        // Format dates for the message
        const formatDate = (date) => {
            return date.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        };

        const message = `Dear ${user.name},

Your plan "${plan_name}" has been successfully activated on UPI Express.

📅 Validity: ${formatDate(firstPlanStartDate)} to ${formatDate(firstPlanExpiryDate)}
🔢 QR Request Limit: ${qr_code_requests_limit}
⚡ Features Enabled: Based on your plan

Thank you for choosing UPI Express!
Login now: https://upiexpress.com`;

        // Send message after processing plans
        await axios.post('http://localhost:5051/send', {
            phone: "91" + user.phone,
            message: message
        });

        sendActivePlanEmail(user.email, user.name, plan_name, formatDate(firstPlanStartDate), formatDate(firstPlanExpiryDate), qr_code_requests_limit);
        return res.status(200).json({ success: true, message: `Successfully processed ${quantity} plan(s)` });
    } else {
        res.status(300).json({ success: false });
    }
});

app.use('/api/wallet/webhook', async (req, res, next) => {
    // Webhook for wallet deposit
    const data = req.body.data;

    if (data.status === 'Success') {
        const orderid = data.orderid;

        // get transaction from database using orderid 
        const db = require('./controllers/db'); // db connection mysql 
        const [rows] = await db.query(
            'SELECT * FROM transactions WHERE orderid = ?',
            [orderid]
        );

        if (!rows || rows.length === 0) {
            return res.status(403).json({ success: false, message: 'Transaction not found' });
        }

        const userid = rows[0].udf1;
        const depositAmount = parseFloat(rows[0].udf2);

        // ✅ CHECK FOR DUPLICATE WEBHOOK - Count existing wallet deposits with same orderid
        const [duplicateCheck] = await db.query(
            'SELECT COUNT(*) as count FROM wallet_history WHERE orderid = ? AND userid = ?',
            [orderid, userid]
        );

        const existingDeposit = duplicateCheck[0].count;

        // ✅ If orderid already exists, reject duplicate
        if (existingDeposit > 0) {
            return res.status(200).json({
                success: false,
                message: 'Duplicate webhook received - Deposit already processed',
                type: 'DUPLICATE'
            });
        }

        const [userRows] = await db.query(
            'SELECT * FROM users WHERE userid = ?',
            [userid]
        );

        if (!userRows || userRows.length === 0) {
            return res.status(403).json({ success: false, message: 'User not found' });
        }

        const user = userRows[0];

        // ✅ INSERT wallet deposit record into wallet_history
        await db.query(
            'INSERT INTO wallet_history (userid, txid, orderid, amount, type, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [userid, rows[0].txn_id || generateID(), orderid, depositAmount, 'deposit', 'completed']
        );

        // ✅ UPDATE user wallet_balance and total_deposit
        await db.query(
            'UPDATE users SET wallet_balance = wallet_balance + ?, total_deposit = total_deposit + ? WHERE userid = ?',
            [depositAmount, depositAmount, userid]
        );

        const formatDate = (date) => {
            return new Date(date).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        };

        const message = `Dear ${user.name},

Your wallet deposit of ₹${depositAmount.toFixed(2)} has been successfully credited to your UPI Express account.

📅 Date: ${formatDate(new Date())}
💰 Amount: ₹${depositAmount.toFixed(2)}
📌 Status: Success

Thank you for using UPI Express!
Login now: https://upiexpress.com`;

        // Send message after processing deposit
        await axios.post('http://localhost:5051/send', {
            phone: "91" + user.phone,
            message: message
        });

        return res.status(200).json({ success: true, message: 'Wallet deposit processed successfully' });
    } else {
        res.status(300).json({ success: false });
    }
});

app.use('/api/create_order', async (req, res, next) => {

    // if request is POST
    if (req.method === 'POST') {
        const data = req.body;

        // Validate required fields key, amount, client_txn_id, customer_name, customer_email, customer_mobile, redirect_url
        const requiredFields = ['key', 'amount', 'client_txn_id', 'customer_name', 'customer_email', 'customer_mobile', 'redirect_url'];
        const missingFields = requiredFields.filter(f => {
            const val = data ? data[f] : undefined;
            return val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
        });

        if (missingFields.length > 0) {
            return res.status(400).json({ success: false, msg: 'Missing required fields', fields: missingFields }); // show which is missing
        }


        // Validate API key
        const [results] = await db.query('SELECT * FROM users WHERE apikey = ?', [data.key]);
        const user = results && results.length > 0 ? results[0] : null;

        if (!user) {
            return res.status(403).json({ success: false, msg: 'Invalid API Key' });
        }
        const { udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '' } = data;

        const convenience_fee = data.convenience_fee || 0;


        const { createPayment } = require('./helper/payment');

        let ip = req.headers['x-forwarded-for'];
        if (ip) {
            ip = ip.split(',')[0].trim();
        } else {
            ip = req.connection.remoteAddress;
        }

        // note limit 25 chars
        let note = data.note || '';
        if (note.length > 25) {
            return res.status(400).json({ success: false, msg: 'Note cannot exceed 25 characters' });
        }
        const paymentData = await createPayment(data.key, data.amount, data.client_txn_id, udf1, udf2, udf3, udf4, udf5, data.customer_mobile, data.customer_email, data.customer_name, convenience_fee, ip, data.redirect_url, data.webhook_url || user.webhook, data.merchantid || null, note);
        if (!paymentData.status) {
            return res.status(500).json({ success: false, msg: paymentData.message });
        }

        res.status(200).json({
            status: true, msg: 'Order created successfully', data: paymentData.data
        });
    } else {
        res.status(405).json({ success: false, msg: 'Method Not Allowed' });
    }

});

app.use('/api/check_order_status', async (req, res, next) => {

    // if request is POST
    if (req.method === 'POST') {
        const data = req.body;
        // Validate required fields key, client_txn_id
        const requiredFields = ['key', 'client_txn_id'];
        const missingFields = requiredFields.filter(f => {
            const val = data ? data[f] : undefined;
            return val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
        });

        if (missingFields.length > 0) {
            return res.status(400).json({ success: false, msg: 'Missing required fields', fields: missingFields }); // show which is missing
        }

        // Validate API key
        const [results] = await db.query('SELECT * FROM users WHERE apikey = ?', [data.key]);
        const user = results && results.length > 0 ? results[0] : null;

        if (!user) {
            return res.status(403).json({ success: false, msg: 'Invalid API Key' });
        }

        // Fetch order status from database
        const [statusData] = await db.query('SELECT * FROM transactions WHERE client_txn_id = ? AND userid = ?', [data.client_txn_id, user.userid]);

        if (!statusData || statusData.length === 0) {
            return res.status(404).json({ success: false, msg: 'Order not found' });
        }

        res.status(200).json({
            success: true,
            data: {
                orderid: statusData[0].orderid,
                client_txn_id: statusData[0].client_txn_id,
                txn_id: statusData[0].txn_id,
                status: statusData[0].status,
                amount: statusData[0].amount,
                convenience_fee: statusData[0].convenience_fee,
                total_amount: parseFloat(statusData[0].amount) + parseFloat(statusData[0].convenience_fee),
                created_at: statusData[0].created_at,
                expires_at: statusData[0].expires_at,
                merchant_txnid: statusData[0].merchant_txnid,
                webhook_statusCode: statusData[0].webhook_statusCode,
                webhook_status: statusData[0].webhook_status,
                customer_mobile: statusData[0].customer_mobile,
                customer_email: statusData[0].customer_email,
                customer_name: statusData[0].customer_name,
                note: statusData[0].note,
                udf1: statusData[0].udf1,
                udf2: statusData[0].udf2,
                udf3: statusData[0].udf3,
                udf4: statusData[0].udf4,
                udf5: statusData[0].udf5,
                redirect_url: statusData[0].redirect_url,
                webhook_url: statusData[0].webhook_url,
                upi_transaction_id: statusData[0].upi_transaction_id,
                extraData: statusData[0].merchant_data || []
            }
        });
    } else {
        res.status(405).json({ success: false, msg: 'Method Not Allowed' });
    }

});


// daily run at 2 time daily to relogin hdfc sessions
setInterval(() => {
    reloginHFDFCSessionAll();
}, 12 * 60 * 60 * 1000); // 12 hours interval

// daily run at 1 time daily to check and expire jobs
setInterval(() => {
    checkAndExpireJobs();
}, 24 * 60 * 60 * 1000); // 24 hours interval


// ✅ CSRF token setup using cookie-based method
const csrfProtection = csurf({
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false // set true in HTTPS
    }
});
app.use(csrfProtection);

// CSRF Token Middleware (for views)
app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});

// CSRF error handler
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            success: false,
            message: 'Invalid CSRF token'
        });
    }
    next(err);
});


// ==========================
// Main Routes
// ==========================

app.use('/', mainRoutes);

// ==========================
// Auth Routes
// ==========================

app.use('/auth', authRoutes);

// ==========================
// User Routes
// ==========================
app.use('/user', userRoutes);

app.use('/user/', async (req, res, next) => {
    const token = getUserToken(req);
    const data = await checkSessionFromAPI(token);
    if (data.hasSession) {
        res.redirect('/user/dashboard');
    } else {
        res.redirect('/auth/login');
    }
});

// =========================
// Admin Routes
// =========================
app.use('/admin', adminRoutes);


// ==========================
// Pay Routes
// ==========================
app.use('/payment', payRoutes);

// ==========================
// Backend APIs Routes
// ==========================
app.use('/api', apiAuthRoutes,);
app.use('/api/user', apiUserRoutes);



app.use('/api/payment', apiPaymentRoutes);
setupPaymentSocket(io);

// ==========================
// Additional Routes
// ==========================

// Sitemap Routes
app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml');
    res.send(generateSitemap());
});

app.get('/sitemap-index.xml', (req, res) => {
    res.type('application/xml');
    res.send(generateSitemapIndex());
});

app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(generateRobots());
});

//  Logout
app.get('/auth/logout', (req, res) => {
    res.clearCookie('userToken');
    res.clearCookie('requestId');
    res.redirect('/auth/login');
});

// Error Page When Route Not Found
app.use((req, res, next) => {
    res.status(404).render('error', { message: 'Page Not Found', errorType: '404' });
});


// ==========================
// Start server
// ==========================

server.listen(3012, () => console.log('Server running'));



