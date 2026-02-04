import express from 'express';
import cors from 'cors';
import { PORT } from './Config/env.js';
import { sql } from './Config/db.js';
import { userRouter } from './Routers/userRouter.js';

const app = express();

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// 404 Handler for undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.path
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);

    // Handle JSON parsing errors
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON in request body'
        });
    }

    // Handle other errors
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
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
