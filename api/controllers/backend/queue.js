const { checkHDFCPendings } = require('../../controllers/backend/merchants/hdfc');
const { checkQuintusPayPendings } = require('../../controllers/backend/merchants/quintuspay');
const { checkPaytmPendings } = require('../../controllers/backend/merchants/paytm');
const { checkSBIMerchantPendings } = require('../../controllers/backend/merchants/sbimerchant');
const { checkFreechagrePendings } = require('../../controllers/backend/merchants/freecharge');
const { checkPhonepePendings } = require('../../controllers/backend/merchants/phonepe');
const { checkBharatpePendings } = require('../../controllers/backend/merchants/bharatpe');
const { checkGPayPendings } = require('../../controllers/backend/merchants/gpay');
const { getPhonePeMerchantsHistory } = require('../../controllers/backend/merchants/phoneperelogin');
// Schedule the HDFC pending transactions check every 5 minutes
setInterval(() => {
    checkHDFCPendings();
    checkPaytmPendings();
    checkSBIMerchantPendings();
    checkPhonepePendings();
    checkBharatpePendings();
    checkGPayPendings();
}, 2000); // 2 second interval 

setInterval(() => {
    checkQuintusPayPendings();
    checkFreechagrePendings();
}, 5000); // 5 second interval

setInterval(() => {
    getPhonePeMerchantsHistory();
}, 10 * 60 * 1000); // 10 minute interval

// Initial call to start the process immediately when the server starts
checkHDFCPendings();
checkQuintusPayPendings();
checkPaytmPendings();
checkPhonepePendings();
checkSBIMerchantPendings();
checkFreechagrePendings();
checkPhonepePendings();
checkBharatpePendings();