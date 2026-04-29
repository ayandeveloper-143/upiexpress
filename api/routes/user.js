const express = require('express');
const router = express.Router();
const { getUserFromToken, getUPISetupData, getMerchantsList, getAllHistory, getAllPlans, getPaymentHistory, getActivePlans, getPaymentDetailsByClientTxnId, getWalletHistory, getPlanStatus } = require('../helper/functions');
const { getUserToken } = require('../helper/utils');
const { stat } = require('fs-extra');


// Dashboard Page
router.get('/dashboard', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);



    if (data && data.hasSession) {
        const userHistory = await getAllHistory(data.user.userid);
        const planStatus = await getPlanStatus(data.user.userid);
        let isPlanData = {};
        if (planStatus.hasPlan) {
            if (planStatus.plan_status === 'active') {
                isPlanData = {
                    status: false,
                };
            } else {
                isPlanData = {
                    status: true,
                    title: planStatus.plan_status !== 'active' && planStatus.plan_status === 'expired' ? 'Your plan has expired' : 'Your current plan is expiring soon!',
                    message: planStatus.plan_status !== 'active' && planStatus.plan_status === 'expired' ? 'Please renew your plan to continue using our services without interruption.' : 'Renew your plan to continue enjoying uninterrupted services and exclusive features.',
                    buttonText: planStatus.plan_status !== 'active' && planStatus.plan_status === 'expired' ? 'Renew Plan' : 'View Plans',
                    image: planStatus.plan_status !== 'active' && planStatus.plan_status === 'expired' ? '/images/warning.png' : '/images/warning.png',
                    buttonLink: planStatus.plan_status !== 'active' && planStatus.plan_status === 'expired' ? '/user/plan_list' : '/user/plan_list',
                };
            }

        } else {
            isPlanData = {
                status: false,
                title: 'No Active Plan',
                message: 'You currently do not have an active plan. Please choose a plan to start using our services.',
                buttonText: 'View Plans',
                image: '/images/no_plan.png',
                buttonLink: '/user/plan_list',
            };
        }

        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || ''
        }

        const plan = await getActivePlans(data.user.userid);

        let planDetails = []
        if (plan === null) {
            planDetails = {
                planExpireOn: 'No Active Plan',
                totalTxn: 4999,
                usedTxn: 0,
            }
        } else {
            planDetails = {
                planExpireOn: (() => {
                    const date = new Date(plan.expire_at);
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    return `${day}-${month}-${year}`;
                })(),
                totalTxn: plan.qr_code_requests_limit,
                usedTxn: plan.qr_code_requests_used,
            }
        }


        const todayReceiveAmount = userHistory.filter(txn => {
            const txnDate = new Date(txn.created_at);
            const today = new Date();
            return txnDate.toDateString() === today.toDateString() && txn.status === 'Success';
        }).reduce((sum, txn) => sum + parseFloat(txn.amount) + parseFloat(txn.convenience_fee || 0), 0);

        const todayFailedTransaction = userHistory.filter(txn => {
            const txnDate = new Date(txn.created_at);
            const today = new Date();
            return txnDate.toDateString() === today.toDateString() && txn.status === 'Failed';
        }).length + userHistory.filter(txn => {
            const txnDate = new Date(txn.created_at);
            const today = new Date();
            return txnDate.toDateString() === today.toDateString() && txn.status === 'Cancel';
        }).length + userHistory.filter(txn => {
            const txnDate = new Date(txn.created_at);
            const today = new Date();
            return txnDate.toDateString() === today.toDateString() && txn.status === 'Expired';
        }).length;

        const todaySuccessTransaction = userHistory.filter(txn => {
            const txnDate = new Date(txn.created_at);
            const today = new Date();
            return txnDate.toDateString() === today.toDateString() && txn.status === 'Success';
        }).length;

        // Last 10 days statistics with proper date handling
        const last10Statistics = Array.from({ length: 10 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - i); // Current day minus i days
            date.setHours(0, 0, 0, 0); // Set to start of day

            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1); // Next day for range

            const totalAmount = userHistory.filter(txn => {
                const txnDate = new Date(txn.created_at);
                return txnDate >= date && txnDate < nextDay && txn.status === 'Success';
            }).reduce((sum, txn) => sum + parseFloat(txn.amount), 0);

            return totalAmount;
        }).reverse(); // Reverse to get chronological order


        const categories = Array.from({ length: 10 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (9 - i));

            const day = String(date.getDate()).padStart(2, '0');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = monthNames[date.getMonth()];


            return `${day} ${month}`; // DD MMM  format
        });

        const today = new Date();
        const todayStart = new Date(today.setHours(0, 0, 0, 0));
        const todayEnd = new Date(today.setHours(23, 59, 59, 999));

        // Filter today's transactions
        const recentTransactions = userHistory.filter(txn => {
            const txnDate = new Date(txn.created_at);
            return txnDate >= todayStart && txnDate <= todayEnd;
        }).map(txn => ({
            customer_phone: txn.customer_mobile || 'N/A',
            txn_id: txn.client_txn_id,
            amount: parseFloat(txn.amount || 0),
            status: txn.status,
            webhook_status: txn.webhook_status,
            convenience_fee: parseFloat(txn.convenience_fee || 0),
            total: parseFloat((parseFloat(txn.amount || 0) + parseFloat(txn.convenience_fee || 0)).toFixed(2)),
            date: new Date(txn.created_at).toLocaleString('en-IN')
        }));


        const stats = {
            todayReceiveAmount: todayReceiveAmount,
            todayFailedTransaction: todayFailedTransaction,
            todaySuccessTransaction: todaySuccessTransaction,
            usedTxn: planDetails.usedTxn,
            totalTxn: planDetails.totalTxn,
            usedPercent: [planDetails.usedTxn / planDetails.totalTxn * 100], // Percentage array
            planExpireOn: planDetails.planExpireOn ? planDetails.planExpireOn : 'No Active Plan',
            last10Statistics: last10Statistics,
            categories: categories,
            recentTransactions: recentTransactions
        }

        res.render('user/dashboard', {
            csrfToken: req.csrfToken(),
            user: user,
            data: stats,
            isPlanData: isPlanData,
        });
    } else {
        res.redirect('/auth/login');
    }
});

