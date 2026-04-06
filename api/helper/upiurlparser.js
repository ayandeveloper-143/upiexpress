const axios = require("axios");
const e = require("express");

function parseTLV(payload) {
    let i = 0;
    const out = {};
    while (i + 4 <= payload.length) {
        const tag = payload.substring(i, i + 2);
        const lenStr = payload.substring(i + 2, i + 4);
        if (!/^\d{2}$/.test(lenStr)) break;
        const len = parseInt(lenStr, 10);
        const value = payload.substring(i + 4, i + 4 + len);
        out[tag] = out[tag] || [];
        out[tag].push(value);
        i += 4 + len;
    }
    return out;
}

function findVPAFromNested(value) {
    let i = 0;
    while (i + 4 <= value.length) {
        const len = parseInt(value.substring(i + 2, i + 4), 10);
        const val = value.substring(i + 4, i + 4 + len);
        if (val && /@/.test(val)) return val;
        i += 4 + len;
    }
    return null;
}

function extractFields(parsed) {
    const result = {};
    const nestedTags = ["26", "27", "12", "51", "25", "30"];

    for (const t of nestedTags) {
        if (parsed[t]) {
            for (const v of parsed[t]) {
                const vpa = findVPAFromNested(v);
                if (vpa) {
                    result.vpa = vpa;
                    break;
                }
                if (/@/.test(v)) {
                    result.vpa = v;
                    break;
                }
            }
        }
        if (result.vpa) break;
    }

    if (parsed["59"]) result.name = parsed["59"][0];
    if (parsed["60"]) result.city = parsed["60"][0];
    if (parsed["54"]) result.amount = parsed["54"][0];

    return result;
}

async function decodeUpiPayload(url) {
    const z = await axios.get(
        `https://zxing.org/w/decode?u=${encodeURIComponent(url)}`,
        { timeout: 15000 }
    );

    const html = z.data;

    // extract <pre>...</pre>
    const match = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);

    if (!match) return false;

    const payload = match[1].trim();

    try {
        const parsed = parseTLV(payload);
        const fields = extractFields(parsed);
        return fields.vpa || false;
    } catch {
        return false;
    }
}

module.exports = {
    decodeUpiPayload,
};
