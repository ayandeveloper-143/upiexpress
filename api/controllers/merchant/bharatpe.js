const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const fs = require('fs-extra');
const path = require('path');

class BharatPeAPI {
    constructor() {
        this.baseUrl = 'https://enterprise.bharatpe.in';
        this.userAgent = 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
        this.cookieDir = path.join(__dirname, 'cookies');
        this.sessionDir = path.join(__dirname, 'sessions');

        // Ensure directories exist
        fs.ensureDirSync(this.cookieDir);
        fs.ensureDirSync(this.sessionDir);
    }

    // Get cookie file path for phone number
    getCookieFilePath(phoneNumber) {
        return path.join(this.cookieDir, `cookies_${phoneNumber}.json`);
    }

    // Get session file path for phone number
    getSessionFilePath(phoneNumber) {
        return path.join(this.sessionDir, `session_${phoneNumber}.json`);
    }

    // Create axios client with cookie jar for specific phone number
    async createClient(phoneNumber) {
        const cookieJar = new CookieJar();
        const cookieFile = this.getCookieFilePath(phoneNumber);

        // Load existing cookies if available
        if (await fs.pathExists(cookieFile)) {
            try {
                const cookies = await fs.readJson(cookieFile);
                // Properly load cookies into jar
                if (cookies && cookies.cookies) {
                    for (const cookie of cookies.cookies) {
                        await cookieJar.setCookie(
                            `${cookie.key}=${cookie.value}`,
                            this.baseUrl
                        );
                    }
                }
                //console.log('Cookies loaded for:', phoneNumber);
            } catch (error) {
                //console.log('No existing cookies found for:', phoneNumber);
            }
        }

        const client = wrapper(axios.create({
            jar: cookieJar,
            withCredentials: true,
            timeout: 10000, // Reduced timeout to 10 seconds
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 600;
            }
        }));

