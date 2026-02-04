import express from 'express';
import cors from 'cors';
import { PGDATABASE, PORT } from './Config/env.js';
import { sql } from './Config/db.js';
import { userRouter } from './Routers/userRouter.js';
// Import latestQRCode to show it in the health check
import { isWhatsAppReady, latestQRCode } from './utils/whatsapp-client.js';

const app = express();

// Trust proxy for Render/Cloudflare rate limiting
app.set('trust proxy', 1);
app.use(express.json());
app.use(cors());

// Routes
app.use('/api/V1', userRouter);

/**
 * Enhanced Health Check
 * Purpose: Allows cron-job.org to keep the server awake and 
 * lets you see the QR code status at any time.
 */
app.get('/health', (req, res) => {
    // Log hits to console so you can see the cron-job working in Render logs
    console.log(`[${new Date().toISOString()}] Health Check Triggered`);

    res.status(200).json({
        status: 'online',
        database: 'connected',
        whatsapp: {
            connected: isWhatsAppReady,
            status: isWhatsAppReady ? 'READY' : 'AWAITING_LINK',
            qrAvailable: !!latestQRCode,
            // Include QR here so you can check it without registering again
            qrCodeImage: isWhatsAppReady ? null : latestQRCode
        },
        timestamp: new Date().toISOString()
    });
});

// Initialize DB connections
export const connectDB = async () => {
    try {
        // Test query to ensure DB is responsive
        await sql`SELECT 1`;
        console.log(`✅ Neondatabase connection to ${PGDATABASE} established.`);
    } catch (error) {
        console.error(`❌ Database Error (${PGDATABASE}):`, error);
        process.exit(1);
    }
};

// Start Server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running at https://messenger-pd0s.onrender.com`);
        console.log(`🩺 Health check: https://messenger-pd0s.onrender.com/health`);
    })
}).catch((error) => {
    console.error('Failed to start server:', error);
});