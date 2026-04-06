const https = require('https');

function fetchGooglePayHistory(FREQ_RAW, COOKIE, AT) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'srv1070916.hstgr.cloud',
            path: '/gpay/history.php',
            method: 'POST',
            headers: {
                'at': AT,
                'content-type': 'application/json',
                'cookies': COOKIE
            },
            timeout: 30000
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result);
                } catch (error) {
                    resolve({
                        status: 'error',
                        message: 'Failed to parse response',
                        raw_response: data
                    });
                }
            });
        });

        req.on('error', (error) => {
            resolve({
                status: 'error',
                message: `Request error: ${error.message}`
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                status: 'error',
                message: 'Request timeout'
            });
        });

        // Send the FREQ_RAW data as JSON
        req.write(FREQ_RAW);
        req.end();
    });
}

// // Usage example:
// const FREQ_RAW = JSON.stringify([
//     [
//         [
//             "RPtkab",
//             "[\"BCR2DN4TU2AP5QCB\",null,[null,10],1,null,1]",
//             null,
//             "4"
//         ]
//     ]
// ]);

// const COOKIE = 'SID=g.a0003giBnk8FWFNix9rZxblSm11WSAnDo-cIdNM7s0Un4O2o3UWYtmkzNE1IrDdbVt3CRQKX_AACgYKAYoSARISFQHGX2Mivr4G4aOQplTRa5NzZ20MLhoVAUF8yKrZg43_LfPs6aEeMTOR1nOJ0076; __Secure-1PSID=g.a0003giBnk8FWFNix9rZxblSm11WSAnDo-cIdNM7s0Un4O2o3UWYYwh3_fIJHFzTXDSJOB9KIgACgYKATESARISFQHGX2MieVLc5JgJtb-x-4TTlghbAxoVAUF8yKqH6iaLIKjsj4ECQxW4YNYY0076; __Secure-3PSID=g.a0003giBnk8FWFNix9rZxblSm11WSAnDo-cIdNM7s0Un4O2o3UWY9yrt6Ex1EFEMI_pvL2Ad7QACgYKAb4SARISFQHGX2Mi95V0dtbqCkN660qfhp9YtRoVAUF8yKp9e7Bfv4D0-JHrXjw9F14W0076; HSID=ADdNGKvFEaoRP825W; SSID=AAzFW9mnMOhHSre82; APISID=bx-dvCDcl9T2j-FR/AHzhuZ6A0SHGs284W; SAPISID=G9aMlFT7x1KBFo9T/AxJbPZjhO3lHqN98y; __Secure-1PAPISID=G9aMlFT7x1KBFo9T/AxJbPZjhO3lHqN98y; __Secure-3PAPISID=G9aMlFT7x1KBFo9T/AxJbPZjhO3lHqN98y; NID=526=cvRy-wttMoT9KSV_HUVb4mG8YsynBIeUjx6s44ItcHnFwH12TMNF_1A8ymC1r0UpD6usfORNaqGo4Q5BIFjhW0uGMjb0nBJxwul0V33TAuS76njdg7Lga15Boh8jSh67_oG1jjhRbvdZUnlwYlEwhgKujCxqUGK5-qtDCxxXA7ql8r4x9cWtXuooFcmMQ7XO-o6N-0g3kkSnOglGy50zP0NsTw5eXPpfIoMld-VOBxMY4ymCPMZZHdE; OSID=g.a0003giBntB2k_u3U_TmEFPODqKetvZlwVqbYGgUlWj72A08wqw5egnsLi3JOLRMIMU9mIbjRgACgYKAbYSARISFQHGX2Mi6pECob73eYwJJ6kaFK5nhRoVAUF8yKqaPE7gHlE8qe_soT6OSfZx0076; __Secure-OSID=g.a0003giBntB2k_u3U_TmEFPODqKetvZlwVqbYGgUlWj72A08wqw5j6CG1NdxoAmOj0f_cqbPSwACgYKAbESARISFQHGX2MiJlqt1WF6EfIXeyLpU-6CqhoVAUF8yKrbSyHU34XWpOYKePYfMi0f0076; _ga=GA1.1.1579264573.1763651898; OTZ=8355798_34_34__34_; _ga_5WYRGW7L7J=GS2.1.s1763651897$o1$g1$t1763652156$j18$l0$h0; SIDCC=AKEyXzXQsTQrcMqruNvAxs4ucxldRhe9lwnLBWktaxwxrR8PyuRNMMzx5YNBLXrO-flmTG95; __Secure-1PSIDCC=AKEyXzWBH544K85KDPL5kG1g_9GQCwWS-u1Eo7AUDoPuv0lLNtF2Uv6v0iMMXbqkZYuwfFsM; __Secure-3PSIDCC=AKEyXzU2a_aYJeYtnUK_VC8mGHqcp7UARFGIxJ4_ZqVEv-XZbM4dROLpG0b4Ff6QTo6kcTCE';

// const AT = 'ALbA-cbXqd4vgkekN6JXFLveuY2u:1763652125530';

// fetchGooglePayHistory(FREQ_RAW, COOKIE, AT)
//     .then(result => {
//         console.log(JSON.stringify(result, null, 2));
//     })
//     .catch(error => {
//         console.error('Error:', error);
//     });

module.exports = { fetchGooglePayHistory };