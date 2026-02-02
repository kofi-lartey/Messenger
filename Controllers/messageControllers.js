import csv from 'csv-parser';
import fs from 'fs';
import { sql } from "../Config/db.js";
import { processBulkMessages } from '../Services/whatsappService.js';

// --- CREATE CONTACT ---
export const createContact = async (req, res) => {
    try {
        // req.user is populated by our authenticate middleware
        const user = req.user;

        // Block users who haven't verified their email yet
        if (user.status !== 'active') {
            return res.status(403).json({ message: "Account pending verification. Please verify your email first." });
        }

        const { full_name, whatsapp_number, organization, location, group } = req.body;

        const contact = await sql`
            INSERT INTO contacts (full_name, whatsapp_number, organization, location, contact_group)
            VALUES (${full_name}, ${whatsapp_number}, ${organization}, ${location}, ${group})
            RETURNING *
        `;

        res.status(201).json({
            message: 'Contact added successfully',
            contact: contact[0]
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// --- BULK CONTACT UPLOAD ---
export const uploadBulkContacts = async (req, res) => {
    // Only 'active' users can bulk upload
    if (req.user.status !== 'active') {
        if (req.file) fs.unlinkSync(req.file.path); // Clean up uploaded file
        return res.status(403).json({ message: "Verify your account to use bulk upload." });
    }

    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            try {
                for (const row of results) {
                    await sql`
                        INSERT INTO contacts (full_name, whatsapp_number, organization, location, contact_group)
                        VALUES (${row.fullName}, ${row.contact}, ${row.organization}, ${row.location}, ${row.group})
                        ON CONFLICT (whatsapp_number) DO NOTHING
                    `;
                }
                fs.unlinkSync(req.file.path);
                res.status(200).json({ message: `Bulk upload successful: ${results.length} processed.` });
            } catch (error) {
                console.error("Bulk Upload Error:", error);
                res.status(500).json({ message: "Database error during bulk upload." });
            }
        });
};

// --- CREATE BROADCAST MESSAGE ---
export const createBroadcast = async (req, res) => {
    try {
        // req.user is populated by our authenticate middleware
        const user = req.user;

        // Block users who haven't verified their email yet
        if (user.status !== 'active') {
            return res.status(403).json({ message: "Account pending verification. Please verify your email first." });
        }
        
        const { campaign_name, message_title, message_body, media_url, action_link } = req.body;

        if (!message_body) {
            return res.status(400).json({ message: "Message body is required." });
        }

        const result = await sql`
            INSERT INTO broadcastmessages (campaign_name, message_title, message_body, media_url, action_link)
            VALUES (${campaign_name || 'General'}, ${message_title || 'No Title'}, ${message_body}, ${media_url || null}, ${action_link || null})
            RETURNING *
        `;

        return res.status(201).json({
            success: true,
            message: "Broadcast template saved.",
            data: result[0]
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to create broadcast message." });
    }
};

// --- TRIGGER BROADCAST (MANUAL) ---
export const triggerBroadcast = async (req, res) => {
    // SECURITY: Only active users can trigger the WhatsApp Engine
    if (req.user.status !== 'active') {
        return res.status(403).json({ message: "Unauthorized. Please activate your account." });
    }

    const { broadcast_id } = req.body;

    try {
        const messageResult = await sql`
            SELECT id, message_body, media_url FROM broadcastmessages WHERE id = ${broadcast_id}
        `;

        if (messageResult.length === 0) {
            return res.status(404).json({ message: "Message template not found." });
        }

        const { message_body, media_url } = messageResult[0];

        // Ensure we don't duplicate a scheduled task
        const activeSchedule = await sql`
            SELECT id, scheduled_time FROM scheduledmessages 
            WHERE broadcast_id = ${broadcast_id} AND status = 'pending'
        `;

        if (activeSchedule.length > 0) {
            return res.status(400).json({
                message: `This message is already scheduled for ${activeSchedule[0].scheduled_time}.`
            });
        }

        const recipients = await sql`SELECT full_name, whatsapp_number FROM contacts`;

        if (recipients.length === 0) {
            return res.status(404).json({ message: "No contacts to message." });
        }

        // Fire the background service
        processBulkMessages(recipients, message_body, media_url);

        return res.status(200).json({
            success: true,
            message: `Engine started for ${recipients.length} contacts.`
        });

    } catch (error) {
        res.status(500).json({ message: "Server error triggering broadcast." });
    }
};