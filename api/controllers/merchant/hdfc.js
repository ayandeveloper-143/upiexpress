const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const { json } = require('stream/consumers');
const { type } = require('os');

class HDFCOneAppAuth {
    constructor() {
        this.publicKey = null;
        this.publicKeyFile = 'public.key';
        this.publicKeyUrl = "https://hdfcmmp.mintoak.com/OneAppAuth/getKey";
        this.initialized = false;
    }

    // Add initialization method
    async initialize() {
        if (!this.initialized) {
            await this.loadOrUpdatePublicKey();
            this.initialized = true;
        }
        return this;
    }

    // Update all methods to ensure initialization
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    // Function to generate random string
    randomString(length) {
        const chars = 'abcdef0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Load or update public key
    async loadOrUpdatePublicKey() {
        try {
            // Try to load existing public key
            if (fs.existsSync(this.publicKeyFile)) {
                this.publicKey = fs.readFileSync(this.publicKeyFile, 'utf8').trim();
                //console.log('Public key loaded from file');
            } else {
                await this.updatePublicKey();
            }
        } catch (error) {
            console.error('Error loading public key:', error);
            await this.updatePublicKey();
        }
    }

    // Update public key from server
    async updatePublicKey() {
        try {
            const response = await axios.get(this.publicKeyUrl);
            //console.log(response.data);
            const newPublicKey = `-----BEGIN PUBLIC KEY-----\n${response.data}\n-----END PUBLIC KEY-----`;

            if (!this.publicKey || this.publicKey !== newPublicKey) {
                this.publicKey = newPublicKey;
                fs.writeFileSync(this.publicKeyFile, newPublicKey);
                //console.log('Public key updated successfully');
            }
        } catch (error) {
            console.error('Error updating public key:', error.message);
            throw error;
        }
    }

    // RSA PKCS1 encryption
    rsaPkcs1(data) {
        if (!this.publicKey) {
            throw new Error('Public key not available');
        }

        const encrypted = crypto.publicEncrypt(
            {
                key: this.publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
            },
            data
        );

        return encrypted.toString('base64');
    }

    // AES-GCM encryption
    encrypt(data, key, iv) {
        try {
            const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);

            let encrypted = cipher.update(data, 'utf8', 'binary');
            encrypted += cipher.final('binary');

            const authTag = cipher.getAuthTag();

            // Combine encrypted binary string with auth tag
            const encryptedBuffer = Buffer.from(encrypted, 'binary');
            const combined = Buffer.concat([encryptedBuffer, authTag]);

            return combined.toString('base64');
        } catch (error) {
            console.error('Encryption error:', error);
            throw error;
        }
    }

    // AES-GCM decryption
    decrypt(encryptedData, key, iv) {
        try {
            // Convert base64 to buffer
            const data = Buffer.from(encryptedData, 'base64');

            if (data.length < 16) {
                console.error('Encrypted data too short');
                return false;
            }

            // Extract auth tag (last 16 bytes) and encrypted data
            const authTag = data.subarray(data.length - 16);
            const encrypted = data.subarray(0, data.length - 16);

            const decipher = crypto.createDecipheriv('aes-128-gcm', key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted, 'binary', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error.message);
            return false;
        }
    }

    // Main function to send OTP - CORRECTED
    async sendOTP(phoneNumber) {
        try {
            await this.ensureInitialized();
            // Ensure public key is available
            if (!this.publicKey) {
                await this.loadOrUpdatePublicKey();
            }

            // Generate new AES key and IV for each request
            const aeskey = crypto.randomBytes(16);
            const aesiv = crypto.randomBytes(16);

            // Generate device ID
            const deviceId = this.randomString(16);

            // Prepare payload
            const payload = {
                loginId: phoneNumber.toString(),
                appVersion: "7.2.0",
                devicePlatform: "android"
            };

            //console.log('Payload:', JSON.stringify(payload));

            // Encrypt payload
            const encryptedPayload = this.encrypt(JSON.stringify(payload), aeskey, aesiv);

            // Encrypt AES key with RSA
            const encryptedKey = this.rsaPkcs1(aeskey);
            const encryptedIv = aesiv.toString('base64');

            //console.log('Encrypted Key (RSA):', encryptedKey);
            //console.log('IV (Base64):', encryptedIv);
            //console.log('Encrypted Payload (AES-GCM):', encryptedPayload);

            // Prepare request data
            const requestData = {
                KEY: encryptedKey,
                IV: encryptedIv,
                PAYLOAD: encryptedPayload
            };

            // Prepare headers
            const headers = {
                "Host": "hdfcmmp.mintoak.com",
                "motoken": "",
                "deviceid": deviceId,
                "content-type": "application/json",
                "accept-encoding": "gzip",
                "user-agent": "okhttp/4.9.1"
            };

            //console.log('Making API call to ValidateUser...');

            // Make API call
            const url = "https://hdfcmmp.mintoak.com/OneAppAuth/v3/ValidateUser";
            const response = await axios.post(url, requestData, {
                headers,
                timeout: 30000
            });

            //console.log('Raw API Response:', response.data);
            //console.log('Response type:', typeof response.data);

            // Handle string response (direct encrypted data)
            if (typeof response.data === 'string') {
                //console.log('Decrypting string response...');

                // Decrypt response directly
                const decryptedResponse = this.decrypt(response.data, aeskey, aesiv);

                if (!decryptedResponse) {
                    throw new Error('Failed to decrypt response');
                }

                //console.log('Decrypted Response:', decryptedResponse);

                let jsonResponse;
                try {
                    jsonResponse = JSON.parse(decryptedResponse);
                } catch (parseError) {
                    console.error('JSON Parse Error:', parseError);
                    throw new Error('Invalid JSON in decrypted response');
                }

                jsonResponse.deviceid = deviceId; // Attach deviceId to response
                return jsonResponse;

            }
            // Handle object response with PAYLOAD field
            else if (response.data && response.data.PAYLOAD) {
                //console.log('Decrypting PAYLOAD response...');

                // Decrypt response from PAYLOAD field
                const decryptedResponse = this.decrypt(response.data.PAYLOAD, aeskey, aesiv);

                if (!decryptedResponse) {
                    throw new Error('Failed to decrypt response');
                }

                //console.log('Decrypted Response:', decryptedResponse);

                let jsonResponse;
                try {
                    jsonResponse = JSON.parse(decryptedResponse);
                } catch (parseError) {
                    console.error('JSON Parse Error:', parseError);
                    throw new Error('Invalid JSON in decrypted response');
                }
                jsonResponse.deviceid = deviceId; // Attach deviceId to response
                return jsonResponse;

            } else {
                //console.log('Unknown response format:', response.data);
                throw new Error('Unknown response format');
            }

        } catch (error) {
            console.error('Error in sendOTP:', error.message);

            // If there's a public key error, try to update it
            if (error.message.includes('Unknown response format') || error.message.includes('unsupported') || error.message.includes('Failed to decrypt response') || error.message.includes('Public key not available')) {
                try {
                    //console.log('Attempting to update public key and retry...');
                    await this.updatePublicKey();
                    // Retry the operation
                    return await this.sendOTP(phoneNumber);
                } catch (retryError) {
                    throw new Error(`Public key update failed: ${retryError.message}`);
                }
            }

            throw error;
        }
    }

