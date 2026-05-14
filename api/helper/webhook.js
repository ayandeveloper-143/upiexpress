const db = require('../controllers/db');
const axios = require('axios');

async function sendTransactionWebhookOnce(txnId, webhookUrl, payload) {
    if (!webhookUrl) {
        return { ok: false, skipped: true, reason: 'missing_webhook' };
    }

    const [claim] = await db.execute(
        `UPDATE transactions
         SET webhook_status = 'Pending', webhook_statusCode = -1
         WHERE txn_id = ?
           AND webhook_status IN ('Pending', 'Failed')
           AND (webhook_statusCode IS NULL OR webhook_statusCode <> -1)`,
        [txnId]
    );

    if (!claim || claim.affectedRows === 0) {
        return { ok: false, skipped: true, reason: 'already_claimed' };
    }

    try {
        const response = await axios.post(webhookUrl, payload, { timeout: 10000 });
        await db.execute(
            `UPDATE transactions
             SET webhook_status = ?, webhook_statusCode = ?
             WHERE txn_id = ?`,
            ['Sent', response.status, txnId]
        );
        return { ok: true, skipped: false };
    } catch (err) {
        await db.execute(
            `UPDATE transactions
             SET webhook_status = ?, webhook_statusCode = ?
             WHERE txn_id = ?`,
            ['Failed', err.response ? err.response.status : 500, txnId]
        );
        return { ok: false, skipped: false, reason: 'send_failed' };
    }
}

module.exports = {
    sendTransactionWebhookOnce
};
