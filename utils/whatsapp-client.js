import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcodeTerminal from 'qrcode-terminal';
import qrcodeImage from 'qrcode'; // Add this to your package.json: npm install qrcode

export let isWhatsAppReady = false;
export let latestQRCode = null; // 👈 Exported to be used in your controller

// Render-specific check
const isRender = process.env.RENDER === 'true';

const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        protocolTimeout: 60000,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-gpu',
            ...(isRender ? ['--single-process', '--no-zygote'] : [])
        ],
    }
});

// QR Logic
whatsappClient.on('qr', async (qr) => {
    console.log('--- NEW QR GENERATED ---');

    // 1. Still show in terminal for debugging
    qrcodeTerminal.generate(qr, { small: true });

    // 2. Convert to Base64 so Postman can render it as an image
    try {
        latestQRCode = await qrcodeImage.toDataURL(qr);
    } catch (err) {
        console.error('Error generating Base64 QR:', err);
        latestQRCode = qr; // Fallback to raw string
    }
});

whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp Engine is Ready');
    isWhatsAppReady = true;
    latestQRCode = null; // Clear QR once connected
});

whatsappClient.on('authenticated', () => {
    console.log('👍 WhatsApp Authenticated (Linking successful)');
});

whatsappClient.on('auth_failure', (msg) => {
    console.error('❌ Auth Failure:', msg);
    isWhatsAppReady = false;
});

whatsappClient.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
    isWhatsAppReady = false;
    latestQRCode = null;

    // Attempt to re-initialize after 5 seconds
    setTimeout(() => {
        console.log('Attempting to restart WhatsApp Engine...');
        whatsappClient.initialize();
    }, 5000);
});

whatsappClient.initialize();

export { whatsappClient };