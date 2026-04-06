<?php
// hide all errors in production
ini_set('display_errors', 0);
error_reporting(0);
require __DIR__ . '/vendor/autoload.php';

use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;

// Get text from GET parameter
$text = urldecode($_GET['text'] ?? 'Hello QR!');

// Path to logo
$logoPath = __DIR__ . '/main.png';

// QR code options
$options = new QROptions([
    'version'       => 10, // Increased from 7 to 10
    'outputType'    => QRCode::OUTPUT_IMAGE_PNG,
    'eccLevel'      => QRCode::ECC_L, // Changed from H to L to allow more data
    'scale'         => 12,            // Reduced from 15 to 12
    'imageBase64'   => false,
    'quietzoneSize' => 1, // Border kam kar diya
]);

// Generate QR code as image resource
$qr      = new QRCode($options);
$qrImage = $qr->render($text);

// Load QR and logo into GD
$qrResource   = imagecreatefromstring($qrImage);
$logoResource = imagecreatefrompng($logoPath);

// Get dimensions
$qrWidth    = imagesx($qrResource);
$qrHeight   = imagesy($qrResource);
$logoWidth  = imagesx($logoResource);
$logoHeight = imagesy($logoResource);

// Resize logo if bigger than 25% of QR
$maxLogoWidth  = $qrWidth * 0.25;
$maxLogoHeight = $qrHeight * 0.25;
$scale         = min($maxLogoWidth / $logoWidth, $maxLogoHeight / $logoHeight, 1);
$logoWidth     = $logoWidth * $scale;
$logoHeight    = $logoHeight * $scale;

// Center logo
$logoX = ($qrWidth - $logoWidth) / 2;
$logoY = ($qrHeight - $logoHeight) / 2;

// Merge logo onto QR
imagecopyresampled($qrResource, $logoResource, $logoX, $logoY, 0, 0, $logoWidth, $logoHeight, imagesx($logoResource), imagesy($logoResource));

// Output final QR with logo
header('Content-Type: image/png');
imagepng($qrResource);

// Cleanup
imagedestroy($qrResource);
imagedestroy($logoResource);