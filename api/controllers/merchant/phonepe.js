const crypto = require('crypto');
const { checksum, checksumopp, checksum_2 } = require('./checksum');

function RandomString(length) {
    const keys = [...'9876543210abcdef'];
    let key = '';
    for (let i = 0; i < length; i++) {
        key += keys[Math.floor(Math.random() * keys.length)];
    }
    return key;
}

function RandomNumber(length) {
    let str = "";
    for (let i = 0; i < length; i++) {
        str += Math.floor(Math.random() * 10);
    }
    return str;
}

async function request(url, data0, method, headers, includeHeaders) {
    try {
        const fetch = (await import('node-fetch')).default;

        const options = {
            method: method,
            headers: headers,
            body: method === 'POST' ? data0 : undefined,
            redirect: 'follow',
            timeout: 30000
        };

        const response = await fetch(url, options);
        const responseText = await response.text();

        if (includeHeaders) {
            return {
                headers: Object.fromEntries(response.headers.entries()),
                body: responseText
            };
        } else {
            return responseText;
        }
    } catch (error) {
        console.error('Request error:', error);
        throw error;
    }
}

async function sendOTP(phoneNumber) {
    try {
        const mom = RandomString(16);
        const mon = RandomString(64);
        const mb = RandomString(8);
        const md = RandomString(4);
        const mc = RandomString(4);
        const mh = RandomString(4);
        const mf = RandomString(12);

        const farm = `${mb}-${md}-${mc}-${mh}-${mf}`;
        const db = RandomNumber(13);
        const nom = RandomNumber(19);

        // Random IP
        const z = Math.floor(Math.random() * 240) + 1;
        const x = Math.floor(Math.random() * 240) + 1;
        const c = Math.floor(Math.random() * 240) + 1;
        const v = Math.floor(Math.random() * 240) + 1;
        const ip = `${z}.${x}.${c}.${v}`;

        const datahash = crypto.createHash('sha256').update(nom).digest('hex');
        const aa = datahash.substring(0, 32);
        const datahassh = crypto.createHash('sha256').update(db).digest('hex');
        const aa2 = datahassh.substring(0, 32);
        const deviceFingerprint = `${mom}c2RtNjM2-cWNvbQ-`;

        const fingerprint = `${aa2}.${aa}.Xiaomi.${mon}`;
        const bbk = "/apis/merchant-insights/v3/auth/sendOtp";
        const url = `https://business-api.phonepe.com${bbk}`;
        const data0 = `{"type":"OTP","phoneNumber":"${phoneNumber}","deviceFingerprint":"${deviceFingerprint}"}`;
        const length = data0.length;

        const checksumValue = checksum(`${bbk}${data0}`);

        const headers = {
            "Host": "business-api.phonepe.com",
            "x-app-id": "bd309814ea4c45078b9b25bd52a576de",
            "x-merchant-id": "PHONEPEBUSINESS",
            "x-source-type": "PB_APP",
            "x-source-platform": "ANDROID",
            "x-source-locale": "en",
            "x-source-version": "1290004046",
            "fingerprint": fingerprint,
            "x-device-fingerprint": deviceFingerprint,
            "x-app-version": "0.4.46",
            "x-request-sdk-checksum": checksumValue,
            "content-type": "application/json; charset=utf-8",
            "content-length": length.toString(),
            "accept-encoding": "gzip",
            "user-agent": "okhttp/3.12.13",
            "X-Forwarded-For": ip
        };

        const response = await request(url, data0, 'POST', headers, 0);

        if (!response || response.trim() === '') {
            return {
                success: false,
                message: "Empty response from server",
                phoneNumber: phoneNumber
            };
        }

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(response);
        } catch (parseError) {
            return {
                success: false,
                message: "Invalid JSON response from server",
                phoneNumber: phoneNumber,
                rawResponse: response
            };
        }

        const token = jsonResponse.token;
        const expiryl = jsonResponse.expiry;

        if (expiryl === 600 || expiryl === "600") {
            const device = Buffer.from(`${fingerprint}||${deviceFingerprint}||${ip}`).toString('hex');
            return {
                success: true,
                message: "OTP sent successfully",
                phoneNumber: phoneNumber,
                token: token,
                device: device,
                expiry: expiryl
            };
        } else {
            return {
                success: false,
                message: "Failed to send OTP",
                phoneNumber: phoneNumber,
                error: jsonResponse.message || "Unknown error",
                response: jsonResponse
            };
        }

    } catch (error) {
        return {
            success: false,
            message: "Error sending OTP",
            phoneNumber: phoneNumber,
            error: error.message
        };
    }
}

