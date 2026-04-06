const axios = require('axios');

const commonHeaders = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'Connection': 'keep-alive',
    'Content-Type': 'application/json',
    'Cookie': '_ga=GA1.1.1121811049.1763794589; _ga_HDB81BXEN0=GS2.1.s1763794588$o1$g0$t1763794591$j57$l0$h0',
    'Origin': 'https://bapa-api.quintustech.in',
    'Referer': 'https://bapa-api.quintustech.in/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
    'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"'
};

// Send OTP - phone number input
async function sendOtp(phoneNumber) {
    try {
        console.log('Sending OTP to:', phoneNumber);
        const response = await axios.post(
            'https://bapa-api.quintustech.in/api/qt/user/sendOtp',
            { authid: phoneNumber },
            {
                headers: commonHeaders,
                timeout: 10000
            }
        );

        return response.data;
    } catch (error) {
        console.error('Error sending OTP:', error.response?.data || error.message);
        throw error;
    }
}

// Verify OTP - phone number and OTP input
async function verifyOtp(phoneNumber, otp) {
    try {
        console.log('Verifying OTP:', { phoneNumber, otp });

        const response = await axios.post(
            'https://bapa-api.quintustech.in/api/qt/user/verifyOtp',
            {
                authid: phoneNumber.toString(),
                otp: otp.toString()
            },
            {
                headers: commonHeaders,
                timeout: 10000
            }
        );



        return response.data;
    } catch (error) {
        console.error('Error verifying OTP:');
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data);
        console.error('Message:', error.message);
        throw error;
    }
}

// Get UPI - accessToken input
async function getUPI(accessToken) {
    try {
        const headers = {
            ...commonHeaders,
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        };

        const response = await axios.get(
            'https://bapa-api.quintustech.in/api/qt/user/fetchQr',
            {
                headers,
                timeout: 10000
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error getting UPI:', error.response?.data || error.message);
        throw error;
    }
}

// Get History - accessToken, startDate, endDate input
async function getHistory(accessToken, startDate, endDate) {
    try {
        const headers = {
            ...commonHeaders,
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
        };

        const response = await axios.post(
            'https://bapa-api.quintustech.in/api/qt/transaction/getList',
            {
                startDate,
                endDate,
                transactionType: ["UPI_RESOLUTION"],
                selectedStatus: []
            },
            {
                headers,
                timeout: 10000
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error getting history:', error.response?.data || error.message);
        throw error;
    }
}



// Alternative test with user input for OTP
async function testWithInput() {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    try {
        // const phoneNumber = '8509517215';

        // console.log('=== SENDING OTP ===');
        // const otpResult = await sendOtp(phoneNumber);
        // console.log('OTP Send Result:', otpResult);

        // // Get OTP from user input
        // const otp = await new Promise((resolve) => {
        //     readline.question('Enter OTP received: ', (input) => {
        //         resolve(input);
        //     });
        // });

        // console.log('=== VERIFYING OTP ===');
        // const verifyResult = await verifyOtp(phoneNumber, otp);
        // console.log('Verify Result:', verifyResult);

        // console.log('=== GETTING UPI ===');
        // const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjM4MTY3MTYsImV4cCI6MTc2NjQwODcxNiwiYXVkIjoiNjkxNmVlNjM2ZmFmMGNkYTEwNmU3NjU2IiwiaXNzIjoicXVpbnR1c3RlY2guaW4ifQ.sofqtfWKmGIOzbiM5XC0axKmibA48dnhHwSwVLgCnXQ';
        // // const upiResult = await getUPI(accessToken);
        // // console.log('UPI Result:', upiResult);


        // console.log('=== GETTING HISTORY ===');
        // const startDate = '2025-11-25';
        // const endDate = '2025-11-25';
        // const historyResult = await getHistory(accessToken, startDate, endDate);
        // console.log('History Result:', JSON.stringify(historyResult, null, 2));
    } catch (error) {
        console.error('Test failed:', error.message);
    } finally {
        readline.close();
    }
}

module.exports = { sendOtp, verifyOtp, getUPI, getHistory };

