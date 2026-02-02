import express from 'express';
import cors from 'cors';
import { PGDATABASE, PORT } from './Config/env.js';
import { sql } from './Config/db.js';
import { userRouter } from './Routers/userRouter.js';


const app = express();
// Add this line to fix the Rate Limit error
app.set('trust proxy', 1);
app.use(express.json());
app.use(cors());

// Routes
app.use('/api/V1', userRouter);

// initialize db connections
export const connectDB = async () => {
    try {
        await sql;
        console.log(`Neondatabase connection to ${PGDATABASE} has been established successfully.`);

    } catch (error) {
        console.error(`Unable to connect to the NeondatabasePostgreSQL (${PGDATABASE}):`, error);
        // Exit application on fatal database connection error
        process.exit(1);
    }
};

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port http://localhost:${PORT}`);
    })
}).catch((error) => {
    console.error('Failed to start server:', error);
})
