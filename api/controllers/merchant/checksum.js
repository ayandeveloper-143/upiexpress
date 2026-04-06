const crypto = require('crypto');

function RandomString(length) {
    const keys = [...'9876543210abcdef'];
    let key = '';
    for (let i = 0; i < length; i++) {
        key += keys[Math.floor(Math.random() * keys.length)];
    }
    return key;
}

function keygen(advid) {
    const ket = "1lgVNAAtWyq06UfYjM/UBnJ5ZSA=";
    const aa1 = ket.substring(0, 1);
    const a1 = ket.substring(1, 2);
    const a2 = ket.substring(2, 3);
    const a3 = ket.substring(3, 4);
    const a4 = ket.substring(4, 5);
    const a5 = ket.substring(5, 6);
    const a6 = ket.substring(6, 7);
    const a7 = ket.substring(7, 8);
    const a8 = ket.substring(8, 9);
    const a9 = ket.substring(9, 10);
    const a10 = ket.substring(10, 11);
    const a11 = ket.substring(11, 12);
    const a12 = ket.substring(12, 13);
    const a13 = ket.substring(13, 14);
    const a14 = ket.substring(14, 15);
    const a15 = ket.substring(15, 16);

    const adv = advid;
    const aa = adv.substring(0, 1);
    const ab = adv.substring(1, 2);
    const ac = adv.substring(2, 3);
    const ad = adv.substring(3, 4);
    const ae = adv.substring(4, 5);
    const af = adv.substring(5, 6);
    const ag = adv.substring(6, 7);
    const ah = adv.substring(7, 8);
    const ai = adv.substring(8, 9);
    const aj = adv.substring(9, 10);
    const ak = adv.substring(10, 11);
    const al = adv.substring(11, 12);
    const am = adv.substring(12, 13);
    const an = adv.substring(13, 14);
    const ao = adv.substring(14, 15);
    const ap = adv.substring(15, 16);

    const str = `${aa1}${aa}${a1}${ab}${a2}${ac}${a3}${ad}${a4}${ae}${a5}${af}${a6}${ag}${a7}${ah}${a8}${ai}${a9}${aj}${a10}${ak}${a11}${al}${a12}${am}${a13}${an}${a14}${ao}${a15}${ap}`;
    return str;
}

function encryptt(data, hkey) {
    // Fix for deprecated createCipher - use createCipheriv instead
    const key = hkey.slice(0, 16); // Use first 16 bytes for AES-128
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    cipher.setAutoPadding(true);

    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return encrypted;
}

function fnalsing(advid, enc) {
    const ket = enc;
    const aa1 = ket.substring(0, 4);
    const a1 = ket.substring(4, 8);
    const a2 = ket.substring(8, 12);
    const a3 = ket.substring(12);

    const adv = advid;
    const aa = adv.substring(0, 4);
    const ab = adv.substring(4, 8);
    const ac = adv.substring(8, 12);
    const ad = adv.substring(12, 16);

    const str = Buffer.from(`${aa}${aa1}${ab}${a1}${ac}${a2}${ad}${a3}`).toString('base64');
    return str;
}

function checksum(data) {
    const mb = RandomString(8);
    const md = RandomString(4);
    const mc = RandomString(4);
    const mh = RandomString(4);
    const mf = RandomString(12);

    const advikey = `${mb}-${md}-${mc}-${mh}-${mf}`;

    const keytry = keygen(advikey);
    const aeskey = crypto.createHash('sha1').update(keytry).digest();

    const datahash = crypto.createHash('sha256').update(data).digest('base64');
    const milliseconds = Math.floor(Date.now());

    const encc = encryptt(`${milliseconds}###${datahash}`, aeskey);
    const fainalsungeture = fnalsing(advikey, encc);

    return fainalsungeture;
}

function checksumopp(data) {
    return checksum(data); // Same implementation
}

function checksum_2(data) {
    return checksum(data); // Same implementation
}

module.exports = {
    checksum,
    checksumopp,
    checksum_2
};