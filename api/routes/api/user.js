const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../../controllers/db'); // db connction mysql 
const { generateAadhaarCaptcha, generateAadhaarOTP, downloadAadhaar } = require('../../controllers/kyc/aadhaar');
const { createPayment, generateID } = require('../../helper/payment');
const { getUserFromToken, sendPaytmOTP, verifyPaytmOTP, loginSbiMerchant, sendPhonePeOTP, verifyPhonePeOTP, sendBharatpeOTP, verifyBharatpeOTP, sendFreechargeOTP, verifyFreechargeOTP, sendHDFCBankOTP, verifyHDFCBankOTP, selectHDFCBankTerminal, SendQuintusPayOTP, VerifyQuintusPayOTP, updateMerchantStatus, deleteMerchant, searchTransactions } = require('../../helper/functions');
const { getUserToken } = require('../../helper/utils');
const csurf = require('csurf');
const e = require('express');
const csrfProtection = csurf({
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false // set true in HTTPS
    }
});

// Validation helper functions
const isValidWhatsappNumber = (phone) => {
    // Check total length doesn't exceed 25 characters
    if (phone.length > 25) {
        return false;
    }

    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');

    // WhatsApp number must have country code + number
    // Minimum: +91 (country code) + 10 digits (mobile) = 13 digits
    // Maximum: +<country_code> + <number> = up to 15 digits typically
    if (cleaned.length < 12 || cleaned.length > 15) {
        return false;
    }

    // For Indian numbers: +91 + 10 digit number = 91<10digits>
    // Check if it starts with country code pattern (1-3 digits for country code)
    const countryCode = cleaned.substring(0, cleaned.length - 10);
    const numberPart = cleaned.substring(cleaned.length - 10);

    // Verify country code exists (at least 1 digit)
    if (countryCode.length < 1 || countryCode.length > 3) {
        return false;
    }

    // Verify last 10 digits are valid mobile number (starts with 6-9)
    if (!/^[6-9]/.test(numberPart)) {
        return false;
    }

    return true;
};

const isValidUrl = (urlString) => {
    try {
        const url = new URL(urlString);
        // Allow only http and https protocols
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
        return false;
    }
};

// Create uploads directory if it doesn't exist
const uploadsDir = path.join('../public/uploads/logos');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP)'), false);
    }
};

