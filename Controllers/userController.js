import bcrypt from 'bcrypt';
import { sql } from '../Config/db.js';
import { MY_SECRET_KEY, RESEND_API_KEY, SECRET } from '../Config/env.js';
import jwt from 'jsonwebtoken';
import { generateEmailCode } from '../utils/generatedToken.js';
import { formatPhoneNumber } from '../utils/numberChecker.js';
import { Resend } from 'resend';
import { generateWhatsAppUrl } from '../Services/whatsappChatApi.js';

/**
 * 0. Login User
 */
export const loginUser = async (req, res) => {
    try {
        const { whatsapp_number, password } = req.body;

        if (!whatsapp_number || !password) {
            return res.status(400).json({ message: 'WhatsApp number and password are required' });
        }

        // Clean phone number
        const cleanedNumber = formatPhoneNumber(whatsapp_number);

        // Find user by WhatsApp number
        const userResult = await sql`SELECT * FROM users WHERE whatsapp_number = ${cleanedNumber}`;
        if (userResult.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = userResult[0];

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Check if user is verified
        if (user.status !== 'activate') {
            return res.status(403).json({
                message: 'Account not verified. Please verify your email first.',
                requiresVerification: true
            });
        }

        // Generate token
        const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '7d' });

        // Remove password from response
        delete user.password;

        return res.json({
            success: true,
            token,
            user
        });

    } catch (error) {
        console.error('Login Error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * 1. Register User with Email & WhatsApp Verification
 */
const resendEmail = new Resend(RESEND_API_KEY);


export const registerUser = async (req, res) => {
    try {
        const {
            full_name, work_email, organization, password,
            location, whatsapp_number, pricing_tier,
            pricing_tier_code, status, time_zone, image_url,
            verification_method  // 'email', 'whatsapp', or 'both'
        } = req.body;

        if (!full_name || !work_email || !password || !whatsapp_number) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const existUser = await sql`SELECT * FROM users WHERE work_email = ${work_email}`;
        if (existUser.length > 0) return res.status(400).json({ message: 'User already exists' });

        const existUserNumber = await sql`SELECT * FROM users WHERE whatsapp_number = ${whatsapp_number}`;
        if (existUserNumber.length > 0) return res.status(400).json({ message: 'User already exists' });

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

        // 2. Send verification via Email
        try {
            await resendEmail.emails.send({
                from: 'onboarding@resend.dev',
                to: work_email,
                subject: 'Welcome! Verify your account',
                html: `
                    <div style="font-family: sans-serif;">
                        <h2>Welcome ${full_name}!</h2>
                        <p>Your verification code is: <strong>${vCode}</strong></p>
                        <p>Or verify via WhatsApp using this link:</p>
                        <a href="${generateWhatsAppUrl(cleanedNumber, `My verification code is: ${vCode}`)}" 
                           style="background: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                           Verify via WhatsApp
                        </a>
                    </div>
                `
            });
        } catch (e) {
            console.error("Email error:", e.message);
        }

        // 3. Send verification via WhatsApp (Chat API - wa.me link)
        const waMeUrl = generateWhatsAppUrl(cleanedNumber, `Hi ${full_name}! Your verification code is: ${vCode}`);

        return res.status(201).json({
            success: true,
            token,
            message: "User registered. Verify via email or WhatsApp.",
            verification: {
                method: 'both',
                emailSent: true,
                whatsappLink: waMeUrl,
                code: vCode  // Only for development/testing
            },
            user
        });

    } catch (error) {
        console.error('Registration Error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * 2. Resend Verification Code (Email + WhatsApp)
 */
export const resendCode = async (req, res) => {
    try {
        const userId = req.user.id;
        const { method } = req.body; // 'email', 'whatsapp', or 'both'

        const userResult = await sql`SELECT * FROM users WHERE id = ${userId}`;
        if (userResult.length === 0) return res.status(404).json({ message: "User not found" });

        const user = userResult[0];
        const newVCode = generateEmailCode();
        const cleanedNumber = formatPhoneNumber(user.whatsapp_number);

        // Update database with new code
        await sql`UPDATE users SET verification_code = ${newVCode} WHERE id = ${userId}`;

        let emailSent = false;
        let whatsappSent = false;
        let waMeUrl = null;

        // Send via Email
        if (method === 'email' || method === 'both') {
            try {
                await resendEmail.emails.send({
                    from: 'onboarding@resend.dev',
                    to: user.work_email,
                    subject: 'New Verification Code',
                    html: `
                        <div style="font-family: sans-serif;">
                            <h2>Your New Verification Code</h2>
                            <p><strong>${newVCode}</strong></p>
                            <p>Or verify via WhatsApp:</p>
                            <a href="${generateWhatsAppUrl(cleanedNumber, `My verification code is: ${newVCode}`)}" 
                               style="background: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                               Verify via WhatsApp
                            </a>
                        </div>
                    `
                });
                emailSent = true;
            } catch (e) {
                console.error("Email error:", e.message);
            }
        }

        // Generate WhatsApp link (always available as fallback)
        waMeUrl = generateWhatsAppUrl(cleanedNumber, `Your verification code is: ${newVCode}`);

        return res.status(200).json({
            success: true,
            message: "Verification code sent.",
            verification: {
                emailSent,
                whatsappLink: waMeUrl,
                code: newVCode  // Only for development/testing
            }
        });

    } catch (error) {
        console.error("Resend error:", error);
        res.status(500).json({ message: "Failed to resend code" });
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
 * 4. Get Pairing Code (WhatsApp Chat API - wa.me link only)
 * No device linking needed - users message us via wa.me link
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

        // Generate WhatsApp Chat API link for linking
        const waMeUrl = generateWhatsAppUrl(cleanedNumber,
            `Hi! I want to link my WhatsApp account to the Messenger platform. My User ID: ${userId}`);

        // Send email with the wa.me link
        let emailSent = false;
        try {
            await resendEmail.emails.send({
                from: 'onboarding@resend.dev',
                to: work_email,
                subject: 'Link your WhatsApp to Messenger',
                html: `
                    <div style="font-family: sans-serif; max-width: 500px; color: #333;">
                        <h2>Hello ${full_name},</h2>
                        <p>To link your WhatsApp account (<strong>${cleanedNumber}</strong>) to Messenger:</p>
                        <ol style="line-height: 1.6;">
                            <li>Click the button below to open WhatsApp</li>
                            <li>Send the pre-filled message (do not edit)</li>
                            <li>You're now linked!</li>
                        </ol>
                        <p style="margin-top: 20px;">
                            <a href="${waMeUrl}" 
                               style="background: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                               Link via WhatsApp
                            </a>
                        </p>
                        <p style="margin-top: 20px; font-size: 13px; color: #888;">
                            <strong>Note:</strong> This uses WhatsApp's free Chat API. No device linking required!
                        </p>
                    </div>
                `
            });
            emailSent = true;
        } catch (mailErr) {
            console.error("Link Email Failed:", mailErr.message);
        }

        return res.status(200).json({
            success: true,
            status: "CHAT_API", // No device linking, uses wa.me
            emailSent,
            data: {
                phoneNumber: cleanedNumber,
                whatsappLink: waMeUrl,
                instructions: "Click the link to open WhatsApp and send the pre-filled message to link your account"
            }
        });

    } catch (err) {
        console.error("Pairing Error:", err.stack);
        return res.status(500).json({
            success: false,
            message: "Internal server error during pairing generation."
        });
    }
};

/**
 * 5. System Reset
 */
export const syatemReset = async (req, res) => {
    const { key } = req.query;
    if (key !== MY_SECRET_KEY) return res.status(401).json({ message: "Unauthorized" });

    try {
        res.json({ success: true, message: "System reset endpoint" });
    } catch (error) {
        res.status(500).json({ message: "Reset failed" });
    }
};

/**
 * 6. Get User Dashboard (Menu)
 */
export const getDashboard = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user info
        const userResult = await sql`
            SELECT id, full_name, work_email, whatsapp_number, organization, status, created_at
            FROM users WHERE id = ${userId}
        `;

        // Get contact count
        const contactsResult = await sql`
            SELECT COUNT(*) as total FROM contacts WHERE created_by = ${userId}
        `;

        // Get broadcast count
        const broadcastsResult = await sql`
            SELECT COUNT(*) as total FROM broadcastmessages WHERE created_by = ${userId}
        `;

        return res.status(200).json({
            success: true,
            data: {
                user: userResult[0],
                stats: {
                    totalContacts: parseInt(contactsResult[0]?.total || 0),
                    totalBroadcasts: parseInt(broadcastsResult[0]?.total || 0)
                }
            }
        });
    } catch (error) {
        console.error('Dashboard Error:', error);
        res.status(500).json({ message: 'Error loading dashboard' });
    }
};
