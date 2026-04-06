const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class FreeChargeService {
    constructor() {
        this.baseURL = 'https://www.freecharge.in';
        this.tokensAPI = 'https://upiexpress.com/others/t.php';
    }

    async getTokens() {
        try {
            const response = await axios.get(this.tokensAPI);

            if (response.data.status_code === 200) {
                return {
                    app_fc: response.data.app_fc,
                    csrfRequestIdentifier: response.data.csrfRequestIdentifier
                };
            } else {
                throw new Error('Failed to get tokens from API');
            }
        } catch (error) {

            console.error('Error getting tokens:', error.message);
            throw new Error('Failed to get required tokens');
        }
    }

    async sendOTP(phoneNumber) {
        try {
            const tokens = await this.getTokens();

            const url = `${this.baseURL}/api/ims/rest/otp/send/login/signup`;
            const transactionId = `txn${Math.floor(100000 + Math.random() * 900000)}`;

            const data = {
                mobileNumber: phoneNumber,
                transactionId: transactionId,
                platformType: "WEB",
                fcChannel: "12"
            };

            const headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": "https://www.freecharge.in",
                "Referer": "https://www.freecharge.in/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
                "Cookie": `moe_uuid=526d2b6d-ab4f-45b4-8d0d-b27d63d301ef; app_fc=${tokens.app_fc}`,
                "csrfRequestIdentifier": tokens.csrfRequestIdentifier
            };

            const response = await axios.post(url, data, { headers });
            // console.log('Send OTP Response:', response.data);

            if (response.data && response.data.data && response.data.data.otpId) {
                return {
                    success: true,
                    otpId: response.data.data.otpId,
                    transactionId: transactionId
                };
            } else {
                const errorMessage = response.data.error?.errorMessage || "Failed to send OTP";
                return {
                    success: false,
                    error: errorMessage
                };
            }
        } catch (error) {
            console.error('Send OTP Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.error?.errorMessage || 'Failed to send OTP'
            };
        }
    }

    async verifyOTP(otp, otpId) {
        try {
            const tokens = await this.getTokens();

            const url = `${this.baseURL}/api/ims/rest/mobileOnly/verify`;

            const data = {
                otpId: otpId,
                otp: otp,
                fcChannel: 12,
            };

            const headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": "https://www.freecharge.in",
                "Referer": "https://www.freecharge.in/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
                "Cookie": `moe_uuid=526d2b6d-ab4f-45b4-8d0d-b27d63d301ef; app_fc=${tokens.app_fc}`,
                "csrfRequestIdentifier": tokens.csrfRequestIdentifier
            };

            const response = await axios.post(url, data, { headers });


            if (response.data && response.data.data && response.data.data.fcWalletId) {
                const cookies = response.data.data.fcWalletToken;

                // Get VPA information
                // const vpaInfo = await this.getVPAInfo(cookies);

                return {
                    success: true,
                    fcWalletToken: cookies,
                    fcWalletId: response.data.data.fcWalletId,
                    vpa: ""
                };
            } else {
                const errorMessage = response.data.error.errorMessage || "OTP verification failed";
                return {
                    success: false,
                    error: errorMessage
                };
            }
        } catch (error) {
            console.error('Verify OTP Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.errorMessage || 'OTP verification failed'
            };
        }
    }

    async getVPAInfo(fcWalletToken) {
        try {
            const tokens = await this.getTokens();

            const url = `${this.baseURL}/rest/upi/v2/upistatus`;

            const data = {
                device: {
                    app: "",
                    id: ""
                }
            };

            const headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": "https://www.freecharge.in",
                "Referer": "https://www.freecharge.in/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
                "Cookie": `app_fc=${fcWalletToken}`,
                "csrfRequestIdentifier": tokens.csrfRequestIdentifier
            };

            const response = await axios.post(url, data, { headers });
            let primary_vpa = null;
            for (const vpaObj of response.data.data.vpas) {
                if (vpaObj.status === 'PRIMARY') {
                    primary_vpa = vpaObj.vpa;
                    break;
                }
            }

            return { data: response.data, primary_vpa: primary_vpa };
        } catch (error) {
            console.error('Get VPA Error:', error.message);
            return { data: response.data || null, primary_vpa: null };
        }
    }
    // Method 1: Using axios with advanced TLS fingerprinting
    async getWithAxiosAdvanced(app_fc) {
        try {
            const crypto = require('crypto');
            const https = require('https');
            const http = require('http');

            // Create custom axios instance with different TLS settings
            const customAxios = axios.create({
                timeout: 20000,
                httpAgent: new http.Agent({
                    keepAlive: true,
                    keepAliveMsecs: 10000,
                    timeout: 30000
                }),
                httpsAgent: new https.Agent({
                    keepAlive: true,
                    keepAliveMsecs: 10000,
                    secureProtocol: 'TLSv1_2_method',
                    ciphers: [
                        'TLS_AES_128_GCM_SHA256',
                        'TLS_AES_256_GCM_SHA384',
                        'TLS_CHACHA20_POLY1305_SHA256',
                        'ECDHE-RSA-AES128-GCM-SHA256',
                        'ECDHE-RSA-AES256-GCM-SHA384'
                    ].join(':'),
                    honorCipherOrder: false,
                    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT |
                        crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION
                }),
                maxRedirects: 0,
                decompress: true,
                validateStatus: null
            });

            const requestData = this.buildTransactionHistoryPayload();
            const response = await customAxios.post(
                `${this.baseURL}/thv/V2/listv3?fcAppType=MSITE`,
                requestData,
                {
                    headers: this.generateAdvancedHeaders(app_fc),
                    transformRequest: [(data, headers) => {
                        headers['X-Request-Timestamp'] = Date.now();
                        return JSON.stringify(data);
                    }]
                }
            );

            return response.data;
        } catch (error) {
            throw error;
        }
    }

    // Method 2: Using node-fetch (CommonJS version)
    async getWithNodeFetch(app_fc) {
        try {
            const fetch = require('node-fetch');

            const requestData = this.buildTransactionHistoryPayload();
            const response = await fetch(`${this.baseURL}/thv/V2/listv3?fcAppType=MSITE`, {
                method: 'POST',
                headers: this.generateAdvancedHeaders(app_fc),
                body: JSON.stringify(requestData),
                follow: 0,
                timeout: 15000,
                compress: true
            });

            return await response.json();
        } catch (error) {
            throw error;
        }
    }

    // Method 3: Using request-promise (legacy but effective)
    async getWithRequestPromise(app_fc) {
        try {
            const rp = require('request-promise');

            const requestData = this.buildTransactionHistoryPayload();
            const response = await rp({
                method: 'POST',
                uri: `${this.baseURL}/thv/V2/listv3?fcAppType=MSITE`,
                body: requestData,
                json: true,
                headers: this.generateAdvancedHeaders(app_fc),
                timeout: 15000,
                gzip: true,
                forever: true,
                pool: { maxSockets: Infinity }
            });

            return response;
        } catch (error) {
            throw error;
        }
    }

    // Method 4: Using needle (lightweight)
    async getWithNeedle(app_fc) {
        try {
            const needle = require('needle');

            const requestData = this.buildTransactionHistoryPayload();
            const response = await needle(
                'post',
                `${this.baseURL}/thv/V2/listv3?fcAppType=MSITE`,
                requestData,
                {
                    headers: this.generateAdvancedHeaders(app_fc),
                    json: true,
                    timeout: 15000,
                    compressed: true,
                    follow_max: 0,
                    user_agent: null
                }
            );

            return response.body;
        } catch (error) {
            throw error;
        }
    }

    // Method 5: Using simple http request (most basic)
    async getWithHttpRequest(app_fc) {
        const crypto = require('crypto');
        const https = require('https');

        return new Promise((resolve, reject) => {
            const requestData = this.buildTransactionHistoryPayload();
            const data = JSON.stringify(requestData);

            const options = {
                hostname: 'www.freecharge.in',
                port: 443,
                path: '/thv/V2/listv3?fcAppType=MSITE',
                method: 'POST',
                headers: {
                    ...this.generateAdvancedHeaders(app_fc),
                    'Content-Length': Buffer.byteLength(data)
                },
                agent: new https.Agent({
                    keepAlive: true,
                    rejectUnauthorized: false
                })
            };

            const req = https.request(options, (res) => {
                let body = '';

                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.setTimeout(15000);
            req.write(data);
            req.end();
        });
    }

    // Generate advanced headers for Akamai bypass
    generateAdvancedHeaders(app_fc) {
        const crypto = require('crypto');
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/131.0.0.0 Safari/537.36'
        ];

        const secCHUAs = [
            '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="24"',
            '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"'
        ];

        const platforms = ['"Windows"', '"macOS"', '"Linux"'];

        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        const randomSecCHUA = secCHUAs[Math.floor(Math.random() * secCHUAs.length)];
        const randomPlatform = platforms[Math.floor(Math.random() * platforms.length)];

        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Origin': 'https://www.freecharge.in',
            'Referer': 'https://www.freecharge.in/',
            'User-Agent': randomUserAgent,
            'Cookie': `app_fc=${app_fc}; moe_uuid=${this.generateUUID()}; _ga=GA1.1.${crypto.randomInt(1000000000, 9999999999)}.${Math.floor(Date.now() / 1000)}`,
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-CH-UA': randomSecCHUA,
            'Sec-CH-UA-Mobile': '?0',
            'Sec-CH-UA-Platform': randomPlatform,
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'X-Client-Version': '1.0.0',
            'X-Device-Id': this.generateUUID()
        };
    }

    buildTransactionHistoryPayload() {
        return {
            userImsId: "",
            isAndroid: false,
            fromDate: null,
            toDate: null,
            paymentStatus: "",
            paymentDirection: "",
            paymentAccountType: "",
            account: ""
        };
    }

    generateUUID() {
        const crypto = require('crypto');
        return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Main method that tries all libraries
    async getTransactionHistory(app_fc) {
        const methods = [
            { name: 'axios-advanced', fn: () => this.getWithAxiosAdvanced(app_fc) },
            { name: 'node-fetch', fn: () => this.getWithNodeFetch(app_fc) },
            { name: 'needle', fn: () => this.getWithNeedle(app_fc) },
            { name: 'http-request', fn: () => this.getWithHttpRequest(app_fc) }
        ];

        // Add request-promise if available
        try {
            require('request-promise');
            methods.splice(2, 0, { name: 'request-promise', fn: () => this.getWithRequestPromise(app_fc) });
        } catch (e) {
            //console.log('request-promise not available, skipping');
        }

        for (let attempt = 0; attempt < methods.length; attempt++) {
            try {
                //console.log(`Trying method: ${methods[attempt].name}`);

                const result = await methods[attempt].fn();

                if (result && result.data && result.data.globalTransactions) {
                    return {
                        success: true,
                        method: methods[attempt].name,
                        transactions: result.data.globalTransactions,
                        count: result.data.globalTransactions.length
                    };
                }

                if (result && result.data) {
                    //console.log(`Method ${methods[attempt].name} worked but no transactions found`);
                }

            } catch (error) {
                //console.log(`Method ${methods[attempt].name} failed: ${error.message}`);

                if (attempt < methods.length - 1) {
                    await this.delay(1000);
                }
            }
        }

        return {
            success: false,
            error: "All methods failed to fetch transaction history"
        };
    }
}



async function sendOTP(phoneNumber) {
    try {
        const freechargeService = new FreeChargeService();
        return await freechargeService.sendOTP(phoneNumber);
    } catch (error) {
        console.error('Send OTP Error:', error.message);
        throw error;
    }
}

async function verifyOTP(otp, otpId) {
    try {
        const freechargeService = new FreeChargeService();
        return await freechargeService.verifyOTP(otp, otpId);
    } catch (error) {
        console.error('Verify OTP Error:', error.message);
        throw error;
    }
}

async function getTransactionHistory(app_fc) {
    try {
        const freechargeService = new FreeChargeService();
        return await freechargeService.getTransactionHistory(app_fc);
    } catch (error) {
        console.error('Get Transaction History Error:', error.message);
        throw error;
    }
}

async function getVPAInfo(fcWalletToken) {
    try {
        const freechargeService = new FreeChargeService();
        return await freechargeService.getVPAInfo(fcWalletToken);
    } catch (error) {
        console.error('Get VPA Info Error:', error.message);
        throw error;
    }
}

// Export functions

module.exports = { FreeChargeService, sendOTP, verifyOTP, getTransactionHistory, getVPAInfo };

