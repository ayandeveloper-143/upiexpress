const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class AadhaarCaptchaGenerator {
    constructor() {
        this.baseURL = 'https://tathya.uidai.gov.in/audioCaptchaService/api/captcha/v3/generation';
        this.otpURL = 'https://tathya.uidai.gov.in/unifiedAppAuthService/api/v2/generate/aadhaar/otp';
        this.downloadURL = 'https://tathya.uidai.gov.in/downloadAadhaarService/api/aadhaar/download';
        this.defaultHeaders = {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en_IN',
            'appid': 'MYAADHAAR',
            'connection': 'keep-alive',
            'content-type': 'application/json',
            'origin': 'https://myaadhaar.uidai.gov.in',
            'referer': 'https://myaadhaar.uidai.gov.in/',
            'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': 'Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
        };
    }

    /**
     * Generate a UUID for x-request-id header
     * @returns {string} UUID v4
     */
    generateRequestId() {
        return uuidv4();
    }

    /**
     * Generate captcha from Aadhaar service
     * @returns {Promise<Object>} Captcha response
     */
    async generateCaptcha() {
        // Generate request ID only for captcha
        const xRequestId = this.generateRequestId();

        // Prepare headers
        const headers = {
            ...this.defaultHeaders,
            'x-request-id': xRequestId
        };

        // Prepare request data
        const requestData = {
            captchaLength: "6",
            captchaType: "2",
            audioCaptchaRequired: false
        };

        try {
            const response = await axios.post(this.baseURL, requestData, {
                headers: headers,
                timeout: 30000
            });

            return {
                success: true,
                data: response.data,
                requestId: xRequestId
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                requestId: xRequestId,
                response: error.response?.data
            };
        }
    }

    /**
     * Generate Aadhaar OTP
     * @param {string} uidNumber - Aadhaar number
     * @param {string} captchaTxnId - Captcha transaction ID
     * @param {string} captchaValue - Captcha value
     * @param {string} transactionId - Transaction ID
     * @param {string} xRequestId - X-Request-ID
     * @returns {Promise<Object>} OTP response
     */
    async generateAadhaarOTP(uidNumber, captchaTxnId, captchaValue, transactionId, xRequestId) {
        // Prepare headers
        const headers = {
            ...this.defaultHeaders,
            'x-request-id': xRequestId
        };

        // Prepare request data
        const requestData = {
            uidNumber: uidNumber,
            captchaTxnId: captchaTxnId,
            captchaValue: captchaValue,
            transactionId: transactionId
        };

        console.log('Generating Aadhaar OTP with data:', requestData);

        try {
            const response = await axios.post(this.otpURL, requestData, {
                headers: headers,
                timeout: 30000
            });

            if (response.data.status !== 'Failure') {
                return {
                    success: true,
                    data: response.data,
                    requestId: xRequestId,
                    transactionId: transactionId
                };
            } else {
                return {
                    success: false,
                    error: response.data.errorMessage || 'Failed to send OTP',
                    requestId: xRequestId,
                    transactionId: transactionId,
                    response: response.data
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message,
                requestId: xRequestId,
                transactionId: transactionId,
                response: error.response?.data
            };
        }
    }

    /**
     * Download Aadhaar document
     * @param {string} uid - Aadhaar number
     * @param {boolean} mask - Whether to mask Aadhaar
     * @param {string} otp - OTP received
     * @param {string} otpTxnId - OTP transaction ID
     * @param {string} transactionId - Transaction ID
     * @param {string} xRequestId - X-Request-ID
     * @returns {Promise<Object>} Download response
     */
    async downloadAadhaar(uid, mask, otp, otpTxnId, transactionId, xRequestId) {
        // Prepare headers
        const headers = {
            ...this.defaultHeaders,
            'x-request-id': xRequestId,
            'transactionid': transactionId
        };

        // Prepare request data
        const requestData = {
            uid: uid,
            mask: mask,
            otp: otp,
            otpTxnId: otpTxnId
        };

        try {
            const response = await axios.post(this.downloadURL, requestData, {
                headers: headers,
                timeout: 30000
            });

            return {
                success: true,
                data: response.data,
                requestId: xRequestId,
                transactionId: transactionId,
                headers: headers
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                requestId: xRequestId,
                transactionId: transactionId,
                response: error.response?.data
            };
        }
    }
}

// Utility function for standalone use
async function generateAadhaarCaptcha() {
    const generator = new AadhaarCaptchaGenerator();
    return await generator.generateCaptcha();
}

// Utility function for standalone OTP generation
async function generateAadhaarOTP(uidNumber, captchaTxnId, captchaValue, transactionId, xRequestId) {
    const generator = new AadhaarCaptchaGenerator();
    return await generator.generateAadhaarOTP(uidNumber, captchaTxnId, captchaValue, transactionId, xRequestId);
}

// Utility function for standalone Aadhaar download
async function downloadAadhaar(uid, mask, otp, otpTxnId, transactionId, xRequestId) {
    const generator = new AadhaarCaptchaGenerator();
    return await generator.downloadAadhaar(uid, mask, otp, otpTxnId, transactionId, xRequestId);
}

// Example usage
async function example() {
    const captchaGenerator = new AadhaarCaptchaGenerator();

    // // Generate single captcha
    // try {
    //     const result = await captchaGenerator.generateCaptcha();

    //     console.log('Captcha Generation Result:');
    //     console.log('Success:', result.success);
    //     console.log('Request ID:', result.requestId);

    //     if (result.success) {
    //         console.log('Captcha Data:', result.data);
    //     } else {
    //         console.log('Error:', result.error);
    //     }
    // } catch (error) {
    //     console.error('Example error:', error);
    // }

    // // // Example: Generate OTP with provided data
    // try {
    //     const otpResult = await captchaGenerator.generateAadhaarOTP(
    //         "539965171349", // uidNumber
    //         "NAIPk5Fv3HEn", // captchaTxnId
    //         "7h7nbr", // captchaValue
    //         "1559f0ad-cae4-47f4-9228-0c6c08764539", // transactionId
    //         "1559f0ad-cae4-47f4-9228-0c6c08764539" // xRequestId
    //     );

    //     console.log('\nOTP Generation Result:');
    //     console.log('Success:', otpResult.success);
    //     console.log('Request ID:', otpResult.requestId);
    //     console.log('Transaction ID:', otpResult.transactionId);

    //     if (otpResult.success) {
    //         console.log('OTP Data:', otpResult.data);
    //     } else {
    //         console.log('Error:', otpResult.error);
    //     }
    // } catch (error) {
    //     console.error('OTP Example error:', error);
    // }

    // Example: Download Aadhaar with OTP
    // try {
    //     const downloadResult = await captchaGenerator.downloadAadhaar(
    //         "539965171349", // uid
    //         false, // mask
    //         "960489", // otp
    //         "MYAADHAAR:bae77c14-32cb-414f-9182-16560fda9887", // otpTxnId
    //         "2052ddf3-1c3c-4f3a-bd20-17852014ddf5", // transactionId
    //         "2052ddf3-1c3c-4f3a-bd20-17852014ddf5" // xRequestId
    //     );

    //     console.log('\nAadhaar Download Result:');
    //     console.log('Success:', downloadResult.success);
    //     console.log('Request ID:', downloadResult.requestId);
    //     console.log('Transaction ID:', downloadResult.transactionId);

    //     if (downloadResult.success) {
    //         console.log('Download Data:', downloadResult.data);
    //     } else {
    //         console.log('Error:', downloadResult.error);
    //         console.log('Response:', downloadResult.response);
    //     }
    // } catch (error) {
    //     console.error('Download Example error:', error);
    // }
}

// Run example
example();

module.exports = {
    AadhaarCaptchaGenerator,
    generateAadhaarCaptcha,
    generateAadhaarOTP,
    downloadAadhaar
};