    // OTP Verification function - CORRECTED
    async verifyOTP(phoneNumber, otp, sessionId, deviceId) {
        try {
            await this.ensureInitialized();
            // Ensure public key is available
            if (!this.publicKey) {
                await this.loadOrUpdatePublicKey();
            }

            // Generate new AES key and IV for this request
            const aeskey = crypto.randomBytes(16);
            const aesiv = crypto.randomBytes(16);

            // Prepare payload
            const payload = {
                loginId: phoneNumber.toString(),
                otp: otp.toString()
            };

            //console.log('Verify OTP Payload:', JSON.stringify(payload));

            // Encrypt payload
            const encryptedPayload = this.encrypt(JSON.stringify(payload), aeskey, aesiv);

            // Encrypt AES key with RSA
            const encryptedKey = this.rsaPkcs1(aeskey);
            const encryptedIv = aesiv.toString('base64');

            //console.log('OTP Verification - Encrypted Key:', encryptedKey);
            //console.log('OTP Verification - Encrypted IV:', encryptedIv);
            //console.log('OTP Verification - Encrypted Payload:', encryptedPayload);

            // Prepare request data
            const requestData = {
                KEY: encryptedKey,
                IV: encryptedIv,
                PAYLOAD: encryptedPayload
            };

            // Prepare headers
            const headers = {
                "Host": "hdfcmmp.mintoak.com",
                "motoken": "",
                "sessionid": sessionId,
                "content-type": "application/json",
                "accept-encoding": "gzip",
                "user-agent": "okhttp/4.9.1"
            };

            //console.log('Making OTP verification API call...');

            // Make API call
            const url = "https://hdfcmmp.mintoak.com/OneAppAuth/VerifyOTP";
            const response = await axios.post(url, requestData, {
                headers,
                timeout: 30000
            });

            //console.log('Raw OTP Verification Response:', response.data);
            //console.log('Response type:', typeof response.data);

            // Handle string response (direct encrypted data)
            if (typeof response.data === 'string') {
                //console.log('Decrypting string response...');

                // Decrypt response directly
                const decryptedResponse = this.decrypt(response.data, aeskey, aesiv);

                if (!decryptedResponse) {
                    throw new Error('Failed to decrypt OTP verification response');
                }

                //console.log('Decrypted OTP Response:', decryptedResponse);

                let jsonResponse;
                try {
                    jsonResponse = JSON.parse(decryptedResponse);
                } catch (parseError) {
                    console.error('JSON Parse Error:', parseError);
                    throw new Error('Invalid JSON in decrypted OTP response');
                }


                jsonResponse.deviceid = deviceId; // Attach deviceId to response
                return jsonResponse;

            }
            // Handle object response with PAYLOAD field
            else if (response.data && response.data.PAYLOAD) {
                //console.log('Decrypting PAYLOAD response...');

                // Decrypt response from PAYLOAD field
                const decryptedResponse = this.decrypt(response.data.PAYLOAD, aeskey, aesiv);

                if (!decryptedResponse) {
                    throw new Error('Failed to decrypt OTP verification response');
                }

                //console.log('Decrypted OTP Response:', decryptedResponse);

                let jsonResponse;
                try {
                    jsonResponse = JSON.parse(decryptedResponse);
                } catch (parseError) {
                    console.error('JSON Parse Error:', parseError);
                    throw new Error('Invalid JSON in decrypted OTP response');
                }
                jsonResponse.deviceid = deviceId; // Attach deviceId to response
                return jsonResponse;

            } else {
                //console.log('Unknown response format:', response.data);
                throw new Error('Unknown OTP verification response format');
            }

        } catch (error) {
            console.error('Error in verifyOTP:', error.message);
            throw error;
        }
    }

    // Get User Terminal Info function
    async getUserTerminalInfo(sessionId) {
        try {
            await this.ensureInitialized();
            // Ensure public key is available
            if (!this.publicKey) {
                await this.loadOrUpdatePublicKey();
            }

            // Generate new AES key and IV for this request
            const aeskey = crypto.randomBytes(16);
            const aesiv = crypto.randomBytes(16);

            // Prepare payload - empty object as per PHP code
            const payload = {};

            //console.log('User Terminal Info Payload:', JSON.stringify(payload));

            // Encrypt payload
            const encryptedPayload = this.encrypt(JSON.stringify(payload), aeskey, aesiv);

            // Encrypt AES key with RSA
            const encryptedKey = this.rsaPkcs1(aeskey);
            const encryptedIv = aesiv.toString('base64');

            //console.log('User Terminal Info - Encrypted Key:', encryptedKey);
            //console.log('User Terminal Info - Encrypted IV:', encryptedIv);
            //console.log('User Terminal Info - Encrypted Payload:', encryptedPayload);

            // Prepare request data
            const requestData = {
                KEY: encryptedKey,
                IV: encryptedIv,
                PAYLOAD: encryptedPayload
            };

            // Prepare headers
            const headers = {
                "Host": "hdfcmmp.mintoak.com",
                "motoken": "",
                "sessionid": sessionId,
                "content-type": "application/json",
                "accept-encoding": "gzip",
                "user-agent": "okhttp/4.9.1"
            };

            //console.log('Making User Terminal Info API call...');

            // Make API call
            const url = "https://hdfcmmp.mintoak.com/HDFC360/user-terminal-info";
            const response = await axios.post(url, requestData, {
                headers,
                timeout: 30000
            });

            //console.log('Raw User Terminal Info Response:', response.data);
            //console.log('Response type:', typeof response.data);

            // Handle string response (direct encrypted data)
            if (typeof response.data === 'string') {
                //console.log('Decrypting string response...');

                // Decrypt response directly
                const decryptedResponse = this.decrypt(response.data, aeskey, aesiv);

                if (!decryptedResponse) {
                    throw new Error('Failed to decrypt user terminal info response');
                }

                //console.log('Decrypted User Terminal Info Response:', decryptedResponse);

                let jsonResponse;
                try {
                    jsonResponse = JSON.parse(decryptedResponse);
                } catch (parseError) {
                    console.error('JSON Parse Error:', parseError);
                    throw new Error('Invalid JSON in decrypted user terminal info response');
                }

                return jsonResponse;

            }
            // Handle object response with PAYLOAD field
            else if (response.data && response.data.PAYLOAD) {
                //console.log('Decrypting PAYLOAD response...');

                // Decrypt response from PAYLOAD field
                const decryptedResponse = this.decrypt(response.data.PAYLOAD, aeskey, aesiv);

                if (!decryptedResponse) {
                    throw new Error('Failed to decrypt user terminal info response');
                }

                //console.log('Decrypted User Terminal Info Response:', decryptedResponse);

                let jsonResponse;
                try {
                    jsonResponse = JSON.parse(decryptedResponse);
                } catch (parseError) {
                    console.error('JSON Parse Error:', parseError);
                    throw new Error('Invalid JSON in decrypted user terminal info response');
                }

                return jsonResponse;

            } else {
                //console.log('Unknown response format:', response.data);
                throw new Error('Unknown user terminal info response format');
            }

        } catch (error) {

            console.error('Error in getUserTerminalInfo:', error.message);
            // If there's a public key error, try to update it
            if (error.message.includes('Unknown response format') || error.message.includes('unsupported') || error.message.includes('Failed to decrypt response') || error.message.includes('Public key not available')) {
                try {
                    //console.log('Attempting to update public key and retry...');
                    await this.updatePublicKey();
                    // Retry the operation
                    return await this.getUserTerminalInfo(sessionId);
                } catch (retryError) {
                    throw new Error(`Public key update failed: ${retryError.message}`);
                }
            }

            throw error;
        }
    }

