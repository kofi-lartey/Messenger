import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

export let isWhatsAppReady = false;

// Render-specific check
const isRender = process.env.RENDER === 'true';

const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        protocolTimeout: 60000,
        // Ensure this path matches what we set in your Render Env Vars
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

// Backup QR listener (in case pairing fails)
whatsappClient.on('qr', (qr) => {
    console.log('--- SCAN QR (OR USE PAIRING CODE) ---');
    qrcode.generate(qr, { small: true });
});

whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp Engine is Ready');
    isWhatsAppReady = true;
});

whatsappClient.on('authenticated', async () => {
    console.log('👍 WhatsApp Linked!');
    // Note: To send the code automatically here, you'd need to track 
    // which user just linked. Usually, it's easier to trigger this 
    // from the frontend once they click "I have linked my device".
});

whatsappClient.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
    isWhatsAppReady = false;

    // Attempt to re-initialize after 5 seconds
    setTimeout(() => {
        console.log('Attempting to restart WhatsApp Engine...');
        whatsappClient.initialize();
    }, 5000);
});

whatsappClient.initialize();

export { whatsappClient };