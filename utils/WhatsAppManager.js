import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import archiver from 'archiver';
import unzipper from 'unzipper';
import fs from 'fs-extra';
import qrcodeImage from 'qrcode';
import { sql } from '../Config/db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const activeClients = new Map();

// --- HELPERS: DEBUG & PERSISTENCE ---

/**
 * Finds Chrome executable path - checks multiple locations
 */
const findChromeExecutable = () => {
    // Check environment variable first
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
        console.log(`Using PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    const homeDir = process.env.HOME || '/root';

    // Check puppeteer cache with common patterns
    const puppeteerDir = path.join(homeDir, '.cache', 'puppeteer', 'chrome');
    if (fs.existsSync(puppeteerDir)) {
        // Find entries in puppeteer cache
        const entries = fs.readdirSync(puppeteerDir, { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory() && e.name.includes('linux')).map(e => e.name);
        if (dirs.length > 0) {
            // Sort to get the latest
            dirs.sort().reverse();
            const chromePath = path.join(puppeteerDir, dirs[0], 'chrome');
            if (fs.existsSync(chromePath)) {
                console.log(`Found Chrome in puppeteer cache: ${chromePath}`);
                return chromePath;
            }
        }
    }

    // Check bundled chromium with whatsapp-web.js
    const bundledChromePaths = [
        path.resolve(__dirname, '..', 'node_modules', 'whatsapp-web.js', '.chrome', 'chrome-linux', 'chrome'),
        path.resolve(__dirname, '..', 'node_modules', 'whatsapp-web.js', '.chrome', 'chrome-win', 'chrome.exe'),
    ];

    for (const chromePath of bundledChromePaths) {
        if (fs.existsSync(chromePath)) {
            console.log(`Found bundled Chrome: ${chromePath}`);
            return chromePath;
        }
    }

    // Check system paths
    const systemPaths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
    for (const chromePath of systemPaths) {
        if (fs.existsSync(chromePath)) {
            console.log(`Found system Chrome: ${chromePath}`);
            return chromePath;
        }
    }

    console.log('No Chrome found, letting whatsapp-web.js handle it');
    return undefined;
};

/**
 * Captures what the browser sees and saves it to the DB
 */
const captureDebugScreenshot = async (userId, client) => {
    try {
        if (!client.pupPage) return;
        const screenshot = await client.pupPage.screenshot({ encoding: 'base64' });
        const dataUri = `data:image/png;base64,${screenshot}`;
        await sql`UPDATE users SET debug_screenshot = ${dataUri} WHERE id = ${userId}`;
        console.log(`📸 Debug screenshot captured for User ${userId}`);
    } catch (err) {
        console.error("Failed debug screenshot:", err.message);
    }
};

const saveSessionToDb = async (userId) => {
    const sessionDir = `./.wwebjs_auth/session-user-${userId}`;
    const zipPath = `./session-${userId}.zip`;
    if (!fs.existsSync(sessionDir)) return;

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip');

    return new Promise((resolve, reject) => {
        output.on('close', async () => {
            try {
                const buffer = await fs.readFile(zipPath);
                const base64 = buffer.toString('base64');
                await sql`UPDATE users SET whatsapp_session = ${base64} WHERE id = ${userId}`;
                await fs.remove(zipPath);
                console.log(`💾 Session saved to DB for ${userId}`);
                resolve();
            } catch (err) { reject(err); }
        });
        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(sessionDir, false);
        archive.finalize();
    });
};

const restoreSessionFromDb = async (userId, sessionBase64) => {
    const sessionDir = `./.wwebjs_auth/session-user-${userId}`;
    const zipPath = `./restore-${userId}.zip`;
    await fs.ensureDir(sessionDir);
    await fs.writeFile(zipPath, Buffer.from(sessionBase64, 'base64'));
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: sessionDir })).promise();
    await fs.remove(zipPath);
    console.log(`📦 Session restored for ${userId}`);
};

// --- MAIN MANAGER ---

export const getClient = (userId) => activeClients.get(userId);

export const initializeUserWhatsApp = async (userId) => {
    if (activeClients.has(userId)) return activeClients.get(userId);

    // 1. Restore Session from DB
    const [user] = await sql`SELECT whatsapp_session FROM users WHERE id = ${userId}`;
    if (user?.whatsapp_session) {
        await restoreSessionFromDb(userId, user.whatsapp_session);
    }

    console.log(`🚀 Initializing WhatsApp for user ${userId}`);

    // Find Chrome executable
    const chromeExecutable = findChromeExecutable();

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: `user-${userId}` }),
        authTimeoutMs: 120000,
        puppeteer: {
            ...(chromeExecutable && { executablePath: chromeExecutable }),
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                '--disable-blink-features=AutomationControlled',
                '--lang=en-US,en;q=0.9',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-accelerated-2d-canvas',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
                '--safebrowsing-disable-auto-update',
            ]
        },
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        }
    });

    // 2. Handle QR Code
    client.on('qr', async (qr) => {
        try {
            const qrImage = await qrcodeImage.toDataURL(qr);
            await sql`UPDATE users SET last_qr_code = ${qrImage}, whatsapp_status = 'AWAITING_SCAN' WHERE id = ${userId}`;
            console.log(`📥 QR generated for ${userId}`);
        } catch (err) { console.error("QR Error:", err); }
    });

    // 3. Handle Ready
    client.on('ready', async () => {
        console.log(`✅ User ${userId} is READY`);
        await sql`UPDATE users SET whatsapp_status = 'CONNECTED', last_qr_code = NULL, debug_screenshot = NULL WHERE id = ${userId}`;
        await saveSessionToDb(userId);
    });

    // 4. Handle Failures (Debug Mode)
    client.on('auth_failure', async (msg) => {
        console.error(`🔒 Auth Failure for ${userId}:`, msg);
        await captureDebugScreenshot(userId, client);
        await sql`UPDATE users SET whatsapp_status = 'AUTH_FAILURE' WHERE id = ${userId}`;
    });

    client.on('disconnected', async (reason) => {
        console.log(`❌ User ${userId} disconnected:`, reason);
        if (reason !== 'LOGOUT') await captureDebugScreenshot(userId, client);
        activeClients.delete(userId);
        await sql`UPDATE users SET whatsapp_status = 'DISCONNECTED' WHERE id = ${userId}`;
    });

    // 5. Initialize
    client.initialize().catch(async (err) => {
        console.error(`Init error ${userId}:`, err);
        await captureDebugScreenshot(userId, client);
        await sql`UPDATE users SET whatsapp_status = 'ERROR' WHERE id = ${userId}`;
    });

    activeClients.set(userId, client);
    return client;
};