    // Validate VPA function
    async validateVPA(sessionId, upiId, terminalId) {
        try {
            await this.ensureInitialized();
            // Ensure public key is available
            if (!this.publicKey) {
                await this.loadOrUpdatePublicKey();
            }

            // Generate new AES key and IV for this request
            const aeskey = crypto.randomBytes(16);
            const aesiv = crypto.randomBytes(16);

            // Prepare payload
            const payload = {
                vpa: upiId.toString(),
                terminalId: terminalId.toString()
            };

            //console.log('Validate VPA Payload:', JSON.stringify(payload));

            // Encrypt payload
            const encryptedPayload = this.encrypt(JSON.stringify(payload), aeskey, aesiv);

            // Encrypt AES key with RSA
            const encryptedKey = this.rsaPkcs1(aeskey);
            const encryptedIv = aesiv.toString('base64');

            //console.log('Validate VPA - Encrypted Key:', encryptedKey);
            //console.log('Validate VPA - Encrypted IV:', encryptedIv);
            //console.log('Validate VPA - Encrypted Payload:', encryptedPayload);

            // Prepare request data
            const requestData = {
                KEY: encryptedKey,
                IV: encryptedIv,
                PAYLOAD: encryptedPayload
            };

            // Prepare headers
            const headers = {
                "Host": "hdfcmmp.mintoak.com",
                "motoken": "",
                "sessionid": sessionId,
                "content-type": "application/json",
                "accept-encoding": "gzip",
                "user-agent": "okhttp/4.9.1"
            };

            //console.log('Making Validate VPA API call...');

            // Make API call
            const url = "https://hdfcmmp.mintoak.com/HDFC/V9/ValidateVPA";
            const response = await axios.post(url, requestData, {
                headers,
                timeout: 30000
            });

            //console.log('Raw Validate VPA Response:', response.data);
            //console.log('Response type:', typeof response.data);

            let decryptedResponse;

            // Handle string response (direct encrypted data)
            if (typeof response.data === 'string') {
                //console.log('Decrypting string response...');
                decryptedResponse = this.decrypt(response.data, aeskey, aesiv);
            }
            // Handle object response with PAYLOAD field
            else if (response.data && response.data.PAYLOAD) {
                //console.log('Decrypting PAYLOAD response...');
                decryptedResponse = this.decrypt(response.data.PAYLOAD, aeskey, aesiv);
            } else {
                //console.log('Unknown response format:', response.data);
                throw new Error('Unknown validate VPA response format');
            }

            if (!decryptedResponse) {
                throw new Error('Failed to decrypt validate VPA response');
            }

            //console.log('Decrypted Validate VPA Response:', decryptedResponse);

            let jsonResponse;
            try {
                jsonResponse = JSON.parse(decryptedResponse);
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                throw new Error('Invalid JSON in decrypted validate VPA response');
            }

            // Handle response based on status codes as per PHP logic
            const status = jsonResponse.status || "";
            const statusCode = jsonResponse.statusCode || "";

            if (status === 'Success' && statusCode === 'S101') {
                return {
                    status: "Success",
                    message: "Upiid is valid",
                    rawResponse: jsonResponse
                };
            } else if (status === 'Failed' && statusCode === 'P119') {
                return {
                    status: "Failed",
                    message: "Upiid is invalid",
                    rawResponse: jsonResponse
                };
            } else {
                return {
                    status: status,
                    message: jsonResponse.respMessage || jsonResponse.message || "Unknown response",
                    statusCode: statusCode,
                    rawResponse: jsonResponse
                };
            }

        } catch (error) {
            console.error('Error in validateVPA:', error.message);
            throw error;
        }
    }

