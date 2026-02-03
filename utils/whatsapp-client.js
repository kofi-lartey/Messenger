import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcodeTerminal from 'qrcode-terminal';
import qrcodeImage from 'qrcode';

// State variables
export let isWhatsAppReady = false;
export let latestQRCode = null;
let isProcessingQR = false;

/**
 * Updates the global readiness state.
 * Used by the system-reset controller to avoid "Assignment to constant" errors.
 */
export const setWhatsAppStatus = (status) => {
    isWhatsAppReady = status;
};

// Render-specific check
const isRender = process.env.RENDER === 'true';

const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    qrMaxRetries: 20,          // Increased retries for more stability
    authTimeoutMs: 300000,     // 5-minute timeout for slow handshakes
    puppeteer: {
        headless: true,
        protocolTimeout: 300000,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--proxy-server="direct://"',
            '--proxy-bypass-list=*',
            // Render Memory optimizations
            '--js-flags="--max-old-space-size=400"',
            ...(isRender ? ['--single-process', '--no-zygote'] : [])
        ],
    }
});

// --- Event Listeners ---

whatsappClient.on('qr', async (qr) => {
    // Prevent rapid-fire processing to save CPU/Network on Render
    if (isProcessingQR || isWhatsAppReady) return;

    isProcessingQR = true;
    console.log('--- NEW QR GENERATED (Throttled) ---');

    // Show in terminal for server logs
    qrcodeTerminal.generate(qr, { small: true });

    try {
        // Wait 3 seconds to let the engine "breathe" before generating the Base64 image
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Generate the Image for Postman Visualize
        latestQRCode = await qrcodeImage.toDataURL(qr);
        console.log('✅ QR Image Ready for Postman');
    } catch (err) {
        console.error('Error generating Base64 QR:', err);
        latestQRCode = qr; // Fallback to raw string
    } finally {
        isProcessingQR = false;
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

    // Attempt to re-initialize after 10 seconds to avoid loop spam
    setTimeout(() => {
        console.log('Attempting to restart WhatsApp Engine...');
        whatsappClient.initialize();
    }, 10000);
});

// Initialize the client
whatsappClient.initialize();

export { whatsappClient };