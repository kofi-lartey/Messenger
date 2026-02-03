import bcrypt from 'bcrypt';
import { sql } from '../Config/db.js';
import { MY_SECRET_KEY, RESEND_API_KEY, SECRET } from '../Config/env.js';
import jwt from 'jsonwebtoken';
import { generateEmailCode } from '../utils/generatedToken.js';
import { isWhatsAppReady, whatsappClient, latestQRCode, setWhatsAppStatus } from '../utils/whatsapp-client.js';
import { formatPhoneNumber } from '../utils/numberChecker.js';
import { Resend } from 'resend';

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

        // 1. Basic Validation
        if (!full_name || !work_email || !password || !whatsapp_number) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // 2. Database Check
        const existUser = await sql`SELECT * FROM users WHERE work_email = ${work_email}`;
        if (existUser.length > 0) return res.status(400).json({ message: 'User already exists' });

        const cleanedNumber = formatPhoneNumber(whatsapp_number);
        const vCode = generateEmailCode();
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Attempt Pairing Code (Resilient for Render)
        let pairingCode = null;
        if (!isWhatsAppReady) {
            try {
                pairingCode = await whatsappClient.requestPairingCode(cleanedNumber);
            } catch (err) {
                console.log("WhatsApp busy, user can use QR fallback.");
            }
        }

        // 4. Database Insertion
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

        // 5. Prepare Email with Inline QR Attachment (CID Method)
        try {
            const attachments = [];
            let qrHtml = '';

            // If a QR code is currently available in the engine, attach it
            if (latestQRCode && latestQRCode.includes('base64,')) {
                const base64Content = latestQRCode.split('base64,')[1];

                attachments.push({
                    content: base64Content,
                    filename: 'whatsapp-qr.png',
                    contentId: 'reg-qr-code', // Unique CID for this email
                    disposition: 'inline'
                });

                qrHtml = `
                    <div style="margin-top: 20px; padding: 15px; border: 1px solid #eee; border-radius: 10px; text-align: center;">
                        <h3 style="color: #25D366;">Scan to Link WhatsApp</h3>
                        <img src="cid:reg-qr-code" width="250" style="display: block; margin: 0 auto;" />
                        <p style="font-size: 12px; color: #777;">Scan this via WhatsApp > Linked Devices</p>
                    </div>
                `;
            }

            await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: work_email,
                subject: 'Welcome! Verify your account & Link WhatsApp',
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; color: #333;">
                        <h2>Welcome to Messenger, ${full_name}!</h2>
                        <p>Thank you for registering. Your account is almost ready.</p>
                        
                        <div style="background: #f4f7f6; padding: 20px; border-radius: 8px; text-align: center;">
                            <p style="margin: 0; font-size: 14px;">Your Verification Code:</p>
                            <h1 style="margin: 10px 0; color: #007bff; letter-spacing: 5px;">${vCode}</h1>
                        </div>

                        ${!isWhatsAppReady ? qrHtml : '<p style="color: green;">✅ WhatsApp Engine is already connected.</p>'}
                        
                        ${pairingCode ? `
                            <div style="margin-top: 15px; text-align: center;">
                                <p>Or use this Pairing Code on your phone:</p>
                                <code style="background: #eee; padding: 5px 10px; font-size: 18px; border-radius: 4px;">${pairingCode}</code>
                            </div>
                        ` : ''}

                        <p style="margin-top: 30px; font-size: 12px; color: #999;">
                            If you didn't request this, please ignore this email.
                        </p>
                    </div>
                `,
                attachments: attachments
            });
            console.log("Registration Email with CID QR sent.");
        } catch (e) {
            console.error("Initial Email Failed:", e.message);
        }

        // 6. Response
        return res.status(201).json({
            success: true,
            token,
            data: {
                pairingCode,
                qrCodeImage: latestQRCode,
                user
            }
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
        const userResult = await sql`
            SELECT whatsapp_number, full_name, work_email 
            FROM users WHERE id = ${userId}
        `;

        if (userResult.length === 0) return res.status(404).json({ message: "User not found" });

        const { whatsapp_number, full_name, work_email } = userResult[0];
        const cleanedNumber = formatPhoneNumber(whatsapp_number);

        // 1. Check if already connected
        if (isWhatsAppReady) {
            return res.json({
                success: true,
                status: "CONNECTED",
                message: "Device is already linked and ready!"
            });
        }

        // 2. Generate Pairing Code
        let pairingCode = null;
        try {
            console.log(`Generating pairing code for ${full_name}...`);
            pairingCode = await whatsappClient.requestPairingCode(cleanedNumber);
        } catch (err) {
            console.warn("Pairing code engine busy, falling back to email QR.");
        }

        // 3. Send Email with Inline QR (CID Method)
        let emailSent = false;
        try {
            const attachments = [];
            let qrHtml = '';

            // Attach QR if available
            if (latestQRCode && latestQRCode.includes('base64,')) {
                const base64Content = latestQRCode.split('base64,')[1];

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
                        <p>You requested a new linking code for your WhatsApp account (<strong>${cleanedNumber}</strong>).</p>
                        
                        ${qrHtml}

                        ${pairingCode ? `
                            <div style="text-align: center; background: #f9f9f9; padding: 15px; border-radius: 8px;">
                                <p style="margin-bottom: 5px;">Or use this Pairing Code on your phone:</p>
                                <b style="font-size: 22px; color: #007bff; letter-spacing: 2px;">${pairingCode}</b>
                            </div>
                        ` : ''}

                        <p style="font-size: 13px; color: #888; margin-top: 20px;">
                            Note: These codes are temporary. If they expire, simply request a new one from your dashboard.
                        </p>
                    </div>
                `,
                attachments: attachments
            });
            emailSent = true;
        } catch (mailErr) {
            console.error("Link Email Failed:", mailErr.message);
        }

        // 4. Final Response
        return res.status(200).json({
            success: true,
            status: "AWAITING_LINK",
            emailSent,
            data: {
                pairingCode,
                qrCodeImage: latestQRCode,
                phoneNumber: cleanedNumber
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