    // Generate QR Payment function - FINAL WORKING VERSION WITH RETRY
    async generateQRPayment(sessionId, terminalId, amount, description, customerMobileNumber, appTxnId, merchantMobileNumber, pin, deviceId, pgId = 1, redemptionId = [], retryCount = 0) {
        try {
            await this.ensureInitialized();
            // Ensure public key is available
            if (!this.publicKey) {
                await this.loadOrUpdatePublicKey();
            }

            // Generate new AES key and IV for this request
            const aeskey = crypto.randomBytes(16);
            const aesiv = crypto.randomBytes(16);

            // Prepare payload
            const payload = {
                terminalId: terminalId.toString(),
                amount: amount + '.00',
                description: description.toString(),
                customerMobileNumber: customerMobileNumber.toString(),
                appTxnid: "2560" + appTxnId.toString(),
                pgId: pgId,
                redemptionId: redemptionId
            };

            //console.log('QR Payment Payload:', JSON.stringify(payload));

            // Encrypt payload
            const encryptedPayload = this.encrypt(JSON.stringify(payload), aeskey, aesiv);

            // Encrypt AES key with RSA
            const encryptedKey = this.rsaPkcs1(aeskey);
            const encryptedIv = aesiv.toString('base64');

            //console.log('QR Payment - Encrypted Key:', encryptedKey);
            //console.log('QR Payment - Encrypted IV:', encryptedIv);
            //console.log('QR Payment - Encrypted Payload:', encryptedPayload);

            // Prepare request data
            const requestData = {
                KEY: encryptedKey,
                IV: encryptedIv,
                PAYLOAD: encryptedPayload
            };

            // Prepare headers
            const headers = {
                "Host": "hdfcmmp.mintoak.com",
                "motoken": "",
                "sessionid": sessionId,
                "content-type": "application/json",
                "accept-encoding": "gzip",
                "user-agent": "okhttp/4.9.1"
            };

            //console.log('Making QR Payment API call...');

            // Make API call - Use arrayBuffer for PNG response
            const url = "https://hdfcmmp.mintoak.com/HDFC/OneApp/QRPay";
            const response = await axios.post(url, requestData, {
                headers,
                timeout: 30000,
                responseType: 'arraybuffer' // Important for PNG
            });

            //console.log('QR Payment Response received - Length:', response.data.length);

            // Convert to buffer
            const responseBuffer = Buffer.from(response.data);

            // Check if it's PNG by signature
            const pngSignature = responseBuffer.slice(0, 8);
            const isPNG = pngSignature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

            if (isPNG) {
                //console.log('✅ PNG QR Image generated successfully');

                // Convert to base64
                const base64Image = responseBuffer.toString('base64');

                return {
                    status: "success",
                    qrData: base64Image,
                    mimeType: "image/png",
                    isImage: true,
                    sessionId: sessionId,
                    imageSize: responseBuffer.length
                };
            } else {
                // If not PNG, try to handle as other response
                //console.log('⚠️ Response is not PNG');
                const responseString = responseBuffer.toString('utf8');

                return {
                    status: "success",
                    qrData: responseBuffer.toString('base64'),
                    rawResponse: responseString,
                    sessionId: sessionId,
                    isBase64: true
                };
            }

        } catch (error) {
            if (error.response && error.response.status === 401) {

                // Call loginSession to refresh session
                const newSession = await this.loginSession(merchantMobileNumber, deviceId);

                // Optionally, retry the QR payment with new sessionId
                // MPIN verification usage
                const mpinResult = await this.verifyMPIN(
                    merchantMobileNumber,           // phoneNumber
                    pin,                 // MPIN
                    newSession.sessionId  // sessionId
                );

                console.log('MPIN Verification Result after session refresh:', mpinResult);

                if (mpinResult.status !== 'Success') {
                    return {
                        status: 'failed',
                        message: 'Merchant Disconnected. Please login again to continue.',
                        type: 'merchant_disconnect'
                    };
                }
                return await this.generateQRPayment(newSession.sessionId, terminalId, amount, description, customerMobileNumber, appTxnId, merchantMobileNumber, pin, deviceId, pgId, redemptionId, retryCount);

            }

            // Retry logic for non-401 errors (connection issues, timeouts, etc)
            if (retryCount < 1) {
                console.warn(`QR Payment generation failed, retrying... (Attempt ${retryCount + 1}/2)`);
                // Wait 1 second before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
                // Retry with incremented count
                return await this.generateQRPayment(sessionId, terminalId, amount, description, customerMobileNumber, appTxnId, merchantMobileNumber, pin, deviceId, pgId, redemptionId, retryCount + 1);
            }

            console.error('Error in generateQRPayment:', error.message);
            throw error;
        }
    }

    // Get Payment Mode Summary function
    async getPaymentModeSummary(sessionId, terminalId, startDate, endDate) {
        try {
            await this.ensureInitialized();
            // Ensure public key is available
            if (!this.publicKey) {
                await this.loadOrUpdatePublicKey();
            }

            // Generate new AES key and IV for this request
            const aeskey = crypto.randomBytes(16);
            const aesiv = crypto.randomBytes(16);

            // Prepare payload
            const payload = {
                tidList: [terminalId.toString()],
                startDate: startDate,
                endDate: endDate
            };

            //console.log('Payment Mode Summary Payload:', JSON.stringify(payload));

            // Encrypt payload
            const encryptedPayload = this.encrypt(JSON.stringify(payload), aeskey, aesiv);

            // Encrypt AES key with RSA
            const encryptedKey = this.rsaPkcs1(aeskey);
            const encryptedIv = aesiv.toString('base64');

            //console.log('Payment Mode Summary - Encrypted Key:', encryptedKey);
            //console.log('Payment Mode Summary - Encrypted IV:', encryptedIv);
            //console.log('Payment Mode Summary - Encrypted Payload:', encryptedPayload);

            // Prepare request data
            const requestData = {
                KEY: encryptedKey,
                IV: encryptedIv,
                PAYLOAD: encryptedPayload
            };

            // Prepare headers
            const headers = {
                "Host": "hdfcmmp.mintoak.com",
                "motoken": "",
                "sessionid": sessionId,
                "content-type": "application/json",
                "accept-encoding": "gzip",
                "user-agent": "okhttp/4.9.1"
            };

            //console.log('Making Payment Mode Summary API call...');

            // Make API call
            const url = "https://hdfcmmp.mintoak.com/HDFC360/V7/PaymentModeSummary";
            const response = await axios.post(url, requestData, {
                headers,
                timeout: 30000
            });

            //console.log('Raw Payment Mode Summary Response:', response.data);
            //console.log('Response type:', typeof response.data);

            let decryptedResponse;

            // Handle string response (direct encrypted data)
            if (typeof response.data === 'string') {
                //console.log('Decrypting string response...');
                decryptedResponse = this.decrypt(response.data, aeskey, aesiv);
            }
            // Handle object response with PAYLOAD field
            else if (response.data && response.data.PAYLOAD) {
                //console.log('Decrypting PAYLOAD response...');
                decryptedResponse = this.decrypt(response.data.PAYLOAD, aeskey, aesiv);
            } else {
                //console.log('Unknown response format:', response.data);
                throw new Error('Unknown payment mode summary response format');
            }

            if (!decryptedResponse) {
                throw new Error('Failed to decrypt payment mode summary response');
            }

            //console.log('Decrypted Payment Mode Summary Response:', decryptedResponse);

            let jsonResponse;
            try {
                jsonResponse = JSON.parse(decryptedResponse);
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                throw new Error('Invalid JSON in decrypted payment mode summary response');
            }

            return jsonResponse;

        } catch (error) {
            console.error('Error in getPaymentModeSummary:', error.message);
            throw error;
        }
    }