// Multer upload instance
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// UPI Setup API 
router.post('/merchant/upi/setup', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        // Process UPI setup data from req.body
        const { merchantId } = req.body;

        // Get merchants using merchant_id collom table name merchants 
        const [rows] = await db.query(
            'SELECT * FROM merchants WHERE merchant_id = ?',
            [merchantId]
        );

        if (!rows || rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Merchant not found'
            });
        }

        const merchant = rows[0];

        if (!merchant.field_ids) {
            return res.status(400).json({
                status: false,
                message: "Merchant or field_ids is missing"
            });
        }

        const requiredFields = merchant.field_ids.split(',');

        const ignoreFields = ["upi_merchant"];

        const filteredRequiredFields = requiredFields.filter(
            f => !ignoreFields.includes(f)
        );

        let missingFields = [];
        filteredRequiredFields.forEach(field => {
            if (!req.body[field] || req.body[field].trim() === '') {
                missingFields.push(field);
            }
        });

        if (missingFields.length > 0) {
            return res.status(400).json({
                status: false,
                missingFields
            });
        }


        if (merchant.merchant_id === 'paytm_business') {
            const response = await sendPaytmOTP(req.body.staff_mobile_no, req.body.password, data.user.userid);
            if (response.success) {

                const respo = {
                    success: true,
                    message: 'OTP sent successfully',
                    merchantId: merchantId,
                    message: `Sent to your mobile number ending in ${response.maskedPhone} and email ${response.maskedEmail}`
                }
                return res.status(200).json(respo);
            } else {
                const respo = {
                    success: false,
                    message: response.error || response.message
                }
                return res.status(500).json(respo);
            }
        } else if (merchant.merchant_id === 'yono_sbi') {
            const response = await loginSbiMerchant(req.body.mid, req.body.sub_password, data.user.userid);

            if (response.success) {
                const respo = {
                    success: true,
                    message: 'Login successful',
                    merchantId: merchantId,
                    message: 'Merchant login successful'
                }
                return res.status(200).json(respo);
            } else {
                const respo = {
                    success: false,
                    message: response.message
                }
                return res.status(500).json(respo);
            }
        } else if (merchant.merchant_id === 'phonepe_business') {
            const response = await sendPhonePeOTP(req.body.supervisor_mobile, data.user.userid);
            if (response.success) {
                res.cookie('merchantTXNID', response.merchantTXNID, { httpOnly: false, sameSite: 'lax' });
                const respo = {
                    success: true,
                    message: 'OTP sent successfully',
                    merchantId: merchantId,
                    message: `Sent to your registered PhonePe Business phone number`
                }
                return res.status(200).json(respo);
            } else {
                const respo = {
                    success: false,
                    message: response.message
                }
                return res.status(500).json(respo);
            }
        } else if (merchant.merchant_id === 'bharatpe_merchants') {

            const response = await sendBharatpeOTP(req.body.phone, data.user.userid);

            if (response.success) {
                const respo = {
                    success: true,
                    message: 'OTP sent successfully',
                    merchantId: merchantId,
                    message: `Sent to your registered BharatPe for Business phone number`
                }
                return res.status(200).json(respo);
            } else {
                const respo = {
                    success: false,
                    message: response.message
                }
                return res.status(500).json(respo);
            }
        } else if (merchant.merchant_id === 'freecharge') {
            const response = await sendFreechargeOTP(req.body.phone, data.user.userid);
            if (response.success) {
                return res.status(200).json(response);
            } else {
                return res.status(500).json(response);
            }
        } else if (merchant.merchant_id === 'hdfc_hub') {
            const response = await sendHDFCBankOTP(req.body.hdfc_staff_mobile_no, req.body.hdfc_staff_pin, data.user.userid);
            if (response.success) {
                return res.status(200).json(response);
            } else {
                return res.status(500).json(response);
            }
        } else if (merchant.merchant_id === 'quintuspay_business') {
            const { mobile_no } = req.body;
            const response = await SendQuintusPayOTP(data.user.userid, mobile_no);
            if (response.success) {
                return res.status(200).json(response);
            } else {
                return res.status(500).json(response);
            }

        } else {
            return res.status(400).json({
                success: false,
                message: 'Unsupported merchant for UPI setup'
            });
        }


    } else {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }
});



router.post('/merchant/upi/verify_otp', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const { merchantId, otp } = req.body;
        const [rows] = await db.query(
            'SELECT * FROM merchants WHERE merchant_id = ?',
            [merchantId]
        );

        if (!rows || rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Merchant not found'
            });
        }

        const merchant = rows[0];

        if (!merchant.field_ids) {
            return res.status(400).json({
                status: false,
                message: "Merchant or field_ids is missing"
            });
        }

        const requiredFields = merchant.field_ids.split(',');

        const ignoreFields = ["upi_merchant"];

        const filteredRequiredFields = requiredFields.filter(
            f => !ignoreFields.includes(f)
        );

        let missingFields = [];
        filteredRequiredFields.forEach(field => {
            if (!req.body[field] || req.body[field].trim() === '') {
                missingFields.push(field);
            }
        });

        if (missingFields.length > 0) {
            return res.status(400).json({
                status: false,
                missingFields
            });
        }


        if (merchant.merchant_id === 'paytm_business') {
            const response = await verifyPaytmOTP(req.body.staff_mobile_no, otp, data.user.userid);
            if (response.success) {
                return res.status(200).json(response);
            } else {
                return res.status(500).json(response);
            }
        } else if (merchant.merchant_id === 'phonepe_business') {
            const merchantTXNID = req.cookies.merchantTXNID;

            const response = await verifyPhonePeOTP(merchantTXNID, otp, data.user.userid);
            if (response.success) {
                return res.status(200).json(response);
            } else {
                return res.status(500).json(response);
            }
        } else if (merchant.merchant_id === 'bharatpe_merchants') {

            const response = await verifyBharatpeOTP(req.body.phone, otp, data.user.userid);
            if (response.success) {
                return res.status(200).json(response);
            } else {
                return res.status(500).json(response);
            }
        } else if (merchant.merchant_id === 'freecharge') {
            const response = await verifyFreechargeOTP(data.user.userid, req.body.phone, otp);
            if (response.success) {
                return res.status(200).json(response);
            } else {
                return res.status(500).json(response);
            }

        } else if (merchant.merchant_id === 'hdfc_hub') {
            const response = await verifyHDFCBankOTP(data.user.userid, req.body.hdfc_staff_mobile_no, otp);
            if (response.success) {
                return res.status(200).json(response);
            } else {
                return res.status(500).json(response);
            }

        } else if (merchant.merchant_id === 'quintuspay_business') {
            const { mobile_no } = req.body;
            const response = await VerifyQuintusPayOTP(data.user.userid, mobile_no, otp);
            if (response.success) {
                return res.status(200).json(response);
            } else {
                return res.status(500).json(response);
            }

        } else {
            return res.status(400).json({
                success: false,
                message: 'Unsupported merchant for UPI setup'
            });
        }


    } else {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }
});

