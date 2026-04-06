const express = require('express');
const router = express.Router();
const { getUserToken } = require('../helper/utils');
const { getUserFromToken } = require('../helper/functions');

// Middleware to check if user is admin
async function isAdmin(req, res, next) {
    try {
        const token = getUserToken(req);
        const data = await getUserFromToken(token);

        if (data && data.hasSession) {
            if (data.user && data.user.type === 'admin') {
                return next();
            }
        }
        return res.status(404).render('error', { message: 'Page Not Found', errorType: '404' });
    } catch (error) {
        console.error('Admin check error:', error);
        return res.status(404).render('error', { message: 'Page Not Found', errorType: '404' });
    }
}

// Example admin route
router.get('/dashboard', isAdmin, (req, res) => {
    res.render('admin/dashboard', { title: 'Admin Dashboard' });
});

router.get('/users', isAdmin, (req, res) => {
    // Logic to fetch and display users
    res.render('admin/users', { title: 'User Management' });
});

router.get('/transactions', isAdmin, (req, res) => {
    // Logic to fetch and display transactions
    res.render('admin/transactions', { title: 'Transaction Management' });
});


module.exports = router;