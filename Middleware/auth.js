import jwt from 'jsonwebtoken';
import { SECRET } from '../Config/env.js';
import { sql } from '../Config/db.js';

export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.header("Authorization");
        if (!authHeader) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const token = authHeader.replace("Bearer ", "");
        const decoded = jwt.verify(token, SECRET);

        // 1. Extract 'id' from the JWT payload
        const userIdFromToken = decoded.id;

        // 2. Fetch using columns from your actual Neon table: 'id', 'full_name', 'work_email'
        const userResult = await sql`
            SELECT id, full_name, work_email, organization, status, whatsapp_number
            FROM users 
            WHERE id = ${userIdFromToken}
        `;

        if (userResult.length === 0) {
            return res.status(401).json({ message: 'User not found in database' });
        }

        // 3. Extract the single user object
        const user = userResult[0];

        // 4. Attach to request object
        // Now you can use req.user.id or req.user.work_email in your controllers
        req.user = user;

        console.log('✅ Authenticated:', { id: user.id, email: user.work_email });
        next();
    } catch (error) {
        console.error('❌ Auth Error:', error.message);
        return res.status(401).json({ message: 'Please Authenticate' });
    }
}