router.post('/merchant/upi/select_store', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);
    if (data && data.hasSession) {
    } else {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }

    const { merchantId, storeId } = req.body;
    const [rows] = await db.query(
        'SELECT * FROM merchants WHERE merchant_id = ?',
        [merchantId]
    );

    if (!rows || rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'Merchant not found'
        });
    }

    const merchant = rows[0];

    if (merchant.merchant_id === 'hdfc_hub') {
        console.log('Selecting HDFC Bank SmartHub Vyapar Terminal for Store ID:', storeId);
        console.log('User ID:', data.user.userid, 'Phone:', data.user.phone);


        console.log('Merchant TXNID:', req.body.merchant_txnid);


        const response = await selectHDFCBankTerminal(data.user.userid, req.body.merchant_txnid, storeId);
        if (response.success) {
            return res.status(200).json(response);
        } else {
            return res.status(500).json(response);
        }
    } else {
        return res.status(400).json({
            success: false,
            message: 'Unsupported merchant for terminal selection'
        });
    }
});

router.post('/merchant/freecharge/save_upi_id', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (!data || !data.hasSession) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }

    const { merchantId, upiId, merchant_txnid } = req.body;
    const userid = data.user.userid;

    // Validate input
    if (!merchantId || !upiId || merchantId !== 'freecharge') {
        return res.status(400).json({
            success: false,
            message: 'Invalid request parameters'
        });
    }

    // Validate UPI ID format (must be @freecharge)
    const upiRegex = /^[a-zA-Z0-9._-]+@freecharge$/i;
    if (!upiRegex.test(upiId)) {
        return res.status(400).json({
            success: false,
            message: 'UPI ID must be in format: username@freecharge'
        });
    }

    try {
        // Update the merchants_freecharge record with VPA (UPI ID) and set status to active
        const [result] = await db.execute(
            `UPDATE merchants_freecharge SET vpa = ?, status = 'active' WHERE userid = ? AND merchant_txnid = ?`,
            [upiId, userid, merchant_txnid]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({
                success: false,
                message: 'Failed to find merchant record. Please try again.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'UPI ID saved successfully'
        });

    } catch (error) {
        console.error('Save UPI ID error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to save UPI ID. Please try again.'
        });
    }
});

router.post('/multi/merchant/status', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const { merchantTXNID, status, upiId } = req.body;
        const userid = data.user.userid;

        try {
            // If UPI ID is provided, update it first (for FreeCharge)
            if (upiId) {
                // Validate UPI ID format
                const upiRegex = /^[a-zA-Z0-9._-]+@freecharge$/i;
                if (!upiRegex.test(upiId)) {
                    return res.status(400).json({
                        success: false,
                        message: 'UPI ID must be in format: username@freecharge'
                    });
                }

                // Update UPI ID in database
                await db.execute(
                    `UPDATE merchants_freecharge SET vpa = ? WHERE userid = ? AND merchant_txnid = ?`,
                    [upiId, userid, merchantTXNID]
                );
            }

            // Update merchant status
            const response = await updateMerchantStatus(userid, merchantTXNID, status);
            if (response.success) {
                return res.status(200).json(response);
            } else {
                return res.status(500).json(response);
            }
        } catch (error) {
            console.error('Error updating merchant:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to update merchant'
            });
        }

    } else {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }
});

