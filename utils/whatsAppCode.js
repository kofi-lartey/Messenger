import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox'], // Useful for deployment later
    }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Scan the QR code above with your WhatsApp (0531114795) to log in.');
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
});

client.initialize();

/**
 * Sends a 6-digit code to a Ghana number
 * @param {string} phoneNumber - Format: "0531114795"
 */
export const sendVerificationCode = async (phoneNumber) => {
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