async function verifyOTP(phoneNumber, otp, token, deviceData) {
    try {
        const device_data_bin = Buffer.from(deviceData, 'hex').toString();
        const ex = device_data_bin.split("||");
        const fingerprint = ex[0];
        const xdevicefingerprint = ex[1];
        const ip = ex[2];

        const mb = RandomString(8);
        const md = RandomString(4);
        const mc = RandomString(4);
        const mh = RandomString(4);
        const mf = RandomString(12);
        const farm = `${mb}-${md}-${mc}-${mh}-${mf}`;

        const bbk = "/apis/merchant-insights/v3/auth/login";
        const url = `https://business-api.phonepe.com${bbk}`;
        const fact2 = xdevicefingerprint.substring(0, 16);
        const g1 = fingerprint.split(".")[3];
        const osid = fingerprint.split(".")[0];
        const xdhp = fingerprint.split(".")[1];
        const milliseconds = Math.floor(Date.now());

        const data0 = `{"type":"OTP","clientContext":"{\\"device\\":{\\"identifier\\":{\\"macAddress\\":\\"00:00:00:00:00:00\\",\\"fact1\\":\\"\\",\\"fact2\\":\\"${fact2}\\",\\"fact3\\":\\"NA\\",\\"gd\\":{\\"g1\\":\\"${g1}\\"},\\"omid\\":\\"Xiaomi\\",\\"osid\\":\\"${osid}\\",\\"pid\\":\\"NA\\",\\"xdhp\\":\\"${xdhp}\\"},\\"location\\":{\\"latitude\\":0,\\"longitude\\":0,\\"confidence\\":0,\\"locs\\":-1},\\"network\\":{\\"ipv4\\":\\"${ip}\\",\\"ipv6\\":\\"NA\\",\\"bssid\\":\\"NA\\",\\"ssid\\":\\"<unknown ssid>\\",\\"essid\\":\\"NA\\",\\"ipm\\":1},\\"cellularNetwork\\":{\\"dualSim\\":false,\\"towers\\":[]},\\"security\\":{\\"as\\":false,\\"emulated\\":false,\\"rooted\\":false,\\"safetyNetScore\\":0.5,\\"dsec\\":1,\\"emuChk\\":false,\\"rck\\":{\\"a\\":false,\\"b\\":\\"\\"},\\"macct\\":{}},\\"software\\":{\\"os\\":{\\"name\\":\\"Android\\",\\"version\\":\\"30\\",\\"manu\\":\\"Xiaomi\\",\\"model\\":\\"Xiaomi\\",\\"buildTime\\":\\"${milliseconds}\\"}},\\"call\\":{\\"cs\\":0,\\"lcs\\":\\"0,\\",\\"vcs\\":0},\\"ui\\":{\\"doa\\":0,\\"doaN\\":[]}}}","deviceFingerprint":"${xdevicefingerprint}","otp":"${otp}","token":"${token}","phoneNumber":"${phoneNumber}"}`;

        const length = data0.length;
        const checksumValue = checksumopp(`${bbk}${data0}`);

        const headers = {
            "Host": "business-api.phonepe.com",
            "x-app-id": "bd309814ea4c45078b9b25bd52a576de",
            "x-merchant-id": "PHONEPEBUSINESS",
            "x-source-type": "PB_APP",
            "x-source-platform": "ANDROID",
            "x-source-locale": "en",
            "x-source-version": "1290004046",
            "fingerprint": fingerprint,
            "x-device-fingerprint": xdevicefingerprint,
            "x-app-version": "0.4.46",
            "x-request-sdk-checksum": checksumValue,
            "content-type": "application/json; charset=utf-8",
            "content-length": length.toString(),
            "accept-encoding": "gzip",
            "user-agent": "okhttp/3.12.13",
            "X-Forwarded-For": ip
        };

        const response = await request(url, data0, 'POST', headers, 0);

        if (!response || response.trim() === '') {
            return {
                success: false,
                message: "Empty response from server",
                phoneNumber: phoneNumber
            };
        }

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(response);
        } catch (parseError) {
            return {
                success: false,
                message: "Invalid JSON response from server",
                phoneNumber: phoneNumber,
                rawResponse: response
            };
        }

        const userId = jsonResponse.userId;
        const success = jsonResponse.success;
        const authToken = jsonResponse.token;
        const refreshToken = jsonResponse.refreshToken;
        const name = jsonResponse.name;

        if (success === true || success === "true") {
            // Refresh token call
            const bbk_refresh = "/apis/merchant-insights/v1/auth/refresh";
            const url_refresh = `https://business-api.phonepe.com${bbk_refresh}`;
            const data0_refresh = '{}';
            const length_refresh = data0_refresh.length;
            const checksum_refresh = checksum_2(`${bbk_refresh}${data0_refresh}`);

            const headers_refresh = {
                "Host": "business-api.phonepe.com",
                "x-refresh-token": refreshToken,
                "x-auth-token": authToken,
                "x-farm-request-id": farm,
                "x-app-id": "bd309814ea4c45078b9b25bd52a576de",
                "x-merchant-id": "PHONEPEBUSINESS",
                "x-source-type": "PB_APP",
                "x-source-platform": "ANDROID",
                "x-source-locale": "en",
                "x-source-version": "1290004046",
                "fingerprint": fingerprint,
                "x-device-fingerprint": xdevicefingerprint,
                "x-app-version": "0.4.46",
                "x-request-sdk-checksum": checksum_refresh,
                "content-type": "application/json; charset=utf-8",
                "content-length": length_refresh.toString(),
                "accept-encoding": "gzip",
                "user-agent": "okhttp/3.12.13",
                "X-Forwarded-For": ip
            };

            const refreshResponse = await request(url_refresh, data0_refresh, 'POST', headers_refresh, 0);
            let refreshJson = {};
            try {
                refreshJson = JSON.parse(refreshResponse);
            } catch (e) {
                console.log('Refresh token parse error:', e);
            }

            const newToken = refreshJson.token || authToken;
            const newRefreshToken = refreshJson.refreshToken || refreshToken;

            // Get merchant account info
            const bbk1 = "/apis/merchant-insights/v1/user/merchant/groupInfoList";
            const url1 = `https://business-api.phonepe.com${bbk1}`;
            const data01 = '{}';
            const checksum1 = checksum(`${bbk1}${data01}`);

            const headers1 = {
                "Host": "business-api.phonepe.com",
                "authorization": `Bearer ${newToken}`,
                "x-farm-request-id": farm,
                "content-type": "application/json",
                "x-app-id": "bd309814ea4c45078b9b25bd52a576de",
                "x-merchant-id": "PHONEPEBUSINESS",
                "x-source-type": "PB_APP",
                "x-source-platform": "ANDROID",
                "x-source-locale": "en",
                "x-source-version": "1290004046",
                "fingerprint": fingerprint,
                "x-device-fingerprint": xdevicefingerprint,
                "x-app-version": "0.4.46",
                "x-request-sdk-checksum": checksum1,
                "accept-encoding": "gzip",
                "user-agent": "okhttp/3.12.13",
                "X-Forwarded-For": ip
            };

            const merchantResponse = await request(url1, data01, 'GET', headers1, 0);
            let merchantData = {};
            console.log(JSON.stringify(merchantResponse));
            try {
                merchantData = JSON.parse(merchantResponse);
            } catch (e) {
                console.log('Merchant data parse error:', e);
            }

            return {
                success: true,
                message: "OTP verified successfully",
                phoneNumber: phoneNumber,
                userId: userId,
                name: name,
                token: newToken,
                refreshToken: newRefreshToken,
                merchantData: merchantData
            };

        } else {
            return {
                success: false,
                message: "Invalid OTP",
                phoneNumber: phoneNumber,
                error: jsonResponse.message || "OTP verification failed"
            };
        }

    } catch (error) {
        return {
            success: false,
            message: "Error verifying OTP",
            phoneNumber: phoneNumber,
            error: error.message
        };
    }
}

