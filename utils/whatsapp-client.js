import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

export let isWhatsAppReady = false;

// Auto-detect environment
const isRender = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production';

const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            // Optimized for Render's limited resources
            ...(isRender ? ['--single-process', '--no-zygote'] : [])
        ],
    }
});

// QR Code Logic
whatsappClient.on('qr', (qr) => {
    console.log('--- ACTION REQUIRED: SCAN QR CODE ---');
    qrcode.generate(qr, { small: false });
});

whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp Engine is Ready');
    isWhatsAppReady = true;
});

whatsappClient.initialize();

export { whatsappClient };