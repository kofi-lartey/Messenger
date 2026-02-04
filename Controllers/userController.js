import bcrypt from 'bcrypt';
import { sql } from '../Config/db.js';
import { MY_SECRET_KEY, RESEND_API_KEY, SECRET } from '../Config/env.js';
import jwt from 'jsonwebtoken';
import { generateEmailCode } from '../utils/generatedToken.js';
import { isWhatsAppReady, whatsappClient, latestQRCode, setWhatsAppStatus } from '../utils/whatsapp-client.js';
import { formatPhoneNumber } from '../utils/numberChecker.js';
import { Resend } from 'resend';
import { getClient, initializeUserWhatsApp } from '../utils/WhatsAppManager.js';

/**
 * 1. Register User & Return QR/Pairing Code
 */
const resend = new Resend(RESEND_API_KEY);


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
        if (existUser.length > 0) return res.status(400).json({ message: 'User already exists' });

        const cleanedNumber = formatPhoneNumber(whatsapp_number);
        const vCode = generateEmailCode();
        const hashedPassword = await bcrypt.hash(password, 10);

        // 1. Insert User into Database
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
        const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '1h' });

        // 2. KICK OFF WHATSAPP ENGINE (Browserless)
        // We don't 'await' this because it takes time to generate a QR
        initializeUserWhatsApp(user.id).catch(err => console.error("Init Error:", err));

        // 3. Initial Welcome Email
        try {
            await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: work_email,
                subject: 'Welcome! Verify your account',
                html: `
                    <div style="font-family: sans-serif;">
                        <h2>Welcome ${full_name}!</h2>
                        <p>Your verification code is: <strong>${vCode}</strong></p>
                        <p>We are currently setting up your WhatsApp environment. 
                        Please log in to your dashboard to scan your linking QR code.</p>
                    </div>
                `
            });
        } catch (e) { console.error("Email error:", e.message); }

        return res.status(201).json({
            success: true,
            token,
            message: "User registered. WhatsApp engine initializing...",
            user
        });

    } catch (error) {
        console.error('Registration Error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
/**
 * 2. Get Pairing Code (For existing users needing to re-link)
 */
export const getPairingCode = async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Fetch user data (Including session)
        const userResult = await sql`
            SELECT whatsapp_number, full_name, work_email, whatsapp_status, last_qr_code, whatsapp_session 
            FROM users WHERE id = ${userId}
        `;

        if (userResult.length === 0) return res.status(404).json({ message: "User not found" });

        const { whatsapp_number, full_name, work_email, whatsapp_status, last_qr_code, whatsapp_session } = userResult[0];
        const cleanedNumber = formatPhoneNumber(whatsapp_number);

        // 2. Check current status
        if (whatsapp_status === "CONNECTED") {
            return res.json({
                success: true,
                status: "CONNECTED",
                message: "Device is already linked and ready!"
            });
        }

        // 3. Get or Initialize this specific user's client
        let client = getClient(userId);
        
        if (!client) {
            console.log(`No active engine for ${full_name}. Initializing...`);
            // This will also restore session from DB if whatsapp_session exists
            client = await initializeUserWhatsApp(userId);
        }

        // 4. Generate Pairing Code
        let pairingCode = null;
        try {
            console.log(`Requesting pairing code for ${full_name}...`);
            pairingCode = await client.requestPairingCode(cleanedNumber);
        } catch (err) {
            console.warn("Pairing code engine busy or session restoring.");
        }

        // 5. Send Email with Inline QR (Using the QR saved in NeonDB)
        let emailSent = false;
        try {
            const attachments = [];
            let qrHtml = '';

            // last_qr_code is updated via the 'qr' event in our Manager
            if (last_qr_code && last_qr_code.includes('base64,')) {
                const base64Content = last_qr_code.split('base64,')[1];

                attachments.push({
                    content: base64Content,
                    filename: 'link-qr.png',
                    contentId: 'link-qr-code',
                    disposition: 'inline'
                });

                qrHtml = `
                    <div style="text-align: center; margin: 20px 0; padding: 15px; border: 2px dashed #25D366; border-radius: 10px;">
                        <h3 style="color: #075E54;">Scan to Link Device</h3>
                        <img src="cid:link-qr-code" width="250" style="display: block; margin: 0 auto;" />
                        <p style="font-size: 12px; color: #666;">Settings > Linked Devices > Link a Device</p>
                    </div>
                `;
            }

            await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: work_email,
                subject: 'Action Required: Link your WhatsApp Device',
                html: `
                    <div style="font-family: sans-serif; max-width: 500px; color: #333;">
                        <h2>Hello ${full_name},</h2>
                        <p>Link your WhatsApp account (<strong>${cleanedNumber}</strong>) to start sending messages.</p>
                        ${qrHtml}
                        ${pairingCode ? `
                            <div style="text-align: center; background: #f9f9f9; padding: 15px; border-radius: 8px;">
                                <p style="margin-bottom: 5px;">Or use this Pairing Code on your phone:</p>
                                <b style="font-size: 22px; color: #007bff; letter-spacing: 2px;">${pairingCode}</b>
                            </div>
                        ` : ''}
                        <p style="font-size: 13px; color: #888; margin-top: 20px;">
                            Note: If you don't see a QR code, the engine is still warming up.
                        </p>
                    </div>
                `,
                attachments: attachments
            });
            emailSent = true;
        } catch (mailErr) {
            console.error("Link Email Failed:", mailErr.message);
        }

        // 6. Final Response
        return res.status(200).json({
            success: true,
            status: whatsapp_status || "INITIALIZING",
            emailSent,
            data: {
                pairingCode,
                qrCodeImage: last_qr_code,
                phoneNumber: cleanedNumber
            }
        });

    } catch (err) {
        console.error("Pairing Auth Error:", err.stack); // stack gives more detail than message
        return res.status(500).json({
            success: false,
            message: "Internal server error during pairing generation."
        });
    }
};

