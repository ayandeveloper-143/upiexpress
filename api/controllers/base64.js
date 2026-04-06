const { Jimp } = require("jimp");
const QRCodeReader = require("qrcode-reader");

function parseTLV(str) {
    const result = {};
    let i = 0;

    while (i + 4 <= str.length) {
        const tag = str.substr(i, 2);
        const lenStr = str.substr(i + 2, 2);
        const len = parseInt(lenStr, 10);

        if (isNaN(len) || i + 4 + len > str.length) {
            break; // invalid / corrupted, stop parsing
        }

        const value = str.substr(i + 4, len);
        result[tag] = value;
        i += 4 + len;
    }

    return result;
}

async function decodeUPIFromBase64(base64) {

    try {
        const img = await Jimp.read(Buffer.from(base64, "base64"));
        const qr = new QRCodeReader();

        return new Promise((resolve, reject) => {
            qr.callback = (err, value) => {
                if (err || !value) return reject("QR decode failed");

                const data = value.result; // full EMV string
                let tr = null;
                let ref07 = null;

                // 1) Top-level TLV parse
                const tlv = parseTLV(data);

                // 2) Tag 62 ke andar nested TLV hai
                if (tlv["62"]) {
                    const sub = parseTLV(tlv["62"]);

                    if (sub["05"]) {
                        tr = sub["05"];      // transaction reference
                    }

                    if (sub["07"]) {
                        ref07 = sub["07"];   // internal ref
                    }
                }

                resolve({ tr, ref07, raw: data });
            };

            qr.decode(img.bitmap);
        });
    } catch (error) {
        return false;
    }
}

module.exports = { decodeUPIFromBase64 };
