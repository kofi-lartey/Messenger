import bcrypt from 'bcrypt';
import { sql } from '../Config/db.js';
import { SECRET } from '../Config/env.js';
import jwt from 'jsonwebtoken';
import { generateEmailCode } from '../utils/generatedToken.js';
import { isWhatsAppReady, whatsappClient } from '../utils/whatsapp-client.js';
import { formatPhoneNumber } from '../utils/numberChecker.js';


export const registerUser = async (req, res) => {
    try {
        const {
            full_name, work_email, organization, password,
            location, whatsapp_number, pricing_tier,
            pricing_tier_code, status, time_zone, image_url
        } = req.body;

        // 1. Validation
        if (!full_name || !work_email || !password || !whatsapp_number) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // 2. Check if user exists
        const existUser = await sql`SELECT * FROM users WHERE work_email = ${work_email}`;
        if (existUser.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // 3. Prepare WhatsApp Details
        const cleanedNumber = formatPhoneNumber(whatsapp_number);
        const vCode = generateEmailCode(); // This is the 6-digit code they will receive later

        // 4. Request Pairing Code (8-character code for linking)
        // Helper to wait a few seconds
        const delay = (ms) => new Promise(res => setTimeout(res, ms));

        // Inside your registerUser function:
        let pairingCode = null;
        let retryCount = 0;

        // Try to get the code, retrying up to 3 times if the client is still booting
        while (retryCount < 3 && !pairingCode) {
            try {
                pairingCode = await whatsappClient.requestPairingCode(cleanedNumber);
                console.log(`Pairing code generated: ${pairingCode}`);
            } catch (err) {
                console.log(`Attempt ${retryCount + 1}: Client still booting, waiting...`);
                await delay(5000); // Wait 5 seconds before retrying
                retryCount++;
            }
        }

        // 5. Security (Hash Password)
        const hashedPassword = await bcrypt.hash(password, 10);

        // 6. Database Insertion (Including verification_code)
        const newUser = await sql`
            INSERT INTO users (
                full_name, work_email, organization, password, 
                location, whatsapp_number, verification_code, 
                pricing_tier, pricing_tier_code, status, 
                time_zone, image_url
            )
            VALUES (
                ${full_name}, ${work_email}, ${organization}, ${hashedPassword}, 
                ${location}, ${cleanedNumber}, ${vCode}, 
                ${pricing_tier || 'free'}, ${pricing_tier_code || ''}, 
                ${status || 'pending'}, ${time_zone}, ${image_url}
            )
            RETURNING * `;

        const user = newUser[0];
        delete user.password; // ❌ Remove sensitive hash

        const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '1h' });

        // 7. AUTO-SEND LOGIC
        // Once the user links their device, the 'ready' event fires.
        // We use .once so this only happens once for this registration.
        whatsappClient.once('ready', async () => {
            try {
                const chatId = `${cleanedNumber}@c.us`;
                await whatsappClient.sendMessage(chatId, `✅ Device Linked! Your verification code is: ${vCode}`);
                console.log(`Auto-sent code to ${cleanedNumber}`);
            } catch (err) {
                console.error('Auto-send failed. User might need to click "Resend":', err.message);
            }
        });

        // 8. Return FULL Details (Except password)
        return res.status(201).json({
            success: true,
            message: 'Registration successful! Follow instructions to link WhatsApp.',
            pairingCode: pairingCode,
            token,
            data: {
                user: user, // Contains all details from the DB
                instructions: {
                    step1: "Link your WhatsApp using the Pairing Code provided.",
                    step2: "As soon as you link, we will automatically message you the 6-digit verification code.",
                    step3: "Enter that 6-digit code on the next screen to activate your account."
                }
            }
        });

    } catch (error) {
        console.error('Registration Error:', error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};

// GET /api/auth/get-pairing-code?phone=233531114795
export const getPairingCode = async (req, res) => {
    const { phone } = req.query;
    const cleanedNumber = phone.replace(/\D/g, '');

    if (!isWhatsAppReady) {
        return res.status(503).json({ 
            success: false, 
            message: "WhatsApp is still starting up. Please wait 30 seconds and refresh." 
        });
    }

    try {
        const pairingCode = await whatsappClient.requestPairingCode(cleanedNumber);
        res.json({ success: true, pairingCode });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error generating code", error: err.message });
    }
};

export const verifyUser = async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.user.id; // From your JWT middleware

        if (!code) {
            return res.status(400).json({ message: 'Verification code is required' });
        }

        // 1. Fetch the stored code and all user details
        const userResult = await sql`
            SELECT * FROM users WHERE id = ${userId}
        `;

        if (userResult.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = userResult[0];

        // 2. Compare codes (String conversion handles any type issues)
        if (code.toString() !== user.verification_code?.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }

        // 3. Update status and clear the code
        // We use RETURNING * to get the final "Active" user object
        const updatedUser = await sql`
            UPDATE users 
            SET status = 'activate', verification_code = NULL 
            WHERE id = ${userId}
            RETURNING *
        `;

        const finalUser = updatedUser[0];
        delete finalUser.password; // Always hide the password

        return res.status(200).json({
            success: true,
            message: 'Account verified and activated successfully!',
            data: {
                user: finalUser
            }
        });

    } catch (error) {
        console.error('Error verifying user:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};



// regenerate verification code function
export const resendCode = async (req, res) => {
    try {
        // 1. Check if the WhatsApp engine is even running
        if (!isWhatsAppReady) {
            return res.status(503).json({
                success: false,
                message: "WhatsApp server is starting up. Please try again in 1 minute."
            });
        }

        const userId = req.user.id;

        // 2. Fetch user status and number
        const userResult = await sql`
            SELECT status, whatsapp_number FROM users WHERE id = ${userId}
        `;

        if (userResult.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const user = userResult[0];

        // 3. Check if already active
        if (user.status === 'active' || user.status === 'activate') {
            return res.status(400).json({ message: "Account is already verified." });
        }

        const cleanedNumber = user.whatsapp_number.replace(/\D/g, '');

        /**
         * SCENARIO A: The user is NOT linked to WhatsApp yet.
         * We need to generate a new 8-character Pairing Code.
         */
        let newPairingCode = null;
        try {
            newPairingCode = await whatsappClient.requestPairingCode(cleanedNumber);
            console.log(`NEW Pairing code for ${cleanedNumber}: ${newPairingCode}`);
        } catch (err) {
            console.error('Failed to generate pairing code:', err.message);
            // If this fails, it might mean the client is already linked. 
            // We proceed to Scenario B.
        }

        /**
         * SCENARIO B: The user is linked but needs a 6-digit Verification Code.
         * We generate a 6-digit code and try to send it as a message.
         */
        const newVCode = generateEmailCode();

        let whatsappMessageSent = false;
        try {
            const chatId = `${cleanedNumber}@c.us`;
            await whatsappClient.sendMessage(chatId, `Your new verification code is: ${newVCode}`);
            whatsappMessageSent = true;
        } catch (err) {
            console.log("Could not send message. User likely not linked yet.");
        }

        // 4. Update the database with the new 6-digit code
        await sql`
            UPDATE users 
            SET verification_code = ${newVCode} 
            WHERE id = ${userId}
        `;

        // 5. Intelligent Response
        return res.status(200).json({
            success: true,
            pairingCode: newPairingCode, // For Scenario A (Linking)
            message: newPairingCode
                ? "New linking code generated. Enter this in your WhatsApp app."
                : "A new 6-digit verification code has been sent to your WhatsApp.",
            isLinked: !newPairingCode // If no pairing code, assume they are linked
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

// export const linkNumber = async (req, res) => {
//     const { phone } = req.query;

//     if (!phone) {
//         return res.status(400).json({ error: "Please provide a phone number with country code." });
//     }

//     try {
//         // This requests the 8-character code from WhatsApp
//         const code = await whatsappClient.requestPairingCode(phone);
//         res.json({
//             success: true,
//             pairingCode: code,
//             instructions: "Enter this code in WhatsApp > Linked Devices > Link with phone number"
//         });
//     } catch (err) {
//         res.status(500).json({ error: "Failed to generate code. Is the client already linked?" });
//     }
// };