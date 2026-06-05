const express = require('express');
const router = express.Router();

const { checkSessionFromAPI, signupUser, verifyOTP, checkOTPRequest, loginUser, resendOTP, forgetPassword,
    verifyResetPassword } = require('../../helper/functions');
const { getUserToken } = require('../../helper/utils');
const csurf = require('csurf');
const csrfProtection = csurf({
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
    }
});

const getCookieOptions = (req) => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.get('x-forwarded-proto') === 'https'
});
// Check session
router.get('/check-session', async (req, res) => {
    const token = getUserToken(req);
    const sessionResult = await checkSessionFromAPI(token);
    res.json(sessionResult);
});

// Signup
router.post('/signup', csrfProtection, async (req, res) => {
    try {
        const { name, email, phone, password, referral } = req.body;
        const result = await signupUser(name, email, phone, password, referral);

        if (result.success) {
            // store requestId in cookie
            res.cookie('requestId', result.requestId, getCookieOptions(req));
            res.json({
                success: true,
                message: 'Signup successful. Please verify OTP.',
                redirectUrl: '/auth/verify'
            });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Verify OTP
router.post('/verify-otp', csrfProtection, async (req, res) => {
    try {
        const { otp } = req.body;
        const requestId = req.cookies.requestId;
        const result = await verifyOTP(requestId, otp, req);

        if (result.success) {
            // ✅ Store userToken in cookie
            res.cookie('userToken', result.userToken, {
                ...getCookieOptions(req),
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });
            res.json({
                success: true,
                message: 'OTP verified successfully.',
                redirectUrl: '/user/dashboard'
            });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Resend OTP
router.post('/resend-otp', csrfProtection, async (req, res) => {
    try {
        const requestId = req.cookies.requestId;
        const result = await resendOTP(requestId);

        if (result.success) {
            res.json({ success: true, message: 'OTP resent successfully.' });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Login
router.post('/login', csrfProtection, async (req, res) => {
    try {
        const { id, password } = req.body;
        const result = await loginUser(id, password, req);

        if (result.success) {
            if (result.userToken) {
                // ✅ Save token in cookie
                res.cookie('userToken', result.userToken, {
                    ...getCookieOptions(req),
                    maxAge: 7 * 24 * 60 * 60 * 1000
                });
                res.json({
                    success: true,
                    message: 'Login successful.',
                    redirectUrl: '/user/dashboard'
                });
            } else {
                res.cookie('requestId', result.requestId, getCookieOptions(req));
                res.json({
                    success: true,
                    message: 'Login requires OTP verification.',
                    redirectUrl: '/auth/verify'
                });
            }
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Forget Password
router.post('/forget-password', csrfProtection, async (req, res) => {
    try {
        const { id } = req.body;
        const result = await forgetPassword(id);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Forget Password error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Verify Reset Password
router.post('/verify-reset-password', csrfProtection, async (req, res) => {
    try {
        const { code, newPassword, confirmPassword, requestId } = req.body;

        // Check if newPassword and confirmPassword match
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'New password and confirm password do not match' });
        }

        // check if password is > 6 characters
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
        }

        const result = await verifyResetPassword(requestId, code, newPassword);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Verify Reset Password error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


module.exports = router;