router.get('/merchant/setup_upi', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);


    if (data && data.hasSession) {
        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || ''
        }
        const upiSetupData = await getUPISetupData(data.user.id);
        res.render('user/merchant/setup_upi', {
            csrfToken: req.csrfToken(),
            upiSetupData: upiSetupData,
            user: user,
        });

    } else {
        res.redirect('/auth/login');
    }
});

router.get('/merchant/multi_merchant', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const merchantsList = await getMerchantsList(data.user.userid);
        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || ''
        }
        res.render('user/merchant/multi_merchant', {
            csrfToken: req.csrfToken(),
            user: user,
            merchants: merchantsList,
        });

    } else {
        res.redirect('/auth/login');
    }
});

router.get('/txn_report', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);


    if (data && data.hasSession) {
        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || ''
        }
        res.render('user/txn_report', {
            csrfToken: req.csrfToken(),
            user: user,
        });

    } else {
        res.redirect('/auth/login');
    }
});

router.get('/payment/plan_list', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);
    const plansData = await getAllPlans();

    if (data && data.hasSession) {
        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || ''
        }
        res.render('user/payment/plan_list', {
            csrfToken: req.csrfToken(),
            user: user,
            plansData: plansData,
        });

    } else {
        res.redirect('/auth/login');
    }
});


router.get('/settings/payment_settings', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);
    if (data && data.hasSession) {
        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || '',
            isIntent: data.user.isIntent === 1 || false,
            business_name: data.user.business_name || '',
            business_icon: data.user.business_icon || '',
            theme_color: data.user.theme_color || '',
        }
        res.render('user/settings/payment_settings', {
            csrfToken: req.csrfToken(),
            user: user,
        });

    } else {
        res.redirect('/auth/login');
    }
});

router.get('/active_subs', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);
    const paymentHistory = data && data.hasSession ? await getPaymentHistory(data.user.userid) : [];



    function convertSubscriptionFormat(originalData) {
        return originalData.map(item => {
            // Format dates to YYYY-MM-DD
            const formatDate = (dateString) => {
                const date = new Date(dateString);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const planNameMap = {
                'startup_monthly': 'Startup',
                'startup_quarterly': 'Startup',
                'starter_monthly': 'Starter',
                'starter_quarterly': 'Starter',
                'enterprise_monthly': 'Enterprise',
                'enterprise_quarterly': 'Enterprise',
                'business_monthly': 'Business',
                'business_quarterly': 'Business'
            };

            // dont include status suspend 

            if (item.status === 'suspend') {
                return null; // Skip this item
            }

            return {
                plan_id: planNameMap[item.plan_id] || item.plan_id,
                created_at: formatDate(item.created_at),
                started_at: formatDate(item.started_at),
                qr_code_requests_limit: item.qr_code_requests_limit,
                qr_code_requests_used: item.qr_code_requests_used,
                expire_at: formatDate(item.expire_at),
                status: item.status,
                plan_status: item.plan_status
            };
        }).filter(item => item !== null);
    }

    const formattedData = convertSubscriptionFormat(paymentHistory);
    if (data && data.hasSession) {

        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || ''
        }
        res.render('user/active_subs', {
            csrfToken: req.csrfToken(),
            user: user,
            planData: formattedData,
        });

    } else {
        res.redirect('/auth/login');
    }
});


