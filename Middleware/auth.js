import jwt from 'jsonwebtoken';
import { SECRET } from '../Config/env.js';
import { sql } from '../Config/db.js';


export const authenticate = async (req, res, next) => {
    try {
        const token = req.header("Authorization").replace("Bearer ", "");
        const decoded = jwt.verify(token, SECRET);
        console.log('decoded JWT:', decoded);

        // 1. FIX: Declare and assign user_id from the decoded object (which uses 'id')
        const user_id = decoded.id; 

        // 2. Fetch full user information from database
        // Use the correct column name 'user_id' from the database schema
        // and the correct variable ${user_id}
        const userResult = await sql`
            SELECT user_id, fullname, email FROM Users WHERE user_id=${id}
        `;
        
        // Check if user was actually found (userResult is an array of rows)
        if (userResult.length === 0) {
            return res.status(401).json({ message: 'User not found' });
        }

        // 3. FIX: Extract the single user object from the array
        const user = userResult[0]; 

        // 4. Set the full user object in req.user
        // This makes req.user available to subsequent middleware and handlers (like createAuditDetails)
        req.user = user;
        console.log('Authenticated user:', { id: user.id, email: user.work_email });
        next();
    } catch (error) {
        // You might see "jwt expired" or "invalid signature" errors here
        console.error('Authentication error:', error.message);
        return res.status(401).json({ message: 'Please Authenticate' });
    }
}