export const resendCode = async (req, res) => {
    try {
        const userId = req.user.id;
        const userResult = await sql`SELECT * FROM users WHERE id = ${userId}`;
        if (userResult.length === 0) return res.status(404).json({ message: "User not found" });

        const user = userResult[0];
        const newVCode = generateEmailCode();
        const cleanedNumber = formatPhoneNumber(user.whatsapp_number);

        // 1. Update Database
        await sql`UPDATE users SET verification_code = ${newVCode} WHERE id = ${userId}`;

        // 2. Try WhatsApp (if engine is ready)
        let whatsappSent = false;
        if (isWhatsAppReady) {
            try {
                await whatsappClient.sendMessage(`${cleanedNumber}@c.us`, `Your new code: ${newVCode}`);
                whatsappSent = true;
            } catch (err) { console.log("WhatsApp message failed."); }
        }

        // 3. Try Email (Resend)
        let emailSent = false;
        try {
            await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: user.work_email,
                subject: 'New Verification Code',
                html: `<strong>${newVCode}</strong>`
            });
            emailSent = true;
        } catch (mailErr) { console.error("Resend Error:", mailErr.message); }

        // 4. Generate fresh Pairing Code for the response
        let freshPairingCode = null;
        if (!isWhatsAppReady) {
            try { freshPairingCode = await whatsappClient.requestPairingCode(cleanedNumber); } catch (e) { }
        }

        return res.status(200).json({
            success: true,
            message: emailSent ? "Code sent to email." : "Code updated.",
            data: {
                emailSent,
                whatsappSent,
                pairingCode: freshPairingCode,
                qrCodeImage: latestQRCode
            }
        });

    } catch (error) {
        res.status(500).json({ message: "Failed to resend" });
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

// login user
export const loginUser = async (req, res) => {
    try {
        const { whatsapp_number, password } = req.body;
        if (!whatsapp_number || !password) {
            return res.status(400).json({ message: 'Missing whatsapp number or password' });
        }
        const cleanedNumber = formatPhoneNumber(whatsapp_number);
        const userResult = await sql`
        SELECT * FROM users WHERE whatsapp_number = ${cleanedNumber}
        `;
        if (userResult.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const user = userResult[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid password' });
        }
        delete user.password;
        const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '1h' });
        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            data: {
                user: user
            }
        })

    } catch (error) {
        console.error('Login Error:', error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
}