router.post('/multi/merchant/delete', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const { merchantTxnId } = req.body;
        const response = await deleteMerchant(data.user.userid, merchantTxnId);
        if (response.success) {
            return res.status(200).json(response);
        } else {
            return res.status(500).json(response);
        }

    } else {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }
});


router.post('/transactions/search', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const userid = data.user.userid;

        // Extract filter parameters from request body
        const filters = {
            fromDate: req.body.fromDate || null,
            toDate: req.body.toDate || null,
            status: req.body.status || null,
            amount: req.body.amount || null,
            clientTxnId: req.body.clientTxnId || null,
            customerMobile: req.body.customerMobile || null,
            note: req.body.note || null
        };

        // Call searchTransactions function
        const response = await searchTransactions(userid, filters);

        if (response.success) {
            return res.status(200).json(response);
        } else {
            return res.status(400).json(response);
        }

    } else {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }
});


router.post('/plan/buy', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);


    if (data && data.hasSession) {
        const { plan_id, quantity } = req.body;

        // get plan info from plans table plan_id collom
        const [rows] = await db.query(
            'SELECT * FROM plans WHERE plan_id = ?',
            [plan_id]
        );

        if (!rows || rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found'
            });
        }

        const plan = rows[0];

        const price = plan.price * (quantity || 1);
        // generate txnid 
        const client_txn_id = generateID();
        // Get the real client IP address (first in the list if x-forwarded-for is present)
        let ip = req.headers['x-forwarded-for'];
        if (ip) {
            ip = ip.split(',')[0].trim();
        } else {
            ip = req.connection.remoteAddress;
        }
        const response = await createPayment('2ZIfyXJkzoTcJkojn7GIRqRiibUlYyyPWLEo', price, client_txn_id, data.user.userid, plan.price, quantity, plan_id, '', data.user.phone, data.user.email, data.user.name, 0, ip, 'https://upiexpress.com/user/success?client_txn_id=' + client_txn_id, 'https://upiexpress.com/api/webhook', '', '');
        return res.status(200).json(response);
    } else {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }
});





router.post('/kyc/get_capture', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const captcha = await generateAadhaarCaptcha();
        return res.status(200).json(captcha);
    } else {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }
});

router.post('/kyc/generate_otp', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const { uidNumber, captchaTxnId, captchaValue, xRequestId } = req.body;


        const otpResponse = await generateAadhaarOTP(uidNumber, captchaTxnId, captchaValue, xRequestId, xRequestId);
        return res.status(200).json(otpResponse);
    } else {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }

});

router.post('/kyc/verify_otp', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const { uidNumber, otp, otpTxnId, transactionId, xRequestId } = req.body;

        // Download Aadhaar with OTP verification
        const downloadResponse = await downloadAadhaar(uidNumber, true, otp, otpTxnId, transactionId, xRequestId);

        if (downloadResponse.success) {
            // Store KYC verification details in database
            // You can add database logic here to mark user as KYC verified

            return res.status(200).json({
                success: true,
                message: 'KYC verification successful',
                data: downloadResponse.data
            });
        } else {
            return res.status(400).json({
                success: false,
                message: downloadResponse.error || 'Failed to verify OTP',
                response: downloadResponse.response
            });
        }
    } else {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }
});

router.post('/kyc/resend_otp', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const { uidNumber, captchaTxnId, captchaValue, xRequestId } = req.body;

        // Resend OTP with same captcha transaction ID
        const otpResponse = await generateAadhaarOTP(uidNumber, captchaTxnId, captchaValue, captchaTxnId, xRequestId);

        if (otpResponse.success) {
            return res.status(200).json({
                success: true,
                message: 'OTP resent successfully',
                data: otpResponse.data
            });
        } else {
            return res.status(400).json({
                success: false,
                message: otpResponse.error || 'Failed to resend OTP',
                response: otpResponse.response
            });
        }
    } else {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }

});

