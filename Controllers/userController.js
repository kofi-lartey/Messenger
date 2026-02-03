import bcrypt from 'bcrypt';
import { sql } from '../Config/db.js';
import { MY_SECRET_KEY, SECRET } from '../Config/env.js';
import jwt from 'jsonwebtoken';
import { generateEmailCode } from '../utils/generatedToken.js';
import { isWhatsAppReady, whatsappClient, latestQRCode, setWhatsAppStatus } from '../utils/whatsapp-client.js';
import { formatPhoneNumber } from '../utils/numberChecker.js';

/**
 * 1. Register User & Return QR/Pairing Code
 */
export const registerUser = async (req, res) => {
    try {
        const {
            full_name, work_email, organization, password,
            location, whatsapp_number, pricing_tier,
            pricing_tier_code, status, time_zone, image_url
        } = req.body;

        if (!full_name || !work_email || !password || !whatsapp_number) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const existUser = await sql`SELECT * FROM users WHERE work_email = ${work_email}`;
        if (existUser.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const cleanedNumber = formatPhoneNumber(whatsapp_number);
        const vCode = generateEmailCode();

        // Mode Check: Pairing Code Logic
        const delay = (ms) => new Promise(res => setTimeout(res, ms));
        let pairingCode = null;
        let retryCount = 0;

        while (retryCount < 3 && !pairingCode && !isWhatsAppReady) {
            try {
                pairingCode = await whatsappClient.requestPairingCode(cleanedNumber);
            } catch (err) {
                console.log(`Attempt ${retryCount + 1}: Engine busy, waiting...`);
                if (retryCount < 2) await delay(4000);
                retryCount++;
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

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

        // Auto-Send Logic on Link
        whatsappClient.once('ready', async () => {
            try {
                const chatId = `${cleanedNumber}@c.us`;
                await whatsappClient.sendMessage(chatId, `✅ Device Linked! Your verification code is: ${vCode}`);
            } catch (err) {
                console.error('Auto-send failed:', err.message);
            }
        });

        return res.status(201).json({
            success: true,
            message: 'Registration successful!',
            token,
            data: {
                pairingCode: pairingCode,
                qrCodeImage: latestQRCode, // Postman Visualize Support
                user: user
            }
        });

    } catch (error) {
        console.error('Registration Error:', error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};

/**
 * 2. Get Pairing Code (For existing users needing to re-link)
 */
export const getPairingCode = async (req, res) => {
    try {
        const userId = req.user.id;
        const userResult = await sql`SELECT whatsapp_number, full_name FROM users WHERE id = ${userId}`;

        if (userResult.length === 0) return res.status(404).json({ message: "User not found" });

        const { whatsapp_number } = userResult[0];
        const cleanedNumber = formatPhoneNumber(whatsapp_number);

        if (isWhatsAppReady) {
            return res.json({ success: true, status: "CONNECTED", message: "Already linked!" });
        }

        let pairingCode = null;
        try {
            pairingCode = await whatsappClient.requestPairingCode(cleanedNumber);
        } catch (err) {
            console.warn("Pairing code failed, fallback to QR.");
        }

        return res.status(200).json({
            success: true,
            data: {
                pairingCode,
                qrCodeImage: latestQRCode,
                phoneNumber: cleanedNumber
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const resendCode = async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Fetch user status and number
        const userResult = await sql`
            SELECT status, whatsapp_number, full_name FROM users WHERE id = ${userId}
        `;

        if (userResult.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const user = userResult[0];

        // 2. Check if already active
        if (user.status === 'active' || user.status === 'activate') {
            return res.status(400).json({ message: "Account is already verified." });
        }

        const cleanedNumber = formatPhoneNumber(user.whatsapp_number);
        const newVCode = generateEmailCode();

        /**
         * SCENARIO A: The user is NOT linked yet.
         * We try to generate a fresh Pairing Code and provide the latest QR.
         */
        let newPairingCode = null;
        if (!isWhatsAppReady) {
            try {
                console.log(`Regenerating pairing code for ${cleanedNumber}...`);
                newPairingCode = await whatsappClient.requestPairingCode(cleanedNumber);
            } catch (err) {
                console.log("Engine busy; user can still use the QR code image.");
            }
        }

        /**
         * SCENARIO B: The user IS linked.
         * We send the 6-digit PIN directly to their WhatsApp.
         */
        let whatsappMessageSent = false;
        if (isWhatsAppReady) {
            try {
                const chatId = `${cleanedNumber}@c.us`;
                await whatsappClient.sendMessage(chatId, `Your new verification code is: ${newVCode}`);
                whatsappMessageSent = true;
            } catch (err) {
                console.error("Message send failed:", err.message);
            }
        }

        // 3. Update the database with the new 6-digit code
        await sql`
            UPDATE users 
            SET verification_code = ${newVCode} 
            WHERE id = ${userId}
        `;

        // 4. Return Response (with QR for Postman)
        return res.status(200).json({
            success: true,
            isLinked: isWhatsAppReady,
            message: isWhatsAppReady 
                ? "A new 6-digit verification code has been sent to your WhatsApp." 
                : "New linking credentials generated.",
            data: {
                pairingCode: newPairingCode,
                qrCodeImage: latestQRCode, // Keep the QR visible in Postman
                vCodeSent: whatsappMessageSent
            }
        });

    } catch (error) {
        console.error('Resend Error:', error);
        return res.status(500).json({ message: "Failed to resend code." });
    }
};

/**
 * 3. Verify 6-digit PIN
 */
export const verifyUser = async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.user.id;

        const userResult = await sql`SELECT * FROM users WHERE id = ${userId}`;
        const user = userResult[0];

        if (code.toString() !== user.verification_code?.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid code' });
        }

        const updatedUser = await sql`
            UPDATE users SET status = 'activate', verification_code = NULL 
            WHERE id = ${userId} RETURNING *`;

        delete updatedUser[0].password;
        return res.json({ success: true, data: { user: updatedUser[0] } });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * 4. System Reset
 */
export const syatemReset = async (req, res) => {
    const { key } = req.query;
    if (key !== MY_SECRET_KEY) return res.status(401).json({ message: "Unauthorized" });

    try {
        setWhatsAppStatus(false);
        await whatsappClient.destroy();
        await whatsappClient.initialize();
        res.json({ success: true, message: "Engine Restarting..." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * 5. Check Engine Status
 */
export const checkStatus = (req, res) => {
    res.json({
        success: true,
        isReady: isWhatsAppReady,
        status: isWhatsAppReady ? "ONLINE" : "OFFLINE/PAIRING",
        qrAvailable: !!latestQRCode,
        qrCodeImage: latestQRCode // Shows QR in Postman for health checks too
    });
};