    // Get Merchant Transaction Details function
    async getMerchantTransactionDetails(sessionId, terminalId, startDate, endDate, count = 50, txnsType = "SaleSuccess", serviceType = "miniStatement") {
        try {
            await this.ensureInitialized();


            // Generate new AES key and IV for this request
            const aeskey = crypto.randomBytes(16);
            const aesiv = crypto.randomBytes(16);

            // Prepare payload
            const payload = {
                tidList: [terminalId.toString()],
                type: "terminal",
                txnsType: txnsType,
                startDate: startDate,
                endDate: endDate,
                serviceType: serviceType,
                count: count.toString()
            };

            //console.log('Merchant Transaction Details Payload:', JSON.stringify(payload));

            // Encrypt payload
            const encryptedPayload = this.encrypt(JSON.stringify(payload), aeskey, aesiv);

            // Encrypt AES key with RSA
            const encryptedKey = this.rsaPkcs1(aeskey);
            const encryptedIv = aesiv.toString('base64');

            //console.log('Merchant Transaction Details - Encrypted Key:', encryptedKey);
            //console.log('Merchant Transaction Details - Encrypted IV:', encryptedIv);
            //console.log('Merchant Transaction Details - Encrypted Payload:', encryptedPayload);

            // Prepare request data
            const requestData = {
                KEY: encryptedKey,
                IV: encryptedIv,
                PAYLOAD: encryptedPayload
            };

            // Prepare headers
            const headers = {
                "Host": "hdfcmmp.mintoak.com",
                "motoken": "",
                "sessionid": sessionId,
                "content-type": "application/json",
                "accept-encoding": "gzip",
                "user-agent": "okhttp/4.9.1"
            };

            //console.log('Making Merchant Transaction Details API call...');

            // Make API call
            const url = "https://hdfcmmp.mintoak.com/HDFC360/OneApp/V2/merchant-txn-detail";
            const response = await axios.post(url, requestData, {
                headers,
                timeout: 30000
            });

            //console.log('Raw Merchant Transaction Details Response:', response.data);
            //console.log('Response type:', typeof response.data);

            let decryptedResponse;

            // Handle string response (direct encrypted data)
            if (typeof response.data === 'string') {
                //console.log('Decrypting string response...');
                decryptedResponse = this.decrypt(response.data, aeskey, aesiv);
            }
            // Handle object response with PAYLOAD field
            else if (response.data && response.data.PAYLOAD) {
                //console.log('Decrypting PAYLOAD response...');
                decryptedResponse = this.decrypt(response.data.PAYLOAD, aeskey, aesiv);
            } else {
                //console.log('Unknown response format:', response.data);
                throw new Error('Unknown merchant transaction details response format');
            }

            if (!decryptedResponse) {
                throw new Error('Failed to decrypt merchant transaction details response');
            }

            //console.log('Decrypted Merchant Transaction Details Response:', decryptedResponse);

            let jsonResponse;
            try {
                jsonResponse = JSON.parse(decryptedResponse);
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                throw new Error('Invalid JSON in decrypted merchant transaction details response');
            }

            return jsonResponse;

        } catch (error) {

            console.error('Error in getMerchantTransactionDetails:', error.message);
            // If there's a public key error, try to update it
            if (error.message.includes('Unknown response format') || error.message.includes('unsupported') || error.message.includes('Failed to decrypt response') || error.message.includes('Public key not available')) {
                try {
                    //console.log('Attempting to update public key and retry...');
                    await this.updatePublicKey();
                    // Retry the operation
                    return await this.getMerchantTransactionDetails(sessionId, terminalId, startDate, endDate, count, txnsType, serviceType);
                } catch (retryError) {
                    throw new Error(`Public key update failed: ${retryError.message}`);
                }
            }
            throw error;
        }
    }

    // Get Merchant Sale Counter View All function
    async getMerchantSaleCounterViewAll(sessionId, terminalId, startDate, endDate) {
        try {
            await this.ensureInitialized();

            // Generate new AES key and IV for this request
            const aeskey = crypto.randomBytes(16);
            const aesiv = crypto.randomBytes(16);

            // Prepare payload
            const payload = {
                tidList: [terminalId.toString()],
                startDate: startDate,
                endDate: endDate
            };

            //console.log('Merchant Sale Counter View All Payload:', JSON.stringify(payload));

            // Encrypt payload
            const encryptedPayload = this.encrypt(JSON.stringify(payload), aeskey, aesiv);

            // Encrypt AES key with RSA
            const encryptedKey = this.rsaPkcs1(aeskey);
            const encryptedIv = aesiv.toString('base64');

            //console.log('Merchant Sale Counter View All - Encrypted Key:', encryptedKey);
            //console.log('Merchant Sale Counter View All - Encrypted IV:', encryptedIv);
            //console.log('Merchant Sale Counter View All - Encrypted Payload:', encryptedPayload);

            // Prepare request data
            const requestData = {
                KEY: encryptedKey,
                IV: encryptedIv,
                PAYLOAD: encryptedPayload
            };

            // Prepare headers
            const headers = {
                "Host": "hdfcmmp.mintoak.com",
                "motoken": "",
                "sessionid": sessionId,
                "content-type": "application/json",
                "accept-encoding": "gzip",
                "user-agent": "okhttp/4.9.1"
            };

            //console.log('Making Merchant Sale Counter View All API call...');

            // Make API call
            const url = "https://hdfcmmp.mintoak.com/HDFC360/V6/MerSaleCounterViewAll";
            const response = await axios.post(url, requestData, {
                headers,
                timeout: 30000
            });

            //console.log('Raw Merchant Sale Counter View All Response:', response.data);
            //console.log('Response type:', typeof response.data);

            let decryptedResponse;

            // Handle string response (direct encrypted data)
            if (typeof response.data === 'string') {
                //console.log('Decrypting string response...');
                decryptedResponse = this.decrypt(response.data, aeskey, aesiv);
            }
            // Handle object response with PAYLOAD field
            else if (response.data && response.data.PAYLOAD) {
                //console.log('Decrypting PAYLOAD response...');
                decryptedResponse = this.decrypt(response.data.PAYLOAD, aeskey, aesiv);
            } else {
                //console.log('Unknown response format:', response.data);
                throw new Error('Unknown merchant sale counter view all response format');
            }

            if (!decryptedResponse) {
                throw new Error('Failed to decrypt merchant sale counter view all response');
            }

            //console.log('Decrypted Merchant Sale Counter View All Response:', decryptedResponse);

            let jsonResponse;
            try {
                jsonResponse = JSON.parse(decryptedResponse);
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                throw new Error('Invalid JSON in decrypted merchant sale counter view all response');
            }

            return jsonResponse;

        } catch (error) {
            console.error('Error in getMerchantSaleCounterViewAll:', error.message);
            // If there's a public key error, try to update it
            if (error.message.includes('Unknown response format') || error.message.includes('unsupported') || error.message.includes('Failed to decrypt response') || error.message.includes('Public key not available')) {
                try {
                    //console.log('Attempting to update public key and retry...');
                    await this.updatePublicKey();
                    // Retry the operation
                    return await this.getMerchantSaleCounterViewAll(sessionId, terminalId, startDate, endDate);
                }
                catch (retryError) {
                    throw new Error(`Public key update failed: ${retryError.message}`);
                }
            }
            throw error;
        }
    }

