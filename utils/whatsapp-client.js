import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

export let isWhatsAppReady = false;

const isRender = process.env.RENDER === 'true';

const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // We use the path Render showed in your successful build log
        executablePath: isRender
            ? '/opt/render/.cache/puppeteer/chrome/linux-144.0.7559.96/chrome-linux64/chrome'
            : undefined,
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