async function setMerchant(authToken, userGroupId, deviceData) {
    try {
        const device_data_bin = Buffer.from(deviceData, 'hex').toString();
        const ex = device_data_bin.split("||");
        const fingerprint = ex[0];
        const xdevicefingerprint = ex[1];
        const ip = ex[2];

        const mg = RandomString(8);
        const mh = RandomString(4);
        const mi = RandomString(4);
        const me = RandomString(4);
        const ma = RandomString(12);
        const sfarm = `${mg}-${mh}-${mi}-${me}-${ma}`;

        const mj = RandomString(11);
        const mk = RandomString(35);

        const bbk = "/apis/merchant-insights/v1/user/updateSession";
        const url = `https://business-api.phonepe.com${bbk}`;
        const data0 = `{"userGroupId":${userGroupId}}`;
        const length = data0.length;

        const checksumValue = checksum(`${bbk}${data0}`);

        const headers = {
            "Host": "business-api.phonepe.com",
            "authorization": `Bearer ${authToken}`,
            "x-farm-request-id": sfarm,
            "x-app-id": "bd309814ea4c45078b9b25bd52a576de",
            "x-merchant-id": "PHONEPEBUSINESS",
            "x-source-type": "PB_APP",
            "x-source-platform": "ANDROID",
            "x-source-locale": "en",
            "x-source-version": "1290004046",
            "fingerprint": fingerprint,
            "x-device-fingerprint": xdevicefingerprint,
            "x-app-version": "0.4.46",
            "x-request-sdk-checksum": checksumValue,
            "content-type": "application/json; charset=utf-8",
            "content-length": length.toString(),
            "accept-encoding": "gzip",
            "user-agent": "okhttp/3.12.13",
            "X-Forwarded-For": ip
        };

        const response = await request(url, data0, 'POST', headers, 0);

        if (!response || response.trim() === '') {
            return {
                success: false,
                message: "Empty response from server",
                operation: "setMerchant"
            };
        }

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(response);
        } catch (parseError) {
            return {
                success: false,
                message: "Invalid JSON response from server",
                operation: "setMerchant",
                rawResponse: response
            };
        }

        const success = jsonResponse.success;
        const token = jsonResponse.token;
        const refreshToken = jsonResponse.refreshToken;
        const groupValue = jsonResponse.groupValue;

        if (success === true || success === "true") {
            // Register device
            const bbk_device = "/apis/zencast/v1/device/register/appType/BUSINESS";
            const url_device = `https://business-api.phonepe.com${bbk_device}`;

            const data0_device = `{"deviceId":"${xdevicefingerprint}","cloudMessagingId":"${mj}:APA91bFoXn4MyT6MlF0IPiHtv-4LvGsXVlnyA1cwyTogpVWPkh04KtUoyXYObXISTIvzq0l-o6oJPzwK-5VcSsTQUMG9wk8caJ58${mk}","osName":"ANDROID","osVersion":"9","brand":"xiaomi","model":"Redmi","appName":"PHONEPEBUSINESS","appVersion":"0.4.46","appVersionCode":"1290004046"}`;
            const length_device = data0_device.length;

            const checksum_device = checksum_2(`${bbk_device}${data0_device}`);

            const headers_device = {
                "Host": "business-api.phonepe.com",
                "authorization": `Bearer ${authToken}`,
                "x-farm-request-id": sfarm,
                "x-app-id": "bd309814ea4c45078b9b25bd52a576de",
                "x-merchant-id": "PHONEPEBUSINESS",
                "x-source-type": "PB_APP",
                "x-source-platform": "ANDROID",
                "x-source-locale": "en",
                "x-source-version": "1290004046",
                "fingerprint": fingerprint,
                "x-device-fingerprint": xdevicefingerprint,
                "x-app-version": "0.4.46",
                "x-request-sdk-checksum": checksum_device,
                "content-type": "application/json; charset=utf-8",
                "content-length": length_device.toString(),
                "accept-encoding": "gzip",
                "user-agent": "okhttp/3.12.13",
                "X-Forwarded-For": ip
            };

            const deviceResponse = await request(url_device, data0_device, 'POST', headers_device, 0);

            let deviceJson = {};
            try {
                deviceJson = JSON.parse(deviceResponse);
            } catch (e) {
                console.log('Device registration parse error:', e);
            }

            return {
                success: true,
                message: "Merchant set successfully",
                operation: "setMerchant",
                token: token,
                refreshToken: refreshToken,
                groupValue: groupValue,
                deviceRegistration: deviceJson
            };
        } else {
            return {
                success: false,
                message: "Failed to set merchant",
                operation: "setMerchant",
                error: jsonResponse.message || "Unknown error",
                response: jsonResponse
            };
        }

    } catch (error) {
        return {
            success: false,
            message: "Error setting merchant",
            operation: "setMerchant",
            error: error.message
        };
    }
}

