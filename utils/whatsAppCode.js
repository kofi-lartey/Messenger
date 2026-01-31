import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

// Skip WhatsApp initialization on server deployments (Render, etc.)
// Set USE_WHATSAPP=true in .env to enable WhatsApp client
const USE_WHATSAPP = process.env.USE_WHATSAPP === 'true';

let client = null;

if (USE_WHATSAPP) {
    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            args: ['--no-sandbox'],
        }
    });

    client.on('qr', (qr) => {
        qrcode.generate(qr, { small: true });
        console.log('Scan the QR code above with your WhatsApp to log in.');
    });

    client.on('ready', () => {
        console.log('WhatsApp Client is ready!');
    });

    client.initialize();
}

/**
 * Sends a 6-digit code to a Ghana number
 * @param {string} phoneNumber - Format: "0531114795"
 */
export const sendVerificationCode = async (phoneNumber) => {
    // Return a mock code if WhatsApp is not enabled (for server deployments)
    if (!client) {
        console.log('WhatsApp disabled, returning mock verification code');
        return '123456';
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Formatting for Ghana (+233). Adjust if using other country codes.
    const chatId = `233${phoneNumber.substring(1)}@c.us`;
    const message = `Your verification code is: ${verificationCode}`;

    try {
        await client.sendMessage(chatId, message);
        return verificationCode;
    } catch (err) {
        console.error("WhatsApp Send Error:", err);
        throw err;
    }
};