router.get('/payment_report', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);
    const paymentHistory = data && data.hasSession ? await getPaymentHistory(data.user.userid) : [];



    const jsonData = paymentHistory.map(sub => {
        // Format date from created_at (e.g., "30-11-2025 6:01 PM")
        const date = new Date(sub.created_at);
        const formattedDate = `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()} ${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')} ${date.getHours() >= 12 ? 'PM' : 'AM'}`;

        // Determine status based on subscription status
        const status = "Success"; // or whatever mapping makes sense

        // Map plan_id to a more readable name
        const planNameMap = {
            'startup_monthly': 'Startup',
            'startup_quarterly': 'Startup',
            'starter_monthly': 'Starter',
            'starter_quarterly': 'Starter',
            'enterprise_monthly': 'Enterprise',
            'enterprise_quarterly': 'Enterprise',
            'business_monthly': 'Business',
            'business_quarterly': 'Business'
        };

        return {
            plan_name: planNameMap[sub.plan_id] || sub.plan_id,
            gateway_txn_id: sub.txnid,
            txn_id: sub.txnid,
            amount: sub.amount,
            status: status,
            date: formattedDate
        };
    });

    // If you want to sort by date (newest first)
    jsonData.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (data && data.hasSession) {
        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || ''
        }
        res.render('user/payment_report', {
            csrfToken: req.csrfToken(),
            user: user,
            historyData: jsonData,
        });

    } else {
        res.redirect('/auth/login');
    }
});


router.get('/api_credentials', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || '',
            webhook: data.user.webhook || '',
            apikey: data.user.apikey || ''
        }
        res.render('user/settings/apis', {
            csrfToken: req.csrfToken(),
            user: user,
        });

    } else {
        res.redirect('/auth/login');
    }
});


router.get('/doc', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || ''
        }
        res.render('user/settings/doc', {
            csrfToken: req.csrfToken(),
            user: user,
        });

    } else {
        res.redirect('/auth/login');
    }
});


router.get('/plugins', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || ''
        }
        res.render('user/plugins', {
            csrfToken: req.csrfToken(),
            user: user,
        });

    } else {
        res.redirect('/auth/login');
    }
});

router.get('/profile', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || '',
            phone: data.user.phone || '',
            business_logo: data.user.business_logo || '',
            business_name: data.user.business_name || '',
            state: data.user.state || '',
            website_url: data.user.website_url || '',
            app_url: data.user.app_url || '',
            whatsapp_no: data.user.whatsapp_no || '',

        }
        res.render('user/profile', {
            csrfToken: req.csrfToken(),
            user: user,
        });

    } else {
        res.redirect('/auth/login');
    }
});

router.get('/how_its_works', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);
    if (data && data.hasSession) {
        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || ''
        }
        res.render('user/how_its_works', {
            csrfToken: req.csrfToken(),
            user: user,
        });

    } else {
        res.redirect('/auth/login');
    }
});


router.get('/wallet', async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);
    if (data && data.hasSession) {
        const history = await getWalletHistory(data.user.userid);
        const user = {
            name: data.user.name || '',
            user_iconLetter: data.user.name ? data.user.name.charAt(0) : '',
            email: data.user.email || '',
            wallet_balance: data.user.wallet_balance || 0,
            total_spent: data.user.total_spent || 0,
            total_deposit: data.user.total_deposit || 0,
        }
        res.render('user/wallet', {
            csrfToken: req.csrfToken(),
            user: user,
            history: history,
        });

    } else {
        res.redirect('/auth/login');
    }
});


router.get('/success', async (req, res) => {
    const { client_txn_id } = req.query;
    const token = getUserToken(req);
    const data = await getUserFromToken(token);
    if (data && data.hasSession) {

        if (!client_txn_id) {
            return res.redirect('/user/dashboard');
        }
        const transaction = await getPaymentDetailsByClientTxnId(client_txn_id, 'Uaa60f193605538e8597a4abf58f3e898594a4ff46ee74de8');

        if (!transaction || transaction.status !== 'Success') {
            return res.redirect('/user/dashboard');
        }

        res.render('payment/success', {
            amount: transaction.amount,
            txnid: transaction.orderid,
            date: new Date(transaction.created_at).toLocaleString('en-IN'),
        });

    } else {
        res.redirect('/auth/login');
    }
});

module.exports = router;