async function getHistory(token, refreshToken, deviceData, limit = 100) {
    try {
        const device_data_bin = Buffer.from(deviceData, 'hex').toString();
        const ex = device_data_bin.split("||");
        const fingerprint = ex[0];
        const xdevicefingerprint = ex[1];
        const ip = ex[2];

        const mb = RandomString(8);
        const md = RandomString(4);
        const mc = RandomString(4);
        const mh = RandomString(4);
        const mf = RandomString(12);
        const farm = `${mb}-${md}-${mc}-${mh}-${mf}`;

        // First refresh the token
        const bbk_refresh = "/apis/merchant-insights/v1/auth/refresh";
        const url_refresh = `https://business-api.phonepe.com${bbk_refresh}`;
        const data0_refresh = '{}';
        const length_refresh = data0_refresh.length;

        const checksum_refresh = checksum(`${bbk_refresh}${data0_refresh}`);

        const headers_refresh = {
            "Host": "business-api.phonepe.com",
            "x-refresh-token": refreshToken,
            "x-auth-token": token,
            "x-farm-request-id": farm,
            "x-app-id": "bd309814ea4c45078b9b25bd52a576de",
            "x-merchant-id": "PHONEPEBUSINESS",
            "x-source-type": "PB_APP",
            "x-source-platform": "ANDROID",
            "x-source-locale": "en",
            "x-source-version": "1290004046",
            "fingerprint": fingerprint,
            "x-device-fingerprint": xdevicefingerprint,
            "x-app-version": "0.4.46",
            "x-request-sdk-checksum": checksum_refresh,
            "content-type": "application/json; charset=utf-8",
            "content-length": length_refresh.toString(),
            "accept-encoding": "gzip",
            "user-agent": "okhttp/3.12.13",
            "X-Forwarded-For": ip
        };

        const refreshResponse = await request(url_refresh, data0_refresh, 'POST', headers_refresh, 0);

        if (!refreshResponse || refreshResponse.trim() === '') {
            return {
                success: false,
                message: "Empty response from token refresh",
                operation: "getHistory"
            };
        }

        let refreshJson;
        try {
            refreshJson = JSON.parse(refreshResponse);
        } catch (parseError) {
            return {
                success: false,
                message: "Invalid JSON response from token refresh",
                operation: "getHistory",
                rawResponse: refreshResponse
            };
        }

        const newToken = refreshJson.token;
        const newRefreshToken = refreshJson.refreshToken;

        if (!newToken) {
            return {
                success: false,
                message: "Invalid token received from refresh",
                operation: "getHistory",
                response: refreshJson
            };
        }

        // Now get transaction history
        const bbk = "/apis/merchant-insights/v3/transactions/list";
        const url = "https://business-api.phonepe.com/apis/merchant-insights/v3/transactions/list";

        const milliseconds = Math.floor(Date.now());
        // Default from date: 1672252200000 (Dec 29, 2022)
        const fromDate = 1672252200000;

        const data0 = `{"transactionType":"FORWARD","filters":{"status":["COMPLETED"],"merchantIds":[],"storeIds":[]},"from":${fromDate},"to":${milliseconds},"offset":0,"size":${limit}}`;

        const length = data0.length;
        const checksumValue = checksum_2(`${bbk}${data0}`);

        const headers = {
            "Host": "business-api.phonepe.com",
            "authorization": `Bearer ${newToken}`,
            "x-farm-request-id": farm,
            "x-app-id": "bd309814ea4c45078b9b25bd52a576de",
            "x-merchant-id": "PHONEPEBUSINESS",
            "x-source-type": "PB_APP",
            "x-source-platform": "ANDROID",
            "x-source-locale": "en",
            "x-source-version": "1290004046",
            "fingerprint": fingerprint,
            "x-device-fingerprint": xdevicefingerprint,
            "x-app-version": "0.4.46",
            "x-request-sdk-checksum": checksumValue,
            "content-type": "application/json; charset=utf-8",
            "content-length": length.toString(),
            "accept-encoding": "gzip",
            "user-agent": "okhttp/3.12.13",
            "X-Forwarded-For": ip
        };

        const historyResponse = await request(url, data0, 'POST', headers, 0);

        if (!historyResponse || historyResponse.trim() === '') {
            return {
                success: false,
                message: "Empty response from history API",
                operation: "getHistory"
            };
        }

        let historyJson;
        try {
            historyJson = JSON.parse(historyResponse);
        } catch (parseError) {
            return {
                success: false,
                message: "Invalid JSON response from history API",
                operation: "getHistory",
                rawResponse: historyResponse
            };
        }

        return {
            success: true,
            message: "History fetched successfully",
            operation: "getHistory",
            refresh: {
                refreshToken: newRefreshToken,
                token: newToken
            },
            data: historyJson
        };

    } catch (error) {
        return {
            success: false,
            message: "Error fetching history",
            operation: "getHistory",
            error: error.message
        };
    }
}

