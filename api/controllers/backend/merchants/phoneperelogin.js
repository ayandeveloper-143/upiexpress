const { getHistory } = require('../../merchant/phonepe');
const db = require('../../db');
const axios = require("axios");

// Get all PhonePe merchants and retrieve history one time only
async function getPhonePeMerchantsHistory() {
    try {
        // Fetch all PhonePe merchants
        const [merchants] = await db.query(`SELECT * FROM merchants_phonepe`);

        if (merchants.length === 0) {
            return {
                success: false,
                message: 'No PhonePe merchants found',
                data: []
            };
        }

        const merchantsData = [];

        for (let merchant of merchants) {
            try {
                // Fetch transaction history for each merchant
                const history = await getHistory(
                    merchant.auth_token,
                    merchant.refresh_token,
                    merchant.device_data
                );

                if (history.success) {
                    // Update tokens if refreshed
                    if (history.refresh.token && history.refresh.refreshToken) {
                        await db.execute(
                            `UPDATE merchants_phonepe SET auth_token = ?, refresh_token = ? WHERE merchant_txnid = ?`,
                            [history.refresh.token, history.refresh.refreshToken, merchant.merchant_txnid]
                        );
                    }

                    merchantsData.push({
                        merchant_txnid: merchant.merchant_txnid,
                        success: true,
                        transactions_count: history.data.data.results ? history.data.data.results.length : 0,
                        history: history.data
                    });
                } else {
                    merchantsData.push({
                        merchant_txnid: merchant.merchant_txnid,
                        success: false,
                        error: 'Failed to fetch history'
                    });
                }
            } catch (error) {
                console.error(`Error fetching history for merchant ${merchant.merchant_txnid}:`, error);
                merchantsData.push({
                    merchant_txnid: merchant.merchant_txnid,
                    success: false,
                    error: error.message
                });
            }
        }

        return {
            success: true,
            message: 'Merchant histories retrieved',
            data: merchantsData
        };
    } catch (error) {
        console.error('Error getting PhonePe merchants history:', error);
        return {
            success: false,
            message: error.message,
            data: []
        };
    }
}

exports.getPhonePeMerchantsHistory = getPhonePeMerchantsHistory;