router.post('/settings/update', csrfProtection, upload.single('business_logo'), async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (!data || !data.hasSession) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }

    const userId = data.user.userid;
    const type = req.body.type || '';
    // / if type is reset_key
    if (type === 'reset_key') {
        // generate new api key 
        let newApiKey = null;
        newApiKey = generateID() + generateID();


        // update in users table 
        await db.query(
            'UPDATE users SET apikey = ? WHERE userid = ?',
            [newApiKey, data.user.userid]
        );

        return res.status(200).json({
            success: true,
            message: 'API settings updated successfully',
            apikey: newApiKey,
            webhookUrl: undefined
        });

    } else if (type === 'update_webhook') {
        const webhookUrl = req.body.webhookUrl;
        // update webhook url in users table 
        await db.query(
            'UPDATE users SET webhook = ? WHERE userid = ?',
            [webhookUrl, data.user.userid]
        );

        return res.status(200).json({
            success: true,
            message: 'API settings updated successfully',
            apikey: undefined,
            webhookUrl: webhookUrl
        });
    }
    // Profile update
    if (type === 'profile') {
        try {
            const { name, business_name, state, website_url, app_url, whatsapp_no } = req.body;

            let updateData = {};

            // Validate required fields
            if (!business_name || !state || !whatsapp_no) {
                return res.status(400).json({
                    status: false,
                    message: 'Business Name, State, and Whatsapp No. are required'
                });
            }

            // Validate WhatsApp number format
            if (!isValidWhatsappNumber(whatsapp_no)) {
                return res.status(400).json({
                    status: false,
                    message: 'Invalid WhatsApp number (e.g., +919876543210)'
                });
            }

            // Validate URLs if provided
            if (website_url && website_url.trim() !== '') {
                if (!isValidUrl(website_url)) {
                    return res.status(400).json({
                        status: false,
                        message: 'Invalid Website URL. Please enter a valid URL (e.g., https://example.com)'
                    });
                }
            }

            if (app_url && app_url.trim() !== '') {
                if (!isValidUrl(app_url)) {
                    return res.status(400).json({
                        status: false,
                        message: 'Invalid App URL. Please enter a valid URL (e.g., https://example.com)'
                    });
                }
            }

            updateData.name = name;
            updateData.business_name = business_name;
            updateData.state = state;
            updateData.website_url = website_url || '';
            updateData.app_url = app_url || '';
            updateData.whatsapp_no = whatsapp_no;

            // Handle file upload
            if (req.file) {
                updateData.business_logo = '/public/uploads/logos/' + req.file.filename;
            }

            // Build update query
            const updateFields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
            const updateValues = Object.values(updateData);
            updateValues.push(userId);

            // Database update
            await db.query(
                `UPDATE users SET ${updateFields} WHERE userid = ?`,
                updateValues
            );

            return res.status(200).json({
                status: true,
                message: 'Profile updated successfully',
                data: {
                    ...updateData,
                    business_logo: updateData.business_logo || null
                }
            });

        } catch (error) {
            console.error('Profile update error:', error);
            return res.status(500).json({
                status: false,
                message: 'Error updating profile: ' + error.message
            });
        }
    }

    // Password change
    else if (type === 'password') {
        try {


            const { current_password, new_password } = req.body;
            const crypto = require('crypto');
            const hashedPassword1 = crypto.createHash('sha256').update(current_password).digest('hex');
            if (!current_password || !new_password) {
                return res.status(400).json({
                    status: false,
                    message: 'Current and new password are required'
                });
            }

            // Get current password from database
            const [rows] = await db.query(
                'SELECT password FROM users WHERE userid = ?',
                [userId]
            );

            if (!rows || rows.length === 0) {
                return res.status(404).json({
                    status: false,
                    message: 'User not found'
                });
            }

            // Verify current password
            const isPasswordValid = (crypto.createHash('sha256').update(current_password).digest('hex') === rows[0].password);
            if (!isPasswordValid) {
                return res.status(400).json({
                    status: false,
                    message: 'Current password is incorrect'
                });
            }

            const hashedPassword = crypto.createHash('sha256').update(new_password).digest('hex');

            // Update password
            await db.query(
                'UPDATE users SET password = ? WHERE userid = ?',
                [hashedPassword, userId]
            );

            return res.status(200).json({
                status: true,
                message: 'Password changed successfully'
            });

        } catch (error) {
            console.error('Password update error:', error);
            return res.status(500).json({
                status: false,
                message: 'Error updating password: ' + error.message
            });
        }
    }

    else {
        return res.status(400).json({
            success: false,
            message: 'Invalid update type'
        });
    }
});

