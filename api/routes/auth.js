const express = require('express');
const router = express.Router();

const { checkSessionFromAPI, checkOTPRequest } = require('../helper/functions');

// Auth Loading Page
router.get('/', (req, res) => {
    res.render('loading');
});

// Login Page
router.get('/login', async (req, res) => {
    const token = req.cookies.userToken || null;
    const data = await checkSessionFromAPI(token);
    data.csrfToken = req.csrfToken();
    if (!data.hasSession) {
        res.render('auth/login', data);
    } else {
        res.redirect('/user/dashboard');
    }
});

// Signup Page
router.get('/signup', async (req, res) => {
    const token = req.cookies.userToken || null;
    const data = await checkSessionFromAPI(token);
    data.csrfToken = req.csrfToken();
    if (!data.hasSession) {
        res.render('auth/signup', data);
    } else {
        res.redirect('/user/dashboard');
    }
});

// OTP Verification Page
router.get('/verify', async (req, res) => {
    const token = req.cookies.userToken || null;
    const data = await checkSessionFromAPI(token);
    data.csrfToken = req.csrfToken();
    data.isVerify = checkOTPRequest(req.cookies.requestId) ? true : false;
    if (!data.hasSession) {
        res.render('auth/verify', data);
    } else {
        res.redirect('/user/dashboard');
    }
});

// Forget Page 
router.get('/forget', async (req, res) => {
    const data = {};
    data.csrfToken = req.csrfToken();
    res.render('auth/forget', data);
});

// Change password page 
router.get('/forget-password', async (req, res) => {
    const token = req.cookies.userToken || null;
    const data = await checkSessionFromAPI(token);
    data.csrfToken = req.csrfToken();
    data.isVerify = checkOTPRequest(req.cookies.requestId) ? true : false;
    if (!data.hasSession) {
        res.render('main/forget-pass', data);
    } else {
        res.redirect('/user/dashboard');
    }
});

// Logout
router.get('/logout', (req, res) => {
    res.clearCookie('userToken');
    res.clearCookie('requestId');
    res.redirect('/auth/login');
});

module.exports = router;