async function getUPIID(deviceData) {
    try {
        const device_data_bin = Buffer.from(deviceData, 'hex').toString();
        const ex = device_data_bin.split("||");
        const fingerprint = ex[0];
        const xdevicefingerprint = ex[1];
        const ip = ex[2];

        // Random strings for headers
        const mb = RandomString(8);
        const md = RandomString(4);
        const mc = RandomString(4);
        const mh = RandomString(4);
        const mf = RandomString(12);
        const farm = `${mb}-${md}-${mc}-${mh}-${mf}`;

        const bbk = "/apis/dp-ingestion-api/ingestion/v1/bulk";
        const url = `https://business-api.phonepe.com${bbk}`;

        // Event data for UPI ID detection
        const eventData = {
            "app": "ppe_business_android",
            "eventData": {
                "dateTime": new Date().toGMTString(),
                "mobileDataType": "wifi",
                "appVersion": "0.4.39",
                "AD_ID": "23d11af9-7215-4ae3-bc79-530d6974eeef",
                "autoRead": true,
                "latitude": 24.4781163,
                "MID": "",
                "OSName": "Android",
                "sessionId": RandomString(36),
                "storeId": "",
                "deviceId": xdevicefingerprint,
                "userId": "",
                "versionCode": 439,
                "isRooted": "false",
                "osVersion": "9",
                "networkCarrier": "airtel",
                "mobileModel": "Redmio",
                "deviceLanguage": "en-IN",
                "deviceModel": "Redmi",
                "deviceManufacturer": "Xiaomi",
                "fingerPrint": fingerprint,
                "brand": "xiaomi",
                "selectedLocaleCode": "en",
                "longitude": 88.0557271
            },
            "eventSchemaVersion": "v1",
            "eventType": "LOGIN_VERIFY_OTP",
            "groupingKey": RandomString(36),
            "id": RandomString(36),
            "time": Date.now().toString()
        };

        const data0 = JSON.stringify([eventData]);
        const length = data0.length;

        // Using a static checksum as in the PHP code
        const checksumValue = 'NzM4OEk1dHQyMzA5aXVPaC1hYTM4Z0tCZS1hMXFMQnh0Z0Vkd2g2WHU1aHJEU3lPODhubTY0cFVGNWwxK0E0L0ljdXNZekRLNDNUM2xTQVlneitlMUpETjNxdUFVaHF4L2t5OVp3PT0=';

        const headers = {
            "Host": "business-api.phonepe.com",
            "x-app-id": "bd309814ea4c45078b9b25bd52a576de",
            "x-merchant-id": "PHONEPEBUSINESS",
            "x-source-type": "PB_APP",
            "x-source-platform": "ANDROID",
            "x-source-locale": "en",
            "x-source-version": "1290004039",
            "fingerprint": fingerprint,
            "x-device-fingerprint": xdevicefingerprint,
            "x-app-version": "0.4.39",
            "x-request-sdk-checksum": checksumValue,
            "content-type": "application/json; charset=utf-8",
            "content-length": length.toString(),
            "accept-encoding": "gzip",
            "user-agent": "okhttp/3.12.13",
            "X-Forwarded-For": ip
        };

        const response = await request(url, data0, 'POST', headers, 0);

        if (!response || response.trim() === '') {
            return {
                success: false,
                message: "Empty response from server",
                operation: "getUPIID"
            };
        }

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(response);
        } catch (parseError) {
            // If response is not JSON, return as raw response
            return {
                success: true,
                message: "UPI ID data received",
                operation: "getUPIID",
                rawResponse: response,
                deviceInfo: {
                    deviceId: xdevicefingerprint,
                    fingerprint: fingerprint
                }
            };
        }

        return {
            success: true,
            message: "UPI ID data fetched successfully",
            operation: "getUPIID",
            data: jsonResponse,
            deviceInfo: {
                deviceId: xdevicefingerprint,
                fingerprint: fingerprint
            }
        };

    } catch (error) {
        return {
            success: false,
            message: "Error fetching UPI ID data",
            operation: "getUPIID",
            error: error.message
        };
    }
}

