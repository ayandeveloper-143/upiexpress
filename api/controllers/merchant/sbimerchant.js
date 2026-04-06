const crypto = require('crypto');

const sbiversion = "2.3.32";

function randomString(length) {
    let key = '';
    const keys = '9876543210abcdef'.split('');
    for (let i = 0; i < length; i++) {
        key += keys[Math.floor(Math.random() * keys.length)];
    }
    return key;
}

function randomNumber(length) {
    let str = "";
    for (let i = 0; i < length; i++) {
        str += Math.floor(Math.random() * 10);
    }
    return str;
}

function getRandIp() {
    const z = Math.floor(Math.random() * 240) + 1;
    const x = Math.floor(Math.random() * 240) + 1;
    const c = Math.floor(Math.random() * 240) + 1;
    const v = Math.floor(Math.random() * 240) + 1;
    return `${z}.${x}.${c}.${v}`;
}

async function curlRequest(method = null, url, postData = null, headers = [], hreturn = false, cookie = false, cookieType = 'w', timeout = 0, ssl = false) {
    const options = {
        method: method || (postData ? 'POST' : 'GET'),
        headers: {
            ...Object.fromEntries(headers.map(h => {
                const [key, value] = h.split(': ');
                return [key, value];
            })),
            'user-agent': 'okhttp/3.12.13'
        }
    };

    if (postData) {
        options.body = postData;
        if (typeof postData === 'object') {
            options.body = JSON.stringify(postData);
            options.headers['Content-Type'] = 'application/json';
        }
    }

    if (ssl) {
        options.rejectUnauthorized = false;
    }

    try {
        const response = await fetch(url, options);

        if (hreturn) {
            return {
                headers: Object.fromEntries(response.headers),
                body: await response.text()
            };
        }

        return await response.text();
    } catch (error) {
        throw new Error(`cURL request failed: ${error.message}`);
    }
}

// Login function
async function loginYonosbi(password, mid) {
    try {
        // Step 1: User Validation
        const validationResponse = await getUserValidation(mid);
        const validationData = JSON.parse(validationResponse);

        if (!validationData.Result || !validationData.Result[0] || !validationData.Result[0].ExistingUser) {
            return {
                success: false,
                error: 'Invaild Merchant ID or User does not exist',
                response: validationData
            };
        }

        // Step 2: Merchant Login
        const loginResponse = await getMerchantLogin(mid, password);
        const loginData = JSON.parse(loginResponse);
        if (!loginData.Result || !loginData.Result[0] || !loginData.Result[0].MID || loginData.Result[0].MID !== mid) {
            return {
                success: false,
                error: loginData.Result[0].Message || 'Login failed, please check your credentials',
                response: loginData
            };
        }

        return {
            success: true,
            data: loginData.Result[0]
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Get History function
async function getHistory(mid, finaltid, guid) {
    try {
        const historyResponse = await getMerchantTransaction(mid, finaltid, guid);
        const historyData = JSON.parse(historyResponse);

        return {
            success: true,
            data: historyData
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Helper functions
async function getUserValidation(merchant_username) {
    const ip = getRandIp();

    const postData = {
        'UserID': merchant_username,
        'UUID': merchant_username,
        'version': sbiversion,
        'lang': "en"
    };

    const url = "https://merchantapp.hitachi-payments.com/YMAVOLBP/MercMobAppResAPI/RestService.svc/UserValidation";
    const headers = [
        `Content-Type: application/json`,
        `X-Forwarded-For: ${ip}`
    ];

    return await curlRequest("POST", url, postData, headers, false, false, false, 0, true);
}

async function getMerchantLogin(merchant_username, merchant_password) {
    const s1 = crypto.createHash('sha256').update(randomNumber(13)).digest('hex').substring(0, 32);
    const s2 = crypto.createHash('sha256').update(randomNumber(19)).digest('hex').substring(0, 32);
    const deviceFingerprint = randomString(16) + 'c2RtNjM2-cWNvbQ-';
    const fingerprint = `${s1}.${s2}.Xiaomi.${randomString(64)}`;

    const ip = getRandIp();

    const postData = {
        'username': merchant_username,
        'password': `${merchant_password}|LOGIN`,
        'UUID': merchant_username,
        'mpin': "",
        'guid': "",
        'IPAddress': "",
        'MobileInfo': `Version.release : 11, Version.incremental : V12.5.1.0.${randomString(6)}, Version.sdk.number : 31, Board : Raphaelin, Bootloader : Unknown, Brand : Xiaomi, Cpu_abi : Arm64v8a, Cpu_abi2 : , Display : Rkq1.200826.002 Testkeys, Fingerprint : ${fingerprint}, Hardware : Qcom, Host : ${deviceFingerprint}, Id : Rkq1.200826.002, Manufacturer : Xiaomi, Model : Redmi 7, Product : Raphaelin, Serial : Unknown, Tags : Releasekeys, Type : User, Unknown : Unknown, User : Builder, App Version: ${sbiversion}`,
        'version': sbiversion,
        'lang': "en"
    };

    const url = "https://merchantapp.hitachi-payments.com/YMAVOLBP/MercMobAppResAPI/RestService.svc/Login";
    const headers = [
        `Content-Type: application/json`,
        `X-Forwarded-For: ${ip}`
    ];

    return await curlRequest("POST", url, postData, headers, false, false, false, 0, true);
}

async function getMerchantTransaction(mid, finaltid, guid) {
    const ip = getRandIp();

    const postData = {
        'MerchantID': mid,
        'TID': finaltid,
        'GUID': guid,
        'UserName': mid,
        'lang': "en"
    };

    const url = "https://merchantapp.hitachi-payments.com/YMAVOLBP/MercMobAppResAPI/RestService.svc/GetLast7Transaction";
    const headers = [
        `Content-Type: application/json`,
        `X-Forwarded-For: ${ip}`
    ];

    return await curlRequest("POST", url, postData, headers, false, false, false, 0, true);
}

// Export functions for use in other modules
module.exports = {
    loginYonosbi,
    getHistory
};

