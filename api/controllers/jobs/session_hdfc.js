const db = require('../../controllers/db');
const axios = require("axios");
const { loginSession, verifyMPIN } = require('../../controllers/merchant/hdfc');

async function reloginHFDFCSessionAll() {
    try {
        // Fetch all HDFC merchants
        const [merchants] = await db.query(`SELECT * FROM merchants_hdfc`);

        if (merchants.length === 0) return;

        const promises = merchants.map(async (merchant) => {
            try {
                // Attempt to relogin and get new sessionId
                const loginResponse = await loginSession(merchant.phone_number, merchant.deviceid);
                const mpinResponse = await verifyMPIN(merchant.phone_number, merchant.pin, loginResponse.sessionId);

                if (mpinResponse.status === 'Success') {
                    // MPIN verification successful - update sessionId and set status to active
                    await db.execute(
                        `UPDATE merchants_hdfc SET sessionId = ?, merchant_status = ? WHERE merchant_txnid = ?`,
                        [loginResponse.sessionId, 'true', merchant.merchant_txnid]
                    );
                    // console.log(`Successfully updated session for merchant: ${merchant.merchant_txnid}`);
                } else {
                    // MPIN verification failed - set status to false
                    await db.execute(
                        `UPDATE merchants_hdfc SET merchant_status = ? WHERE merchant_txnid = ?`,
                        ['false', merchant.merchant_txnid]
                    );
                    // console.log(`MPIN verification failed for merchant: ${merchant.merchant_txnid}`);
                }
            } catch (error) {
                // Any error during the process - set status to false
                await db.execute(
                    `UPDATE merchants_hdfc SET merchant_status = ? WHERE merchant_txnid = ?`,
                    ['false', merchant.merchant_txnid]
                );
                console.error(`Error for merchant ${merchant.merchant_txnid}:`, error.message);
            }
        });

        await Promise.all(promises);
        // console.log('Relogin process completed for all HDFC merchants');
    } catch (error) {
        console.error('Error in reloginHFDFCSessionAll:', error);
    }
}

module.exports = {
    reloginHFDFCSessionAll
};