// Payment Settings API
router.post('/payment-settings', csrfProtection, upload.single('icon'), async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (!data || !data.hasSession) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }

    try {
        const userId = data.user.userid;
        const { upiIntent, settingName, themeColor } = req.body;

        let updateData = {};

        // Validate settings
        if (!settingName || settingName.trim() === '') {
            return res.status(400).json({
                status: false,
                message: 'Display Name is required'
            });
        }

        // Validate theme color format
        if (themeColor && !/^#[0-9A-F]{6}$/i.test(themeColor)) {
            return res.status(400).json({
                status: false,
                message: 'Invalid theme color format. Use #RRGGBB format'
            });
        }

        // Update UPI Intent (convert checkbox value to 0 or 1)
        // Handle both boolean true/false and string 'on' values
        updateData.isIntent = (upiIntent === true || upiIntent === 'true' || upiIntent === 'on') ? 1 : 0;

        // Update business name
        updateData.business_name = settingName.trim();

        // Update theme color (remove # if present)
        if (themeColor) {
            updateData.theme_color = themeColor.replace('#', '');
        }

        // Handle icon file upload
        if (req.file) {
            updateData.business_icon = '/public/uploads/logos/' + req.file.filename;
        }

        // Build update query
        const updateFields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
        const updateValues = Object.values(updateData);
        updateValues.push(userId);

        // Database update
        await db.query(
            `UPDATE users SET ${updateFields} WHERE userid = ?`,
            updateValues
        );

        return res.status(200).json({
            status: true,
            success: true,
            message: 'Payment settings updated successfully',
            data: {
                isIntent: updateData.isIntent,
                business_name: updateData.business_name,
                theme_color: updateData.theme_color,
                business_icon: updateData.business_icon || null
            }
        });

    } catch (error) {
        console.error('Payment settings update error:', error);
        return res.status(500).json({
            status: false,
            success: false,
            message: 'Error updating payment settings: ' + error.message
        });
    }
});


router.post('/wallet/deposit', csrfProtection, async (req, res) => {
    const token = getUserToken(req);
    const data = await getUserFromToken(token);

    if (data && data.hasSession) {
        const { amount } = req.body;

        // Validate amount
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount'
            });
        }

        const depositAmount = parseFloat(amount);
        // generate txnid 
        const client_txn_id = generateID();
        // Get the real client IP address (first in the list if x-forwarded-for is present)
        let ip = req.headers['x-forwarded-for'];
        if (ip) {
            ip = ip.split(',')[0].trim();
        } else {
            ip = req.connection.remoteAddress;
        }
        const response = await createPayment('2ZIfyXJkzoTcJkojn7GIRqRiibUlYyyPWLEo', depositAmount, client_txn_id, data.user.userid, depositAmount, 1, '', '', data.user.phone, data.user.email, data.user.name, 0, ip, 'https://upiexpress.com/user/wallet?client_txn_id=' + client_txn_id, 'https://upiexpress.com/api/wallet/webhook', '', 'Wallet Deposit');
        return res.status(200).json(response);
    } else {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized access'
        });
    }
});

router.get('/demo/payment_link', async (req, res) => {
    const response = await createPayment('xz7ZCscyXSIedG76dA87wRk9PegZ8WDhN1Jy', 1, generateID(), 'test', 1, 1, 1, '', 6367234758, 'ayanconsole@gmail.com', 'ayan', 0, '192.192.0.1', 'https://upiexpress.com/', 'https://upiexpress.com/', 'HDFCeb2be78b2963c14974fef9e9', 'Demo Payment Link');

    return res.redirect(response.data.payment_link);
});

module.exports = router;




// testing karna hai payment create 
if (require.main === module) {
    (async () => {
        try {
            // generate txnid 
            const client_txn_id = "asdsdsdd";
            // Get the real client IP address (first in the list if x-forwarded-for is present)

            const response = await createPayment('2ZIfyXJkzoTcJkojn7GIRqRiibUlYyyPWLEo', 1, client_txn_id, 1, 1, 1, 1, '', "8509517215", "ayanconsole@gmail.com", "ayan", 0, "ip", 'https://upiexpress.com/user/success?client_txn_id=' + client_txn_id, 'https://upiexpress.com/api/webhook', 'PH145b7bd844f8a301b7760b80', '');


            console.log(response);
        } catch (err) {
            console.error("Error creating payment link:", err);
        }
    })();
}