    // UPI Collect Payment function
    async upiCollectPayment(sessionId, terminalId, amount, description, customerMobileNumber, payerVpa, appTxnId, pgId = 1, redemptionId = []) {
        try {
            await this.ensureInitialized();

            // Generate new AES key and IV for this request
            const aeskey = crypto.randomBytes(16);
            const aesiv = crypto.randomBytes(16);

            // Prepare payload
            const payload = {
                terminalId: terminalId.toString(),
                amount: amount + '',
                description: description.toString(),
                customerMobileNumber: customerMobileNumber.toString(),
                appTxnid: "2560" + appTxnId.toString(),
                pgId: pgId,
                redemptionId: redemptionId,
                payerVpa: payerVpa.toString()
            };

            //console.log('UPI Collect Payment Payload:', JSON.stringify(payload));

            // Encrypt payload
            const encryptedPayload = this.encrypt(JSON.stringify(payload), aeskey, aesiv);

            // Encrypt AES key with RSA
            const encryptedKey = this.rsaPkcs1(aeskey);
            const encryptedIv = aesiv.toString('base64');

            //console.log('UPI Collect Payment - Encrypted Key:', encryptedKey);
            //console.log('UPI Collect Payment - Encrypted IV:', encryptedIv);
            //console.log('UPI Collect Payment - Encrypted Payload:', encryptedPayload);

            // Prepare request data
            const requestData = {
                KEY: encryptedKey,
                IV: encryptedIv,
                PAYLOAD: encryptedPayload
            };

            // Prepare headers
            const headers = {
                "Host": "hdfcmmp.mintoak.com",
                "motoken": "",
                "sessionid": sessionId,
                "content-type": "application/json",
                "accept-encoding": "gzip",
                "user-agent": "okhttp/4.9.1"
            };

            //console.log('Making UPI Collect Payment API call...');

            // Make API call
            const url = "https://hdfcmmp.mintoak.com/HDFC/OneApp/UPICollect";
            const response = await axios.post(url, requestData, {
                headers,
                timeout: 30000
            });

            //console.log('Raw UPI Collect Payment Response:', response.data);
            //console.log('Response type:', typeof response.data);

            let decryptedResponse;

            // Handle string response (direct encrypted data)
            if (typeof response.data === 'string') {
                //console.log('Decrypting string response...');
                decryptedResponse = this.decrypt(response.data, aeskey, aesiv);
            }
            // Handle object response with PAYLOAD field
            else if (response.data && response.data.PAYLOAD) {
                //console.log('Decrypting PAYLOAD response...');
                decryptedResponse = this.decrypt(response.data.PAYLOAD, aeskey, aesiv);
            } else {
                //console.log('Unknown response format:', response.data);
                throw new Error('Unknown UPI collect payment response format');
            }

            if (!decryptedResponse) {
                throw new Error('Failed to decrypt UPI collect payment response');
            }

            //console.log('Decrypted UPI Collect Payment Response:', decryptedResponse);

            let jsonResponse;
            try {
                jsonResponse = JSON.parse(decryptedResponse);
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                throw new Error('Invalid JSON in decrypted UPI collect payment response');
            }

            return jsonResponse;

        } catch (error) {
            console.error('Error in upiCollectPayment:', error.message);
            // If there's a public key error, try to update it
            if (error.message.includes('Unknown response format') || error.message.includes('unsupported') || error.message.includes('Failed to decrypt response') || error.message.includes('Public key not available')) {
                try {
                    //console.log('Attempting to update public key and retry...');
                    await this.updatePublicKey();
                    // Retry the operation
                    return await this.upiCollectPayment(sessionId, terminalId, amount, description, customerMobileNumber, payerVpa, appTxnId, pgId, redemptionId);
                } catch (retryError) {
                    throw new Error(`Public key update failed: ${retryError.message}`);
                }
            }
            throw error;
        }
    }

    async loginSession(phoneNumber, deviceId = null) {
        try {
            await this.ensureInitialized();

            // Generate device ID if not provided
            const finalDeviceId = deviceId || this.randomString(16);

            // Generate new AES key and IV for each request
            const aeskey = crypto.randomBytes(16);
            const aesiv = crypto.randomBytes(16);

            // Prepare payload (exactly like PHP)
            const payload = {
                loginId: phoneNumber.toString(),
                appVersion: "7.2.0",
                devicePlatform: "android"
            };

            // Encrypt payload
            const encryptedPayload = this.encrypt(JSON.stringify(payload), aeskey, aesiv);

            // Encrypt AES key with RSA
            const encryptedKey = this.rsaPkcs1(aeskey);
            const encryptedIv = aesiv.toString('base64');

            // Prepare request data
            const requestData = {
                KEY: encryptedKey,
                IV: encryptedIv,
                PAYLOAD: encryptedPayload
            };

            // Prepare headers 
            const headers = {
                "Host": "hdfcmmp.mintoak.com",
                "motoken": "",
                "deviceid": finalDeviceId,
                "content-type": "application/json",
                "accept-encoding": "gzip",
                "user-agent": "okhttp/4.9.1"
            };

            // Make API call
            const url = "https://hdfcmmp.mintoak.com/OneAppAuth/v3/ValidateUser";
            const response = await axios.post(url, requestData, {
                headers,
                timeout: 30000
            });

            let decryptedResponse;

            // Handle response
            if (typeof response.data === 'string') {
                decryptedResponse = this.decrypt(response.data, aeskey, aesiv);
            } else if (response.data && response.data.PAYLOAD) {
                decryptedResponse = this.decrypt(response.data.PAYLOAD, aeskey, aesiv);
            } else {
                throw new Error('Unknown response format');
            }

            if (!decryptedResponse) {
                throw new Error('Failed to decrypt response');
            }

            const jsonResponse = JSON.parse(decryptedResponse);


            return jsonResponse;
        } catch (error) {
            console.error('Error in loginSession:', error.message);

            // Retry logic
            if (error.message.includes('Unknown response format') || error.message.includes('Failed to decrypt response')) {
                try {
                    await this.updatePublicKey();
                    return await this.loginSession(phoneNumber, deviceId);
                } catch (retryError) {
                    throw new Error(`Public key update failed: ${retryError.message}`);
                }
            }
            throw error;
        }
    }

