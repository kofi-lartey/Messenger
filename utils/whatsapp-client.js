import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import path from 'path';

export let isWhatsAppReady = false;

// Detect if we are on Render
const isRender = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production';

const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // Only use the fixed path if we are on Render
        // executablePath: isRender ? process.env.PUPPETEER_EXECUTABLE_PATH : undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            // Render specific: single-process helps memory, but causes crashes on Windows
            ...(isRender ? ['--single-process', '--no-zygote'] : [])
        ],
    }
});

whatsappClient.on('qr', (qr) => {
    console.log('--- ACTION REQUIRED: SCAN QR CODE ---');
    // Using small: false makes it easier to scan in the Render log window
    qrcode.generate(qr, { small: false });
});

whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp Engine is Ready');
    isWhatsAppReady = true;
});

whatsappClient.on('disconnected', (reason) => {
    console.log('❌ WhatsApp Disconnected:', reason);
    isWhatsAppReady = false;
});

whatsappClient.initialize();

export { whatsappClient };