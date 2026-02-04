import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcodeTerminal from 'qrcode-terminal';
import qrcodeImage from 'qrcode';

// State variables
export let isWhatsAppReady = false;
export let latestQRCode = null;
let isProcessingQR = false;
let restartAttempts = 0;
const MAX_RESTARTS = 5;

export const setWhatsAppStatus = (status) => {
    isWhatsAppReady = status;
};

const isRender = process.env.RENDER === 'true';

const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    qrMaxRetries: 15,
    authTimeoutMs: 300000,
    puppeteer: {
        headless: true,
        protocolTimeout: 300000,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--js-flags="--max-old-space-size=400"',
            '--disable-web-security',
            '--no-first-run',
            // Your Render-specific flags
            ...(isRender ? ['--single-process', '--no-zygote'] : [])
        ],
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
});

// --- QR Logic ---
whatsappClient.on('qr', async (qr) => {
    if (isProcessingQR || isWhatsAppReady) return;
    isProcessingQR = true;

    console.log('--- NEW QR GENERATED ---');
    qrcodeTerminal.generate(qr, { small: true });

    try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        latestQRCode = await qrcodeImage.toDataURL(qr);
        console.log('✅ QR Image Ready');
    } catch (err) {
        console.error('QR Image Gen Error:', err);
        latestQRCode = qr;
    } finally {
        isProcessingQR = false;
    }
});

whatsappClient.on('ready', () => {
    console.log('✅ WhatsApp Engine is Ready');
    isWhatsAppReady = true;
    latestQRCode = null;
    restartAttempts = 0; // Reset counter on successful login
});

// --- Robust Disconnect & Retry Logic ---
whatsappClient.on('disconnected', async (reason) => {
    console.log(`❌ WhatsApp disconnected: ${reason}`);
    isWhatsAppReady = false;
    latestQRCode = null;

    if (restartAttempts >= MAX_RESTARTS) {
        console.error('🚫 MAX RESTART ATTEMPTS REACHED. Please check logs and restart manually.');
        return;
    }

    if (reason === 'LOGOUT' || reason === 'NAVIGATION') {
        console.log('⚠️ Session invalid. Destroying client...');
        try {
            await whatsappClient.destroy();
        } catch (e) {
            console.log("Cleanup: Client already destroyed.");
        }
    }

    restartAttempts++;
    const delay = 10000 * restartAttempts; // Exponential backoff (10s, 20s, 30s...)

    console.log(`🔄 Restart attempt ${restartAttempts}/${MAX_RESTARTS} in ${delay / 1000}s...`);

    setTimeout(async () => {
        try {
            await whatsappClient.initialize();
        } catch (err) {
            console.error("Initialization failed during restart:", err.message);
        }
    }, delay);
});

// Prevent the "Execution Context Destroyed" from crashing the whole Node process
process.on('unhandledRejection', (reason) => {
    if (reason?.message?.includes('Execution context was destroyed')) {
        console.log('🛠 Handled background navigation error. Waiting for disconnect/reinit...');
    } else {
        console.error('Unhandled Rejection:', reason);
    }
});

whatsappClient.initialize().catch(err => console.error("Initial Load Error:", err));

export { whatsappClient };