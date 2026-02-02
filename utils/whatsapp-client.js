import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

// Named exports
export let isWhatsAppReady = false;

const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Display QR Code in terminal for scanning
whatsappClient.on('qr', (qr) => {
    console.log('✨ SCAN THIS QR CODE TO LOG IN:');
    qrcode.generate(qr, { small: true });
});

whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp Engine is Ready');
    isWhatsAppReady = true;
});

whatsappClient.on('authenticated', () => {
    console.log('🔓 WhatsApp Authenticated');
});

whatsappClient.on('disconnected', (reason) => {
    console.log('❌ WhatsApp Disconnected:', reason);
    isWhatsAppReady = false;
});

whatsappClient.initialize();

export { whatsappClient };