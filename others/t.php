<?php
// Permanent Cloudflare Bypass for Workers
$url = "https://frecharge-token.developer-dhanyainfotech.workers.dev/";

// Try multiple times until success
for($attempt = 1; $attempt <= 30; $attempt++) {
    $response = makeRequest($url, $attempt);
    
    if($response && isValidResponse($response)) {
        echo $response;
        exit;
    }
    
    // Wait between attempts
    sleep(1);
}

echo '{"status_code":500,"status":"error","message":"All attempts failed"}';

function makeRequest($url, $attempt) {
    $ch = curl_init();
    
    // Different headers for each attempt
    $headers = getHeaders($attempt);
    
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_ENCODING => 'gzip, deflate',
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_COOKIEJAR => 'cf_cookies.txt',
        CURLOPT_COOKIEFILE => 'cf_cookies.txt',
        CURLOPT_HEADER => true
    ]);
    
    $full_response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    
    if($full_response) {
        $header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $body = substr($full_response, $header_size);
        
        // If got Cloudflare challenge, retry with cookies
        if(strpos($full_response, 'cf-chl-bypass') !== false || 
           strpos($full_response, 'cf-browser-verification') !== false ||
           $http_code == 403) {
            // Save challenge and retry
            file_put_contents('cf_challenge.html', $full_response);
            $body = retryWithChallenge($url, $full_response);
        }
    }
    
    curl_close($ch);
    return $body ?? false;
}

function getHeaders($attempt) {
    $userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/537.36'
    ];
    
    $acceptHeaders = [
        'application/json, text/plain, */*',
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '*/*'
    ];
    
    $headers = [
        'Host: frecharge-token.developer-dhanyainfotech.workers.dev',
        'User-Agent: ' . $userAgents[$attempt % count($userAgents)],
        'Accept: ' . $acceptHeaders[$attempt % count($acceptHeaders)],
        'Accept-Language: en-US,en;q=0.9',
        'Accept-Encoding: gzip, deflate',
        'Connection: keep-alive',
        'Upgrade-Insecure-Requests: 1',
        'Cache-Control: max-age=0'
    ];
    
    // Add different headers based on attempt
    switch($attempt % 3) {
        case 0:
            $headers[] = 'X-Requested-With: XMLHttpRequest';
            $headers[] = 'Sec-Fetch-Dest: empty';
            $headers[] = 'Sec-Fetch-Mode: cors';
            break;
        case 1:
            $headers[] = 'Sec-Fetch-Dest: document';
            $headers[] = 'Sec-Fetch-Mode: navigate';
            $headers[] = 'Sec-Fetch-Site: none';
            break;
        case 2:
            $headers[] = 'Referer: https://frecharge-token.developer-dhanyainfotech.workers.dev/';
            $headers[] = 'Origin: https://frecharge-token.developer-dhanyainfotech.workers.dev';
            break;
    }
    
    return $headers;
}

function isValidResponse($response) {
    // Check if response contains valid JSON
    if(strpos($response, '{') === 0 || strpos($response, '[') === 0) {
        json_decode($response);
        if(json_last_error() !== JSON_ERROR_NONE) {
            return false;
        }
    } else {
        return false;
    }
    
    // Check for 500 status code - should not be considered valid
    if(strpos($response, '"status_code": 500') !== false) {
        return false;
    }
    
    // Check for specific success indicators (200)
    return strpos($response, '"status_code": 200') !== false;
}

function retryWithChallenge($url, $challenge_html) {
    // Simple retry with delay and cookies
    sleep(2);
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIEFILE => 'cf_cookies.txt',
        CURLOPT_COOKIEJAR => 'cf_cookies.txt',
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept: application/json, text/plain, */*',
            'Accept-Language: en-US,en;q=0.9'
        ]
    ]);
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    return $response;
}
?>