async function getMerchantGroups(authToken, refreshToken, deviceData) {
    try {
        // Generate random IP
        const z = Math.floor(Math.random() * 240) + 1;
        const x = Math.floor(Math.random() * 240) + 1;
        const c = Math.floor(Math.random() * 240) + 1;
        const v = Math.floor(Math.random() * 240) + 1;
        const ip = `${z}.${x}.${c}.${v}`;

        // Step 1: Refresh the token
        const bbk = "/apis/merchant-insights/v1/auth/refresh";
        const url = `https://business-api.phonepe.com${bbk}`;
        const data0 = '{}';
        const length = data0.length;
        const checksumValue = checksum_2(`${bbk}${data0}`);

        const device_data_bin = Buffer.from(deviceData, 'hex').toString();
        const ex = device_data_bin.split("||");
        const fingerprint = ex[0];
        const xdeviceFingerprint = ex[1];

        const mb = RandomString(8);
        const md = RandomString(4);
        const mc = RandomString(4);
        const mh = RandomString(4);
        const mf = RandomString(12);
        const farm = `${mb}-${md}-${mc}-${mh}-${mf}`;

        const headers = {
            "Host": "business-api.phonepe.com",
            "x-refresh-token": refreshToken,
            "x-auth-token": authToken,
            "x-farm-request-id": farm,
            "x-app-id": "bd309814ea4c45078b9b25bd52a576de",
            "x-merchant-id": "PHONEPEBUSINESS",
            "x-source-type": "PB_APP",
            "x-source-platform": "ANDROID",
            "x-source-locale": "en",
            "x-source-version": "1290004046",
            "fingerprint": fingerprint,
            "x-device-fingerprint": xdeviceFingerprint,
            "x-app-version": "0.4.46",
            "x-request-sdk-checksum": checksumValue,
            "content-type": "application/json; charset=utf-8",
            "content-length": length.toString(),
            "accept-encoding": "gzip",
            "user-agent": "okhttp/3.12.13",
            "X-Forwarded-For": ip
        };

        const userDetails = await request(url, data0, 'POST', headers, 0);
        const json0 = JSON.parse(userDetails);
        const token = json0.token;
        const newRefreshToken = json0.refreshToken;

        // Step 2: Get merchant group info
        const bbk1 = "/apis/merchant-insights/v1/user/groupSelection";
        const url1 = `https://business-api.phonepe.com${bbk1}`;
        const data01 = "";

        const checksum1 = checksumopp(`${bbk1}${data01}`);
        checksum1.slice(4)


        const headers1 = {
            "Host": "business-api.phonepe.com",
            "authorization": `Bearer ${authToken}`,
            "x-refresh-token": newRefreshToken,
            "x-auth-token": authToken,
            "x-farm-request-id": farm,
            "content-type": "application/json",
            "x-app-id": "bd309814ea4c45078b9b25bd52a576de",
            "x-merchant-id": "PHONEPEBUSINESS",
            "x-source-type": "PB_APP",
            "x-source-platform": "ANDROID",
            "x-source-locale": "en",
            "x-source-version": "1290004047",
            "fingerprint": fingerprint,
            "x-device-fingerprint": xdeviceFingerprint,
            "x-app-version": "0.4.46",
            "x-request-sdk-checksum": checksum1,
            "accept-encoding": "gzip",
            "user-agent": "okhttp/3.12.13",
            "X-Forwarded-For": ip
        };


        const userGroupNamespace = await request(url1, data01, 'GET', headers1, 0);

        return {
            success: true,
            message: "success",
            token: token,
            refreshToken: newRefreshToken,
            userGroupNamespace: {
                All: userGroupNamespace
            }
        };

    } catch (error) {
        return {
            success: false,
            message: "Error fetching merchant groups",
            operation: "getMerchantGroups",
            error: error.message
        };
    }
}

