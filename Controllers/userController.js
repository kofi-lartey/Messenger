import bcrypt from 'bcrypt';
import { sql } from '../Config/db.js';
import { SECRET } from '../Config/env.js';
import jwt from 'jsonwebtoken';
import { sendVerificationCode } from '../utils/whatsAppCode.js';
import { sendVerificationEmail } from '../utils/email.js';
import { generateEmailCode } from '../utils/generatedToken.js';


export const registerUser = async (req, res) => {
    try {
        const {
            full_name, work_email, organization, password,
            location, whatsapp_number, pricing_tier,
            pricing_tier_code, status, time_zone, image_url
        } = req.body;

        // 1. Validation
        if (!full_name || !work_email || !password || !whatsapp_number) {
            return res.status(400).json({
                message: 'Full name, email, password, and WhatsApp number are required'
            });
        }

        // 2. Check if user already exists
        const existUser = await sql`
            SELECT * FROM users WHERE work_email = ${work_email}
        `;
        if (existUser.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // 3. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. Generate Code & Send Email
        // Generate a 6-digit code here so we can pass it to both the Email and the DB
        const vCode = generateEmailCode();

        // We trigger the email sending (Resend)
        await sendVerificationEmail(work_email, vCode);

        // 5. Create newUser in Database
        const newUser = await sql`
            INSERT INTO users (
                full_name, work_email, organization, password, 
                location, whatsapp_number, verification_code, 
                pricing_tier, pricing_tier_code, status, 
                time_zone, image_url
            )
            VALUES (
                ${full_name}, ${work_email}, ${organization}, ${hashedPassword}, 
                ${location}, ${whatsapp_number}, ${vCode}, 
                ${pricing_tier || 'free'}, ${pricing_tier_code || ''}, 
                ${status || 'pending'}, ${time_zone}, ${image_url}
            )
            RETURNING id, full_name, work_email, organization, location, whatsapp_number, pricing_tier, status, time_zone
        `;

        const user_id = newUser[0].id;

        // 6. Generating JWT token
        const token = jwt.sign(
            { id: user_id },
            SECRET,
            { expiresIn: '1h' }
        );

        return res.status(201).json({
            success: true,
            message: 'User registered successfully. Please check your email for the verification code.',
            token,
            user: newUser[0]
        });

    } catch (error) {
        console.error('Error registering user:', error);
        if (error.code === '23505') {
            return res.status(400).json({ message: 'Email already in use' });
        }
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const verifyUser = async (req, res) => {
    try {
        const { code } = req.body;

        // 1. Validation: Ensure a code was provided
        if (!code) {
            return res.status(400).json({ message: 'Verification code is required' });
        }

        // 2. Access authenticated user info from the 'authenticate' middleware
        // Using 'user_id' from req.user (as set in your middleware)
        const userId = req.user.user_id;

        // 3. Check if the code matches what's in the database
        const user = await sql`
            SELECT verification_code FROM Users WHERE user_id = ${userId}
        `;

        if (user.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const storedCode = user[0].verification_code;

        // 4. Compare the codes
        if (code !== storedCode) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }

        // 5. If correct, update user status to 'activate' and clear the code
        await sql`
            UPDATE Users 
            SET status = 'activate', verification_code = NULL 
            WHERE user_id = ${userId}
        `;

        return res.status(200).json({
            success: true,
            message: 'Account verified and activated successfully!'
        });

    } catch (error) {
        console.error('Error verifying user:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

// regenerate verification code function
export const resendCode = async (req, res) => {
    try {
        // req.user is available because we use the 'authenticate' middleware
        const userId = req.user.user_id;
        const userEmail = req.user.work_email; // Ensure this matches your JWT/Request property

        // 1. Fetch the user's current status from the DB
        const userResult = await sql`
            SELECT status FROM Users WHERE user_id = ${userId}
        `;

        if (userResult.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const user = userResult[0];

        // 2. Optimization: Don't resend if they are already activated
        if (user.status === 'activate' || user.status === 'active') {
            return res.status(400).json({ message: "Account is already verified." });
        }

        // 3. Generate a NEW code using your custom function
        const newVCode = generateEmailCode();

        // 4. Send the NEW code via Resend Email
        await sendVerificationEmail(userEmail, newVCode);

        // 5. Update the database with the new code
        await sql`
            UPDATE Users 
            SET verification_code = ${newVCode} 
            WHERE user_id = ${userId}
        `;

        return res.status(200).json({
            success: true,
            message: "A new verification code has been sent to your email."
        });

    } catch (error) {
        console.error('Resend Error:', error);
        return res.status(500).json({ message: "Failed to resend code." });
    }
};