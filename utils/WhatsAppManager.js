import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import archiver from 'archiver';
import unzipper from 'unzipper';
import fs from 'fs-extra';
import qrcodeImage from 'qrcode';
import { sql } from '../Config/db.js';
import { BROWSERLESS_API_KEY } from '../Config/env.js';

const activeClients = new Map();

// --- HELPERS: SESSION PERSISTENCE (Saves session to NeonDB so Render restarts don't log you out) ---

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
                console.log(`💾 Session zipped and saved to DB for User ${userId}`);
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

    await fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: sessionDir }))
        .promise();

    await fs.remove(zipPath);
    console.log(`📦 Session restored from DB for User ${userId}`);
};

// --- MAIN MANAGER ---

export const getClient = (userId) => activeClients.get(userId);

export const initializeUserWhatsApp = async (userId) => {
    if (activeClients.has(userId)) return activeClients.get(userId);

    // 1. Restore Session from NeonDB if it exists
    const [user] = await sql`SELECT whatsapp_session FROM users WHERE id = ${userId}`;
    if (user?.whatsapp_session) {
        await restoreSessionFromDb(userId, user.whatsapp_session);
    }

    // 2. Browserless Region Strategy: Use Europe (Frankfurt) as a bridge between US and Ghana
    const browserlessUrl = `wss://chrome.browserless.io?token=${BROWSERLESS_API_KEY}&--region=eu-central-1`;

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: `user-${userId}` }),
        puppeteer: {
            browserWSEndpoint: browserlessUrl,
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--lang=en-GB', // Use British English to match GMT timezone in Ghana
                '--disable-gpu'
            ]
        },
        // Force a stable web version to bypass "Couldn't Link" errors
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018.x.html',
        }
    });

    // 3. Handle QR Code Generation
    client.on('qr', async (qr) => {
        try {
            const qrImage = await qrcodeImage.toDataURL(qr);
            await sql`UPDATE users SET last_qr_code = ${qrImage}, whatsapp_status = 'AWAITING_SCAN' WHERE id = ${userId}`;
            console.log(`📥 QR updated in DB for User ${userId}`);
        } catch (err) { console.error("QR Error:", err); }
    });

    // 4. Handle Successful Connection
    client.on('ready', async () => {
        console.log(`✅ User ${userId} is READY`);
        await sql`UPDATE users SET whatsapp_status = 'CONNECTED', last_qr_code = NULL WHERE id = ${userId}`;
        // Save fresh session files back to DB
        await saveSessionToDb(userId);
    });

    client.on('disconnected', async (reason) => {
        console.log(`❌ User ${userId} disconnected:`, reason);
        activeClients.delete(userId);
        await sql`UPDATE users SET whatsapp_status = 'DISCONNECTED', whatsapp_session = NULL WHERE id = ${userId}`;
    });

    client.initialize().catch(err => console.error(`Init error ${userId}:`, err));
    activeClients.set(userId, client);
    return client;
};