    // MPIN Verification function
    async verifyMPIN(phoneNumber, pin, sessionId) {
        try {
            await this.ensureInitialized();
            // Generate new AES key and IV for this request
            const aeskey = crypto.randomBytes(16);
            const aesiv = crypto.randomBytes(16);

            // Prepare payload
            const payload = {
                loginId: phoneNumber.toString(),
                authType: "mPin",
                mPin: pin.toString(),
                fcmToken: "",
                appInstanceId: "",
                simID: ""
            };

            //console.log('Verify MPIN Payload:', JSON.stringify(payload));

            // Encrypt payload
            const encryptedPayload = this.encrypt(JSON.stringify(payload), aeskey, aesiv);

            // Encrypt AES key with RSA
            const encryptedKey = this.rsaPkcs1(aeskey);
            const encryptedIv = aesiv.toString('base64');

            //console.log('MPIN Verification - Encrypted Key:', encryptedKey);
            //console.log('MPIN Verification - Encrypted IV:', encryptedIv);
            //console.log('MPIN Verification - Encrypted Payload:', encryptedPayload);

            // Prepare request data
            const requestData = {
                KEY: encryptedKey,
                IV: encryptedIv,
                PAYLOAD: encryptedPayload
            };

            // Prepare headers
            const headers = {
                "Host": "hdfcmmp.mintoak.com",
                "motoken": "",
                "sessionid": sessionId,
                "content-type": "application/json",
                "accept-encoding": "gzip",
                "user-agent": "okhttp/4.9.1"
            };

            //console.log('Making MPIN verification API call...');

            // Make API call
            const url = "https://hdfcmmp.mintoak.com/OneAppAuth/VerifyPin";
            const response = await axios.post(url, requestData, {
                headers,
                timeout: 30000
            });

            //console.log('Raw MPIN Verification Response:', response.data);
            //console.log('Response type:', typeof response.data);

            // Handle string response (direct encrypted data)
            if (typeof response.data === 'string') {
                //console.log('Decrypting string response...');

                // Decrypt response directly
                const decryptedResponse = this.decrypt(response.data, aeskey, aesiv);

                if (!decryptedResponse) {
                    throw new Error('Failed to decrypt MPIN verification response');
                }

                //console.log('Decrypted MPIN Response:', decryptedResponse);

                let jsonResponse;
                try {
                    jsonResponse = JSON.parse(decryptedResponse);
                } catch (parseError) {
                    console.error('JSON Parse Error:', parseError);
                    throw new Error('Invalid JSON in decrypted MPIN response');
                }



                return jsonResponse;

            }
            // Handle object response with PAYLOAD field
            else if (response.data && response.data.PAYLOAD) {
                //console.log('Decrypting PAYLOAD response...');

                // Decrypt response from PAYLOAD field
                const decryptedResponse = this.decrypt(response.data.PAYLOAD, aeskey, aesiv);

                if (!decryptedResponse) {
                    throw new Error('Failed to decrypt MPIN verification response');
                }

                //console.log('Decrypted MPIN Response:', decryptedResponse);

                let jsonResponse;
                try {
                    jsonResponse = JSON.parse(decryptedResponse);
                } catch (parseError) {
                    console.error('JSON Parse Error:', parseError);
                    throw new Error('Invalid JSON in decrypted MPIN response');
                }


                return jsonResponse;

            } else {
                //console.log('Unknown response format:', response.data);
                throw new Error('Unknown MPIN verification response format');
            }

        } catch (error) {
            console.error('Error in verifyMPIN:', error.message);
            // If there's a public key error, try to update it
            if (error.message.includes('Unknown response format') || error.message.includes('unsupported') || error.message.includes('Failed to decrypt response') || error.message.includes('Public key not available')) {
                try {
                    //console.log('Attempting to update public key and retry...');
                    await this.updatePublicKey();
                    // Retry the operation
                    return await this.verifyMPIN(phoneNumber, pin, sessionId);
                } catch (retryError) {
                    throw new Error(`Public key update failed: ${retryError.message}`);
                }
            }
            throw error;
        }
    }

}

// Helper function to get current date in YYYY-MM-DD format
function getCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper function to get first and last day of current month
function getCurrentMonthDates() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const startDate = `${year}-${month}-01`;

    // Get last day of month
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

    return { startDate, endDate };
}

// // Usage with current month


async function sendOTP(phoneNumber) {
    const auth = new HDFCOneAppAuth();
    const result = await auth.sendOTP(phoneNumber);
    return result;
}

async function verifyOTP(phoneNumber, otp, requestId, sessionId) {
    const auth = new HDFCOneAppAuth();
    const result = await auth.verifyOTP(phoneNumber, otp, requestId, sessionId);
    return result;
}


async function verifyMPIN(phoneNumber, pin, sessionId) {
    const auth = new HDFCOneAppAuth();
    const result = await auth.verifyMPIN(phoneNumber, pin, sessionId);
    return result;
}

async function getUserTerminalInfo(sessionId) {
    const auth = new HDFCOneAppAuth();
    const result = await auth.getUserTerminalInfo(sessionId);
    return result;
}

async function validateVPA(sessionId, upiId, terminalId) {
    const auth = new HDFCOneAppAuth();
    const result = await auth.validateVPA(sessionId, upiId, terminalId);
    return result;
}

async function generateQRPayment(sessionId, terminalId, amount, description, customerMobileNumber, appTxnId, merchantMobileNumber, pin, deviceId) {
    const auth = new HDFCOneAppAuth();
    const result = await auth.generateQRPayment(sessionId, terminalId, amount, description, customerMobileNumber, appTxnId, merchantMobileNumber, pin, deviceId);
    return result;
}

async function getPaymentModeSummary(sessionId, terminalId, startDate, endDate) {
    const auth = new HDFCOneAppAuth();
    const result = await auth.getPaymentModeSummary(sessionId, terminalId, startDate, endDate);
    return result;
}

async function getMerchantTransactionDetails(sessionId, terminalId, startDate, endDate) {
    const auth = new HDFCOneAppAuth();
    const result = await auth.getMerchantTransactionDetails(sessionId, terminalId, startDate, endDate);
    return result;
}

async function getMerchantSaleCounterViewAll(sessionId, terminalId, startDate, endDate) {
    const auth = new HDFCOneAppAuth();
    const result = await auth.getMerchantSaleCounterViewAll(sessionId, terminalId, startDate, endDate);
    return result;
}

