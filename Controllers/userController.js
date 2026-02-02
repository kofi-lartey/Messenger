import bcrypt from 'bcrypt';
import { sql } from '../Config/db.js';
import { SECRET } from '../Config/env.js';
import jwt from 'jsonwebtoken';
import { generateEmailCode } from '../utils/generatedToken.js';
import { isWhatsAppReady, whatsappClient,latestQRCode } from '../utils/whatsapp-client.js';
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
        const vCode = generateEmailCode(); 

        // 4. Request Pairing Code with Retry Logic
        const delay = (ms) => new Promise(res => setTimeout(res, ms));
        let pairingCode = null;
        let retryCount = 0;

        while (retryCount < 3 && !pairingCode) {
            try {
                pairingCode = await whatsappClient.requestPairingCode(cleanedNumber);
                console.log(`Pairing code generated: ${pairingCode}`);
            } catch (err) {
                console.log(`Attempt ${retryCount + 1}: Client booting or busy, waiting...`);
                if (retryCount < 2) await delay(5000); 
                retryCount++;
            }
        }

        // 5. Security (Hash Password)
        const hashedPassword = await bcrypt.hash(password, 10);

        // 6. Database Insertion
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
        delete user.password; 

        const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '1h' });

        // 7. AUTO-SEND LOGIC
        whatsappClient.once('ready', async () => {
            try {
                const chatId = `${cleanedNumber}@c.us`;
                await whatsappClient.sendMessage(chatId, `✅ Device Linked! Your verification code is: ${vCode}`);
                console.log(`Auto-sent code to ${cleanedNumber}`);
            } catch (err) {
                console.error('Auto-send failed:', err.message);
            }
        });

        // 8. Return Response with QR Code fallback
        return res.status(201).json({
            success: true,
            message: 'Registration successful! Link your WhatsApp.',
            token,
            data: {
                pairingCode: pairingCode, // The 8-character string
                qrCodeImage: latestQRCode, // The Base64 string from your client file
                user: user,
                instructions: {
                    option1: "Link using the pairingCode on your phone.",
                    option2: "Scan the QR Code image if using Postman Visualize tab.",
                    nextStep: "Once linked, check your WhatsApp for the 6-digit PIN."
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
    try {
        // 1. Get User ID from JWT middleware
        const userId = req.user.id;

        // 2. Fetch user details
        const userResult = await sql`
            SELECT whatsapp_number, full_name FROM users WHERE id = ${userId}
        `;

        if (userResult.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const { whatsapp_number, full_name } = userResult[0];

        // Ensure formatting (Ghana international format)
        let cleanedNumber = whatsapp_number.replace(/\D/g, '');
        if (cleanedNumber.startsWith('0')) {
            cleanedNumber = '233' + cleanedNumber.substring(1);
        }

        // 3. Check Engine Status
        if (!isWhatsAppReady && !latestQRCode) {
            return res.status(503).json({
                success: false,
                status: "BOOTING",
                message: "WhatsApp engine is starting. Please retry in 15 seconds."
            });
        }

        // If the engine is already linked, don't try to link again
        if (isWhatsAppReady) {
            return res.status(200).json({
                success: true,
                status: "CONNECTED",
                message: "Device is already linked and ready!"
            });
        }

        // 4. Generate Pairing Code (Text)
        let pairingCode = null;
        try {
            console.log(`Generating pairing code for ${full_name} (${cleanedNumber})...`);
            pairingCode = await whatsappClient.requestPairingCode(cleanedNumber);
        } catch (pairErr) {
            console.warn("Pairing code failed, falling back to QR only:", pairErr.message);
        }

        // 5. Final Response with both options
        return res.status(200).json({
            success: true,
            status: "AWAITING_LINK",
            data: {
                pairingCode: pairingCode, // The 8-character string
                qrCodeImage: latestQRCode, // The Base64 image for Postman Visualize
                phoneNumber: cleanedNumber
            },
            instructions: {
                option1: "Enter the pairingCode in WhatsApp > Linked Devices > Link with Phone Number",
                option2: "Scan the QR code image if using a desktop browser or Postman Visualize"
            }
        });

    } catch (err) {
        console.error("Pairing Auth Error:", err.message);
        return res.status(500).json({
            success: false,
            message: "Internal server error during pairing generation."
        });
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