async function registerDevice(authToken, deviceData) {
    try {
        const device_data_bin = Buffer.from(deviceData, 'hex').toString();
        const ex = device_data_bin.split("||");
        const fingerprint = ex[0];
        const xdeviceFingerprint = ex[1];
        const ip = ex[2];

        // Generate random strings for identifiers
        const mom = RandomString(16);
        const mon = RandomString(64);
        const mo = RandomString(4);
        const ma = RandomString(12);
        const mb = RandomString(8);
        const mc = RandomString(4);
        const md = RandomString(4);
        const me = RandomString(4);
        const mf = RandomString(12);
        const mg = RandomString(8);
        const mh = RandomString(4);
        const mi = RandomString(4);
        const mj = RandomString(11);
        const mk = RandomString(35);

        const farm = `${mb}-${md}-${mc}-${mh}-${mf}`;
        const sfarm = `${mg}-${mh}-${mi}-${me}-${ma}`;

        const bbk = "/apis/zencast/v1/device/register/appType/BUSINESS";
        const url = `https://business-api.phonepe.com${bbk}`;

        const data0 = `{"deviceId":"${xdeviceFingerprint}","cloudMessagingId":"${mj}:APA91bFoXn4MyT6MlF0IPiHtv-4LvGsXVlnyA1cwyTogpVWPkh04KtUoyXYObXISTIvzq0l-o6oJPzwK-5VcSsTQUMG9wk8caJ58${mk}","osName":"ANDROID","osVersion":"9","brand":"xiaomi","model":"Redmi","appName":"PHONEPEBUSINESS","appVersion":"0.4.46","appVersionCode":"1290004046"}`;
        const length = data0.length;
        const checksumValue = checksum_2(`${bbk}${data0}`);

        const headers = {
            "Host": "business-api.phonepe.com",
            "authorization": `Bearer ${authToken}`,
            "x-farm-request-id": sfarm,
            "x-app-id": "bd309814ea4c45078b9b25bd52a576de",
            "x-merchant-id": "PHONEPEBUSINESS",
            "x-source-type": "PB_APP",
            "x-source-platform": "ANDROID",
            "x-source-locale": "en",
            "x-source-version": "1290004046",
            "fingerprint": fingerprint,
            "x-device-fingerprint": xdeviceFingerprint,
            "x-app-version": "0.4.46",
            "x-request-sdk-checksum": checksumValue,
            "content-type": "application/json; charset=utf-8",
            "content-length": length.toString(),
            "accept-encoding": "gzip",
            "user-agent": "okhttp/3.12.13",
            "X-Forwarded-For": ip
        };

        const response = await request(url, data0, 'POST', headers, 0);

        if (!response || response.trim() === '') {
            return {
                success: false,
                message: "Empty response from server",
                operation: "registerDevice"
            };
        }

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(response);
        } catch (parseError) {
            return {
                success: false,
                message: "Invalid JSON response from server",
                operation: "registerDevice",
                rawResponse: response
            };
        }

        return {
            success: true,
            message: "Device registered successfully",
            operation: "registerDevice",
            data: jsonResponse
        };

    } catch (error) {
        return {
            success: false,
            message: "Error registering device",
            operation: "registerDevice",
            error: error.message
        };
    }
}

module.exports = {
    sendOTP,
    verifyOTP,
    setMerchant,
    getHistory,
    getUPIID,
    getMerchantGroups,
    registerDevice
};

// exmple usage

function exampleUsage() {
    // login 

    var phoneNumber = "8509517215";

    // verify OTP
    var otp = "10473"; // replace with actual OTP received
    var deviceData = "61653730356538363639383939643731373436323866633939363531386561612e32316365653637316430663131326564333636363165626162396333313336642e5869616f6d692e376362313737653433373936356363373631346232643831386530626331656637386234366266313635363565656232353630666438353037373736313664367c7c64333235386365386661336238346337633252744e6a4d322d63574e7662512d7c7c3136342e3231372e3232322e3734";
    var authToken = "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";
    var refreshToken = "79e34f3890efc26cefa78b73e6d63023";

    getMerchantGroups(authToken, refreshToken, deviceData)
        .then(response => {
            console.log("Merchant Groups Response:", response);
        })
        .catch(error => {
            console.error("Error fetching merchant groups:", error);
        });

}


if (require.main === module) {
    exampleUsage();
}