        return { client, cookieJar };
    }

    // Save cookies for phone number
    async saveCookies(phoneNumber, cookieJar) {
        try {
            const cookies = await cookieJar.serialize();
            await fs.writeJson(this.getCookieFilePath(phoneNumber), cookies);
            //console.log('Cookies saved for:', phoneNumber);
            return true;
        } catch (error) {
            console.error('Error saving cookies for', phoneNumber, error);
            return false;
        }
    }

    // Save session data (token and uuid) for phone number
    async saveSession(phoneNumber, sessionData) {
        try {
            await fs.writeJson(this.getSessionFilePath(phoneNumber), sessionData);
            //console.log('Session saved for:', phoneNumber);
            return true;
        } catch (error) {
            console.error('Error saving session for', phoneNumber, error);
            return false;
        }
    }

    // Load session data for phone number
    async loadSession(phoneNumber) {
        try {
            const sessionFile = this.getSessionFilePath(phoneNumber);
            if (await fs.pathExists(sessionFile)) {
                const sessionData = await fs.readJson(sessionFile);
                //console.log('Session loaded for:', phoneNumber);
                return sessionData;
            }
            return null;
        } catch (error) {
            console.error('Error loading session for', phoneNumber, error);
            return null;
        }
    }

    // Delete session data after verification
    async deleteSession(phoneNumber) {
        try {
            const sessionFile = this.getSessionFilePath(phoneNumber);
            if (await fs.pathExists(sessionFile)) {
                await fs.remove(sessionFile);
                //console.log('Session deleted for:', phoneNumber);
            }
            return true;
        } catch (error) {
            console.error('Error deleting session for', phoneNumber, error);
            return false;
        }
    }

    // Extract CSRF token from HTML using regex (without cheerio)
    extractToken(html) {
        const tokenMatch = html.match(/name="_token" value="([^"]*)"/);
        return tokenMatch ? tokenMatch[1] : null;
    }

    // Send OTP - Only phone number as input
    async sendOTP(phoneNumber) {
        let client, cookieJar;

        try {
            // Create client with cookies for this number
            //console.log('📡 Creating client for:', phoneNumber);
            const clientData = await this.createClient(phoneNumber);
            client = clientData.client;
            cookieJar = clientData.cookieJar;

            // Step 1: Get initial cookies and CSRF token
            //console.log('🔐 Getting initial cookies and token...');
            const initialResponse = await client.get(this.baseUrl + '/', {
                headers: {
                    'User-Agent': this.userAgent
                }
            });

            //console.log('✅ Initial page loaded, status:', initialResponse.status);
            const token = this.extractToken(initialResponse.data);

            if (!token) {
                //console.log('❌ CSRF token not found');
                return {
                    success: false,
                    error: 'CSRF token not found'
                };
            }

            //console.log('✅ CSRF token found:', token.substring(0, 10) + '...');

            // Save initial cookies
            await this.saveCookies(phoneNumber, cookieJar);

            // Step 2: Send OTP request
            //console.log('📤 Sending OTP request...');
            const postData = new URLSearchParams({
                'mobile': phoneNumber,
                '_token': token
            });

            const headers = {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': this.baseUrl,
                'priority': 'u=1, i',
                'referer': this.baseUrl + '/',
                'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': this.userAgent,
                'x-requested-with': 'XMLHttpRequest'
            };

            //console.log('🚀 Making POST request to OTP endpoint...');
            const otpResponse = await client.post(
                this.baseUrl + '/v1/api/user/requestotp',
                postData.toString(),
                {
                    headers,
                    timeout: 15000 // Specific timeout for OTP request
                }
            );

            //console.log('✅ OTP request completed, status:', otpResponse.status);

            // Save cookies after OTP request
            await this.saveCookies(phoneNumber, cookieJar);

            //console.log('📊 OTP Response Status:', otpResponse.status);
            //console.log('📦 OTP Response Data:', otpResponse.data);

            if (otpResponse.data && otpResponse.data.success) {
                const uuid = otpResponse.data.data.uuid;
                //console.log('✅ OTP sent successfully, UUID:', uuid);

                // Store UUID and token in session file for this phone number
                const sessionData = {
                    uuid: uuid,
                    token: token,
                    timestamp: Date.now()
                };

                await this.saveSession(phoneNumber, sessionData);

                return {
                    success: true,
                    data: {
                        uuid: uuid
                    },
                    message: 'OTP sent successfully'
                };
            } else {
                //console.log('❌ OTP send failed:', otpResponse.data);
                return {
                    success: false,
                    error: otpResponse.data ? (otpResponse.data.message || 'Failed to send OTP') : 'No response data'
                };
            }

        } catch (error) {
            console.error('💥 Error in sendOTP:', error.message);

            if (error.code) {
                console.error('Error code:', error.code);
            }

            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response headers:', error.response.headers);
                if (error.response.data) {
                    console.error('Response data:', error.response.data);
                }
                return {
                    success: false,
                    error: error.response.data || 'OTP request failed with status: ' + error.response.status
                };
            } else if (error.request) {
                console.error('No response received. Request details:', error.request);
                return {
                    success: false,
                    error: 'No response from server. Network issue or timeout.'
                };
            }

            return {
                success: false,
                error: 'OTP request failed: ' + error.message
            };
        }
    }

    // Verify OTP - Only phone number and OTP as input
    async verifyOTP(phoneNumber, otp) {
        let client, cookieJar;

        try {
            // Get stored UUID and token for this phone number from file
            const sessionData = await this.loadSession(phoneNumber);
            if (!sessionData || !sessionData.uuid || !sessionData.token) {
                return {
                    success: false,
                    error: 'No OTP session found. Please send OTP first.'
                };
            }

            const uuid = sessionData.uuid;
            const token = sessionData.token;

            // Create client with existing cookies for this number
            const clientData = await this.createClient(phoneNumber);
            client = clientData.client;
            cookieJar = clientData.cookieJar;

            // Get current cookies to use in headers
            const currentCookies = await cookieJar.getCookies(this.baseUrl);
            const cookieHeader = currentCookies.map(cookie => `${cookie.key}=${cookie.value}`).join('; ');

            //console.log('Using cookies:', cookieHeader);
            //console.log('Using UUID:', uuid);
            //console.log('Using token:', token.substring(0, 10) + '...');

            // Step 1: Verify OTP using stored token and cookies
            //console.log('Verifying OTP for:', phoneNumber);
            const postData = new URLSearchParams({
                'mobile': phoneNumber,
                'uuid': uuid,
                'otp': otp,
                '_token': token
            });

            const headers = {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': this.baseUrl,
                'priority': 'u=1, i',
                'referer': this.baseUrl + '/',
                'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
                'x-requested-with': 'XMLHttpRequest',
                'cookie': cookieHeader
            };

            //console.log('Sending verify OTP request...');
            const verifyResponse = await client.post(
                this.baseUrl + '/v1/api/user/verifyotp',
                postData.toString(),
                {
                    headers,
                    timeout: 15000
                }
            );

            //console.log('Verify OTP Response Status:', verifyResponse.status);
            //console.log('Verify OTP Response Data:', verifyResponse.data);

            if (verifyResponse.data && verifyResponse.data.success) {
                const access_token = verifyResponse.data.data.accessToken;

                // Step 2: Get profile details
                //console.log('Getting profile details...');
                const profileResponse = await client.get(
                    'https://api-merchant.bharatpe.in/merchant/v3/getmerchantinfo',
                    {
                        headers: {
                            'sec-ch-ua-platform': '"Windows"',
                            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
                            'accept': 'application/json, text/javascript, */*; q=0.01',
                            'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
                            'token': access_token,
                            'sec-ch-ua-mobile': '?0',
                            'origin': 'https://enterprise.bharatpe.in',
                            'sec-fetch-site': 'same-site',
                            'sec-fetch-mode': 'cors',
                            'sec-fetch-dest': 'empty',
                            'referer': 'https://enterprise.bharatpe.in/',
                            'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
                            'priority': 'u=1, i',
                            'cookie': cookieHeader
                        },
                        timeout: 15000
                    }
                );

                //console.log('Profile Response Status:', profileResponse.status);
                //console.log('Profile Response Data:', profileResponse.data);

                if (profileResponse.data && profileResponse.data.data) {
                    const merchantId = profileResponse.data.data.merchantId;

                    // Step 3: Get UPI ID
                    //console.log('Getting UPI ID...');
                    const upiId = await this.getUpiId(merchantId, access_token, client, cookieHeader);

                    // Save final cookies
                    await this.saveCookies(phoneNumber, cookieJar);

                    // Delete session data after successful verification
                    await this.deleteSession(phoneNumber);

                    return {
                        success: true,
                        access_token: access_token,
                        merchantId: merchantId,
                        upiId: upiId,
                        profile: profileResponse.data.data,
                        message: 'BharatPe verified successfully'
                    };
                } else {
                    return {
                        success: false,
                        error: 'Failed to get profile details'
                    };
                }
            } else {
                return {
                    success: false,
                    error: verifyResponse.data ? (verifyResponse.data.message || 'OTP verification failed') : 'No response data from OTP verification'
                };
            }

        } catch (error) {
            console.error('Error in verifyOTP:', error.message);

            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
                return {
                    success: false,
                    error: error.response.data || 'OTP verification failed'
                };
            }

            return {
                success: false,
                error: 'OTP verification failed: ' + error.message
            };
        }
    }

    // Get UPI ID from QR code
    async getUpiId(merchantId, access_token, client, cookieHeader = '') {
        try {
            //console.log('Getting UPI ID for merchant:', merchantId);
            const response = await client.get(
                `https://payments-tesseract.bharatpe.in/api/merchant/v1/downloadQr?merchantId=${merchantId}`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
                        'Token': access_token,
                        'cookie': cookieHeader
                    },
                    timeout: 15000
                }
            );

            // console.log('QR Code Response Status:', response.status);
            // console.log('QR Code Response Data:', response.data);

            const data = response.data;

            if (data && data.status && data.data && data.data.url) {
                const qrUrl = data.data.url;
                // console.log('QR Code URL:', qrUrl);

                // Use ZXing API to decode QR code
                const zxingResponse = await client.get(
                    `https://zxing.org/w/decode?u=${encodeURIComponent(qrUrl)}`,
                    { timeout: 15000 }
                );

                const upiMatch = zxingResponse.data.match(/upi:\/\/pay\?pa=([^&]+)/);
                if (upiMatch) {
                    const upiId = decodeURIComponent(upiMatch[1]);
                    // console.log('Found UPI ID:', upiId);
                    return upiId;
                } else {
                    // console.log('UPI ID not found in QR code');
                }
            } else {
                // console.log('QR code data not found in response');
            }

            return false;

        } catch (error) {
            console.error('UPI ID fetch failed:', error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            return false;
        }
    }
}

async function sendBharatpeOTP(phone) {

    const bharatPe = new BharatPeAPI();

    try {

        const sendResult = await bharatPe.sendOTP(phone);

        return sendResult;
    } catch (error) {
        console.error('❌ Error in sendBharatpeOTP:', error);
        return {
            success: false,
            error: 'Error sending OTP: ' + error.message
        };
    }
}

async function verifyBharatpeOTP(phone, otp) {


    const bharatPe = new BharatPeAPI();


    try {

        const sendResult = await bharatPe.verifyOTP(phone, otp);


        return sendResult;
    } catch (error) {
        console.error('❌ Error in sendBharatpeOTP:', error);
        return {
            success: false,
            error: 'Error sending OTP: ' + error.message
        };
    }
}


module.exports = {
    sendBharatpeOTP,
    BharatPeAPI,
    verifyBharatpeOTP
};