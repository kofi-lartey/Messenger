import express from 'express';
import cors from 'cors';
import { PORT } from './Config/env.js';
import { sql } from './Config/db.js';
import { userRouter } from './Routers/userRouter.js';

const app = express();

app.set('trust proxy', 1);
app.use(express.json());
app.use(cors());

// Routes
app.use('/api/V1', userRouter);

// Health Check
app.get('/health', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Health Check Triggered`);

    try {
        await sql`SELECT 1`;
        res.status(200).json({
            status: 'online',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            database: 'disconnected',
            error: error.message
        });
    }
});

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
        console.log(`📱 Using WhatsApp Chat API (wa.me) for messaging`);
    });
}).catch((error) => {
    console.error('Failed to start server:', error);
});
