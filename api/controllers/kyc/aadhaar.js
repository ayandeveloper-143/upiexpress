const axios = require("axios");
const { randomUUID } = require("crypto");

class AadhaarCaptchaGenerator {
    constructor() {
        this.captchaURL = "https://tathya.uidai.gov.in/audioCaptchaService/api/captcha/v3/generation";
        this.otpURL = "https://tathya.uidai.gov.in/unifiedAppAuthService/api/v2/generate/aadhaar/otp";
        this.downloadURL = "https://tathya.uidai.gov.in/downloadAadhaarService/api/aadhaar/download";

        this.defaultHeaders = {
        accept: "application/json, text/plain, */*",
        "accept-language": "en_IN",
        appid: "MYAADHAAR",
        connection: "keep-alive",
        "content-type": "application/json",
        origin: "https://myaadhaar.uidai.gov.in",
        referer: "https://myaadhaar.uidai.gov.in/",
        "sec-ch-ua": "\"Google Chrome\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"141\"",
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": "\"Android\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent": "Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
        };
    }

    generateRequestId() {
        return randomUUID();
    }

    async generateCaptcha() {
        const xRequestId = this.generateRequestId();

        const headers = {
            ...this.defaultHeaders,
            "x-request-id": xRequestId,
        };

        const requestData = {
            captchaLength: "6",
            captchaType: "2",
            audioCaptchaRequired: false,
        };

        try {
            const response = await axios.post(this.captchaURL, requestData, {
                headers,
                timeout: 30000,
            });

            return {
                success: true,
                data: response.data,
                requestId: xRequestId,
            };
        } catch (error) {
            return {
                success: false,
                error: error && error.message ? error.message : "Captcha generation failed",
                requestId: xRequestId,
                response: error && error.response ? error.response.data : undefined,
            };
        }
    }

    async generateAadhaarOTP(
        uidNumber,
        captchaTxnId,
        captchaValue,
        transactionId,
        xRequestId,
        clientIp,
    ) {
        const headers = {
            ...this.defaultHeaders,
            "x-request-id": xRequestId,
            transactionid: transactionId,
        };

        if (clientIp) {
            headers["x-forwarded-for"] = clientIp;
            headers["x-real-ip"] = clientIp;
        }

        const requestData = {
            uidNumber,
            captchaTxnId,
            captchaValue,
            transactionId,
        };

        try {
            const response = await axios.post(this.otpURL, requestData, {
                headers,
                timeout: 30000,
            });

            const responseData = response.data || {};
            if (responseData.status !== "Failure") {
                return {
                    success: true,
                    data: response.data,
                    requestId: xRequestId,
                    transactionId,
                };
            }

            const providerMessage =
                responseData.errorMessage
                || (responseData.errorDetails && responseData.errorDetails.messageEnglish)
                || responseData.message
                || "Failed to send OTP";

            const error = responseData.errorCode
                ? `${providerMessage} (code: ${responseData.errorCode})`
                : providerMessage;

            return {
                success: false,
                error,
                requestId: xRequestId,
                transactionId,
                response: response.data,
            };
        } catch (error) {
            return {
                success: false,
                error: error && error.message ? error.message : "OTP generation failed",
                requestId: xRequestId,
                transactionId,
                response: error && error.response ? error.response.data : undefined,
            };
        }
    }

    async downloadAadhaar(
        uid,
        mask,
        otp,
        otpTxnId,
        transactionId,
        xRequestId,
    ) {
        const headers = {
            ...this.defaultHeaders,
            "x-request-id": xRequestId,
            transactionid: transactionId,
        };

        const requestData = {
            uid,
            mask,
            otp,
            otpTxnId,
        };

        try {
            const response = await axios.post(this.downloadURL, requestData, {
                headers,
                timeout: 30000,
            });

            return {
                success: true,
                data: response.data,
                requestId: xRequestId,
                transactionId,
                headers,
            };
        } catch (error) {
            return {
                success: false,
                error: error && error.message ? error.message : "Aadhaar download failed",
                requestId: xRequestId,
                transactionId,
                response: error && error.response ? error.response.data : undefined,
            };
        }
    }
}

async function generateAadhaarCaptcha() {
    const generator = new AadhaarCaptchaGenerator();
    return generator.generateCaptcha();
}

async function generateAadhaarOTP(
    uidNumber,
    captchaTxnId,
    captchaValue,
    transactionId,
    xRequestId,
    clientIp,
) {
    const generator = new AadhaarCaptchaGenerator();
    return generator.generateAadhaarOTP(uidNumber, captchaTxnId, captchaValue, transactionId, xRequestId, clientIp);
}

async function downloadAadhaar(
    uid,
    mask,
    otp,
    otpTxnId,
    transactionId,
    xRequestId,
) {
    const generator = new AadhaarCaptchaGenerator();
    return generator.downloadAadhaar(uid, mask, otp, otpTxnId, transactionId, xRequestId);
}

module.exports = {
    AadhaarCaptchaGenerator,
    generateAadhaarCaptcha,
    generateAadhaarOTP,
    downloadAadhaar,
};
