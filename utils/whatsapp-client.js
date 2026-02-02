import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

export let isWhatsAppReady = false;

const isRender = process.env.RENDER === 'true';

const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // This looks for the env variable we just set
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            ...(isRender ? ['--single-process', '--no-zygote'] : [])
        ],
    }
});

whatsappClient.on('qr', (qr) => {
    console.log('--- ACTION REQUIRED: SCAN QR CODE ---');

    // Setting small: true is the trick for web-based logs
    qrcode.generate(qr, { small: true });

    console.log('--- IF THE QR LOOKS BROKEN, ZOOM OUT YOUR BROWSER ---');
});

whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp Engine is Ready');
    isWhatsAppReady = true;
});

whatsappClient.initialize();

export { whatsappClient };