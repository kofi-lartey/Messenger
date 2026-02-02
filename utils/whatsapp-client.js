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
    console.log('✨ SCAN THIS QR CODE:');
    qrcode.generate(qr, { small: false });
});

whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp Engine is Ready');
    isWhatsAppReady = true;
});

whatsappClient.initialize();

export { whatsappClient };