import express from 'express';
import cors from 'cors';
import { PGDATABASE, PORT } from './Config/env.js';
import { sql } from './Config/db.js';
import { userRouter } from './Routers/userRouter.js';
// NEW: Import the Manager instead of the single client
import { initializeUserWhatsApp } from './utils/WhatsAppManager.js';

const app = express();

app.set('trust proxy', 1);
app.use(express.json());
app.use(cors());

// Routes
app.use('/api/V1', userRouter);

/**
 * Enhanced Health Check
 * Modified to be user-agnostic or pull general stats
 */
app.get('/health', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Health Check Triggered`);

    // Optional: Get a count of connected users for the health check
    const stats = await sql`SELECT COUNT(*) as total FROM users WHERE whatsapp_status = 'CONNECTED'`;

    res.status(200).json({
        status: 'online',
        database: 'connected',
        active_whatsapp_sessions: stats[0].total,
        timestamp: new Date().toISOString()
    });
});

/**
 * RECONNECTION LOGIC
 * Finds all users who were previously connected and restarts their engines
 */
const reconnectAllUsers = async () => {
    try {
        console.log("🔄 Searching for active sessions to restore...");
        // Find users who have a saved session in NeonDB
        const activeUsers = await sql`SELECT id FROM users WHERE whatsapp_session IS NOT NULL`;

        if (activeUsers.length === 0) {
            console.log("ℹ️ No active sessions found to restore.");
            return;
        }

        console.log(`⏳ Restoring ${activeUsers.length} WhatsApp sessions...`);

        // Initialize them one by one (to avoid slamming Browserless CPU)
        for (const user of activeUsers) {
            initializeUserWhatsApp(user.id).catch(err =>
                console.error(`Failed to restore user ${user.id}:`, err.message)
            );
            // Small delay between each initialization
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    } catch (error) {
        console.error("❌ Reconnection Loop Error:", error);
    }
};

// Initialize DB connections
export const connectDB = async () => {
    try {
        await sql`SELECT 1`;
        console.log(`✅ Neondatabase connection established.`);
    } catch (error) {
        console.error(`❌ Database Error:`, error);
        process.exit(1);
    }
};

// Start Server
connectDB().then(async () => {
    app.listen(PORT, async () => {
        console.log(`🚀 Server running on port ${PORT}`);

        // START THE RESTORE PROCESS
        await reconnectAllUsers();
    });
}).catch((error) => {
    console.error('Failed to start server:', error);
});