async function upiCollectPayment(sessionId, terminalId, amount, description, customerMobileNumber, payerVpa, appTxnId) {
    const auth = new HDFCOneAppAuth();
    const result = await auth.upiCollectPayment(sessionId, terminalId, amount, description, customerMobileNumber, payerVpa, appTxnId);
    return result;
}


async function loginSession(phoneNumber, deviceId = null) {
    const auth = new HDFCOneAppAuth();
    const result = await auth.loginSession(phoneNumber, deviceId);
    return result;
}



// Export the class
module.exports = {
    HDFCOneAppAuth,
    sendOTP,
    verifyOTP,
    verifyMPIN,
    getUserTerminalInfo,
    validateVPA,
    generateQRPayment,
    getPaymentModeSummary,
    getMerchantTransactionDetails,
    getMerchantSaleCounterViewAll,
    upiCollectPayment,
    loginSession,
    getCurrentMonthDates
};

// Usage example:
async function main() {
    try {
        //console.log('Starting HDFC OTP Service...');

        const auth = new HDFCOneAppAuth();




        // // // Example: Send OTP
        // const phoneNumber = 8509517215;
        // //console.log('Sending OTP to:', phoneNumber);

        // const otpResult = await auth.sendOTP(phoneNumber);
        // console.log('OTP Send Result:', JSON.stringify(otpResult, null, 2));

        // If OTP sent successfully, you can verify it
        // //console.log('\n=== Verifying OTP ===');

        // Example OTP verification (you'll need actual OTP from user)
        // const verifyResult = await auth.verifyOTP(
        //     phoneNumber,
        //     716052, // Example OTP
        //     "548b0f66-d65e-4194-82e1-935d705db954",
        //     "f5d619c47dd64ef1"
        // );

        // //console.log('OTP Verification Result:', JSON.stringify(verifyResult, null, 2));
        //console.log('\n=== Verifying MPIN ===');
        // MPIN verification usage
        // const mpinResult = await auth.verifyMPIN(
        //     8509517215,           // phoneNumber
        //     2580,                 // MPIN
        //     "2b55ad17-9a5b-4fb3-a3bf-f8384b5dcc7e"  // sessionId
        // );

        // console.log('MPIN Verification Result:', JSON.stringify(mpinResult, null, 2));

        // // User Terminal Info usage
        // const terminalInfo = await auth.getUserTerminalInfo(
        //     "37f62d94-09f1-4ab5-a235-de2b35263de8"  // sessionId
        // );

        // //console.log('User Terminal Info Result:', JSON.stringify(terminalInfo, null, 2));

        // // Validate VPA usage
        // const vpaResult = await auth.validateVPA(
        //     "37f62d94-09f1-4ab5-a235-de2b35263de8",  // sessionId
        //     "7340249105@upi",                        // upiId
        //     62965919                                 // terminalId
        // );

        // //console.log('VPA Validation Result:', JSON.stringify(vpaResult, null, 2));

        // // Check result
        // if (vpaResult.status === "Success") {
        //     //console.log('✅ VPA is valid');
        // } else if (vpaResult.status === "Failed") {
        //     //console.log('❌ VPA is invalid');
        // } else {
        //     //console.log('⚠️ Unknown VPA status:', vpaResult.message);
        // }

        // Generate QR Payment usage
        // const qrResult = await auth.generateQRPayment(
        //     "2b55ad17-9a5b-4fb3-a3bf-f8384b5dcc7e",  // sessionId
        //     62965919,                                // terminalId
        //     "1",                                    // amount
        //     "5973793176401615620721",                          // description
        //     "8509517215",                           // customerMobileNumber
        //     "5973793176401615620721"                                // appTxnId
        // );

        // console.log('QR Payment Result:', qrResult);

        // if (qrResult.status === "success") {
        //     if (qrResult.isBase64) {
        //         //console.log('QR Data (base64):', qrResult.qrData);

        //         // Decode the base64 to see actual message
        //         const decodedMessage = Buffer.from(qrResult.qrData, 'base64').toString('utf8');
        //         //console.log('Decoded message:', decodedMessage);
        //     } else {
        //         //console.log('Success Response:', qrResult.data);
        //     }
        // } else if (qrResult.status === "failed") {
        //     //console.log('❌ Payment Failed:');
        //     //console.log('Error Code:', qrResult.errorCode);
        //     //console.log('Message:', qrResult.message);

        //     // P110 error means "Invalid MintOak TxnId"
        //     if (qrResult.errorCode === 'P110') {
        //         //console.log('⚠️ Please use a different appTxnId');
        //     }
        // }


        // //console.log('Current month range:', startDate, 'to', endDate);

        // const summaryResult = await auth.getPaymentModeSummary(
        //     "dd462e75-1f5b-4f2d-beb5-0e0802cda72e",
        //     62965919,
        //     startDate,
        //     endDate
        // );

        // console.log('Payment Mode Summary Result:', JSON.stringify(summaryResult, null, 2));

        // // Get Merchant Transaction Details usage
        // const transactionDetails = await auth.getMerchantTransactionDetails(
        //     "2b55ad17-9a5b-4fb3-a3bf-f8384b5dcc7e",  // sessionId
        //     62965919,                                // terminalId
        //     startDate,                           // startDate
        //     endDate,                           // endDate
        //     50,                                      // count (number of transactions)
        //     "SaleSuccess",                          // txnsType
        //     "miniStatement"                         // serviceType
        // );

        // console.log('Merchant Transaction Details:', JSON.stringify(transactionDetails, null, 2));

        // const saleCounterData = await auth.getMerchantSaleCounterViewAll(
        //     "4115fd28-60d7-45fd-96bc-5ddee954dc32",  // sessionId
        //     62965919,                                // terminalId
        //     startDate,                           // startDate
        //     endDate                            // endDate
        // );

        // console.log('Merchant Sale Counter View All Result:', JSON.stringify(saleCounterData, null, 2));

        // const upiResult = await auth.upiCollectPayment(
        //     "37f62d94-09f1-4ab5-a235-de2b35263de8",  // sessionId
        //     62965919,                                // terminalId
        //     "1",                                     // amount
        //     "payment",                               // description
        //     "8509517215",                           // customerMobileNumber
        //     "mdsulemanmdsuleman27-2@oksbi",         // payerVpa
        //     "1234256"                                // appTxnId
        // );

        // //console.log('UPI Collect Payment Result:', JSON.stringify(upiResult, null, 2));

        // const result = await loginSession(8509517215, "11364ca7d6595001");
        // console.log('Login Session Result:', result);

    } catch (error) {
        console.error('Main function error:', error.message);
    }
}
