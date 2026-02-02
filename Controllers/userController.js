import bcrypt from 'bcrypt';
import { sql } from '../Config/db.js';
import { SECRET } from '../Config/env.js';
import jwt from 'jsonwebtoken';
import { sendVerificationCode, sendWhatsAppVerificationCode } from '../utils/whatsAppCode.js';
import { sendVerificationEmail } from '../utils/email.js';
import { generateEmailCode } from '../utils/generatedToken.js';
import { isWhatsAppReady } from '../utils/whatsapp-client.js';



// export const registerUser = async (req, res) => {
//     try {
//         const {
//             full_name, work_email, organization, password,
//             location, whatsapp_number, pricing_tier,
//             pricing_tier_code, status, time_zone, image_url
//         } = req.body;

//         // 1. Validation
//         if (!full_name || !work_email || !password || !whatsapp_number) {
//             return res.status(400).json({
//                 message: 'Full name, email, password, and WhatsApp number are required'
//             });
//         }

//         // 2. Check if user already exists
//         const existUser = await sql`
//             SELECT * FROM users WHERE work_email = ${work_email}
//         `;
//         if (existUser.length > 0) {
//             return res.status(400).json({ message: 'User already exists' });
//         }

//         // 3. Hash password
//         const hashedPassword = await bcrypt.hash(password, 10);

//         // 4. Generate Code & Send Email
//         // Generate a 6-digit code here so we can pass it to both the Email and the DB
//         const vCode = generateEmailCode();

//         // We trigger the email sending (Resend)
//         await sendVerificationEmail(work_email, vCode);

//         // 5. Create newUser in Database
//         const newUser = await sql`
//             INSERT INTO users (
//                 full_name, work_email, organization, password, 
//                 location, whatsapp_number, verification_code, 
//                 pricing_tier, pricing_tier_code, status, 
//                 time_zone, image_url
//             )
//             VALUES (
//                 ${full_name}, ${work_email}, ${organization}, ${hashedPassword}, 
//                 ${location}, ${whatsapp_number}, ${vCode}, 
//                 ${pricing_tier || 'free'}, ${pricing_tier_code || ''}, 
//                 ${status || 'pending'}, ${time_zone}, ${image_url}
//             )
//             RETURNING id, full_name, work_email, organization, location, whatsapp_number, pricing_tier, status, time_zone
//         `;

//         const user_id = newUser[0].id;

//         // 6. Generating JWT token
//         const token = jwt.sign(
//             { id: user_id },
//             SECRET,
//             { expiresIn: '1h' }
//         );

//         return res.status(201).json({
//             success: true,
//             message: 'User registered successfully. Please check your email for the verification code.',
//             token,
//             user: newUser[0]
//         });

//     } catch (error) {
//         console.error('Error registering user:', error);
//         if (error.code === '23505') {
//             return res.status(400).json({ message: 'Email already in use' });
//         }
//         return res.status(500).json({ message: 'Internal server error' });
//     }
// };

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

        const hashedPassword = await bcrypt.hash(password, 10);
        const vCode = generateEmailCode(); // This still generates a 6-digit number

        // 1. Send via WhatsApp instead of Email
        const whatsappSent = await sendWhatsAppVerificationCode(whatsapp_number, vCode);

        // 2. Fallback: Always log to console so you aren't stuck if WhatsApp is offline
        console.log(`DEBUG: Verification code for ${full_name} is ${vCode}`);

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

        const token = jwt.sign({ id: user_id }, SECRET, { expiresIn: '1h' });

        return res.status(201).json({
            success: true,
            message: whatsappSent.success
                ? 'Registration successful. Code sent to your WhatsApp.'
                : 'Registration successful, but WhatsApp message failed. Contact admin.',
            token,
            user: newUser[0]
        });

    } catch (error) {
        console.error('Registration Error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const verifyUser = async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ message: 'Verification code is required' });
        }

        // Use req.user.id (mapped from your middleware)
        const userId = req.user.id;

        // FIX 1: Table is lowercase 'users', column is 'id'
        const userResult = await sql`
            SELECT verification_code FROM users WHERE id = ${userId}
        `;

        if (userResult.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const storedCode = userResult[0].verification_code;

        // FIX 2: Convert both to strings to ensure '123456' === 123456
        if (code.toString() !== storedCode.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }

        // FIX 3: Table is 'users', column is 'id'
        await sql`
            UPDATE users 
            SET status = 'activate', verification_code = NULL 
            WHERE id = ${userId}
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
// export const resendCode = async (req, res) => {
//     try {
//         // req.user properties must match what you set in the middleware
//         const userId = req.user.id;
//         const userEmail = req.user.work_email;

//         // FIX: Table 'users', column 'id'
//         const userResult = await sql`
//             SELECT status FROM users WHERE id = ${userId}
//         `;

//         if (userResult.length === 0) {
//             return res.status(404).json({ message: "User not found" });
//         }

//         const user = userResult[0];

//         if (user.status === 'active') {
//             return res.status(400).json({ message: "Account is already verified." });
//         }

//         const newVCode = generateEmailCode();

//         await sendVerificationEmail(userEmail, newVCode);

//         // FIX: Table 'users', column 'id'
//         await sql`
//             UPDATE users 
//             SET verification_code = ${newVCode} 
//             WHERE id = ${userId}
//         `;

//         return res.status(200).json({
//             success: true,
//             message: "A new verification code has been sent to your email."
//         });

//     } catch (error) {
//         console.error('Resend Error:', error);
//         return res.status(500).json({ message: "Failed to resend code." });
//     }
// };

// regenerate verification code function
export const resendCode = async (req, res) => {
    try {
        // 1. Check if engine is ready
        if (!isWhatsAppReady) {
            return res.status(503).json({
                success: false,
                message: "WhatsApp server is currently offline. Please try again in 2 minutes."
            });
        }
        // req.user is populated by your 'authenticate' middleware
        const userId = req.user.id;
        const userNumber = req.user.whatsapp_number;

        // 1. Fetch user status and number from the database
        const userResult = await sql`
            SELECT status, whatsapp_number FROM users WHERE id = ${userId}
        `;

        if (userResult.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const user = userResult[0];

        // 2. Check if they are already verified (handling both enum possibilities)
        if (user.status === 'active' || user.status === 'activate') {
            return res.status(400).json({ message: "Account is already verified." });
        }

        // 3. Generate a NEW 6-digit code
        const newVCode = generateEmailCode();

        // 4. Trigger the WhatsApp engine instead of Email
        // We use the number from the database to be safe
        const whatsappResult = await sendWhatsAppVerificationCode(user.whatsapp_number, newVCode);

        // Fallback log so you can see the code in the terminal during development
        console.log(`DEBUG: Resent WhatsApp code ${newVCode} to ${user.whatsapp_number}`);

        // 5. Update the database with the new code
        await sql`
            UPDATE users 
            SET verification_code = ${newVCode} 
            WHERE id = ${userId}
        `;

        return res.status(200).json({
            success: true,
            message: whatsappResult.success
                ? "A new verification code has been sent to your WhatsApp."
                : "Code generated, but WhatsApp failed to send. Please check if the engine is online."
        });

    } catch (error) {
        console.error('Resend Error:', error);
        return res.status(500).json({ message: "Failed to resend code." });
    }
};

export const checkStatus = (req, res) => {
    if (isWhatsAppReady) {
        res.send("Engine is online! 🟢");
    } else {
        res.send("Engine is offline! 🔴");
    }
}