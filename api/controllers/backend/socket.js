const db = require('../../controllers/db');

function setupPaymentSocket(io) {
    io.on('connection', (socket) => {

        socket.on('init-payment', async (data, callback) => {
            const { orderid } = data;

            if (!orderid) {
                return callback({
                    status: false,
                    message: 'Order ID is required'
                });
            }

            try {
                const [rows] = await db.query('SELECT * FROM transactions WHERE orderid = ?', [orderid]);

                if (rows.length === 0) {
                    return callback({
                        status: false,
                        message: 'Transaction not found'
                    });
                }

                const transaction = rows[0];

                socket.join(`payment_${orderid}`);

                // ---- SEND INITIAL RESPONSE ----
                sendTransactionUpdate(socket, transaction, callback);

                // ---- START LOOP ONLY IF STATUS IS PENDING ----
                if (transaction.status === "Pending") {

                    const intervalId = setInterval(async () => {
                        try {
                            // Fetch updated status on every loop
                            const [updatedRows] = await db.query('SELECT * FROM transactions WHERE orderid = ?', [orderid]);
                            const updated = updatedRows[0];

                            sendTransactionUpdate(socket, updated);


                        } catch (e) {
                            console.error("Polling error:", e);
                        }

                    }, 1000); // run every 1 second

                    // Clear interval when user disconnects
                    socket.on('disconnect', () => {
                        clearInterval(intervalId);
                    });

                }

            } catch (error) {
                console.error('Error initializing payment:', error);
                callback({
                    status: false,
                    message: 'Internal Server Error'
                });
            }
        });

    });
}

function sendTransactionUpdate(socket, transaction, callback = null) {
    if (!transaction.expires_at) return;
    const expiryTime = new Date(transaction.expires_at);
    const now = new Date();
    const remaining = Math.max(0, Math.floor((expiryTime - now) / 1000));

    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const seconds = String(remaining % 60).padStart(2, '0');

    const payload = {
        status: true,
        message: "Transaction updated",
        data: {
            status: transaction.status,
            expires_at: transaction.expires_at,
            redirect_url: transaction.redirect_url,
            remaining_time: `${minutes}:${seconds}`
        }
    };

    // For first response (callback)
    if (callback) return callback(payload);

    // For loop updates
    socket.to(`payment_${transaction.orderid}`).emit("payment-update", payload);
    socket.emit("payment-update", payload);
}

module.exports = setupPaymentSocket;
