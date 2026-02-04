import csv from 'csv-parser';
import fs from 'fs';
import { sql } from "../Config/db.js";
import { processBulkMessages } from '../Services/whatsappService.js';
import { sendBroadcastViaChatApi, generateBroadcastCsv, generateWhatsAppUrl, personalizeMessage } from '../Services/whatsappChatApi.js';

// --- CREATE CONTACT ---
export const createContact = async (req, res) => {
    try {
        const user = req.user;

        if (user.status !== 'activate') {
            return res.status(403).json({ message: "Account pending verification. Please verify your email first." });
        }

        const { full_name, whatsapp_number, organization, location, group } = req.body;

        const contact = await sql`
            INSERT INTO contacts (full_name, whatsapp_number, organization, location, contact_group)
            VALUES (${full_name}, ${whatsapp_number}, ${organization}, ${location}, ${group || 'MEMBERS'})
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
    if (req.user.status !== 'active') {
        if (req.file) fs.unlinkSync(req.file.path);
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
                        VALUES (${row.fullName}, ${row.contact}, ${row.organization}, ${row.location}, ${row.group || 'MEMBERS'})
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
        const user = req.user;

        if (user.status !== 'active') {
            return res.status(403).json({ message: "Account pending verification. Please verify your email first." });
        }

        const {
            campaign_name,
            message_title,
            message_body,
            media_url,
            action_link,
            scheduled_time,  // Optional: ISO datetime string
            use_chat_api     // true = no linking needed
        } = req.body;

        if (!message_body) {
            return res.status(400).json({ message: "Message body is required." });
        }

        // Create the broadcast message first
        const broadcastResult = await sql`
            INSERT INTO broadcastmessages (campaign_name, message_title, message_body, media_url, action_link)
            VALUES (${campaign_name || 'General'}, ${message_title || 'No Title'}, ${message_body}, ${media_url || null}, ${action_link || null})
            RETURNING *
        `;

        const broadcastId = broadcastResult[0].id;

        // If scheduled_time is provided, create a scheduled entry
        if (scheduled_time) {
            await sql`
                INSERT INTO scheduledmessages (broadcast_id, scheduled_time, status, use_chat_api)
                VALUES (${broadcastId}, ${new Date(scheduled_time).toISOString()}, 'pending', ${use_chat_api || false})
            `;

            return res.status(201).json({
                success: true,
                message: "Broadcast created and scheduled!",
                data: {
                    broadcast_id: broadcastId,
                    scheduled_time: scheduled_time,
                    type: 'scheduled'
                }
            });
        }

        return res.status(201).json({
            success: true,
            message: "Broadcast created. Click 'Send' to deliver now.",
            data: {
                broadcast_id: broadcastId,
                type: 'immediate'
            }
        });

    } catch (error) {
        console.error("Create broadcast error:", error);
        res.status(500).json({ message: "Failed to create broadcast message." });
    }
};

// --- TRIGGER BROADCAST (IMMEDIATE SENDING) ---
export const triggerBroadcast = async (req, res) => {
    if (req.user.status !== 'active') {
        return res.status(403).json({ message: "Unauthorized. Please activate your account." });
    }

    const { broadcast_id, method } = req.body;

    try {
        // Get the broadcast message
        const messageResult = await sql`
            SELECT id, message_body, media_url FROM broadcastmessages WHERE id = ${broadcast_id}
        `;

        if (messageResult.length === 0) {
            return res.status(404).json({ message: "Message template not found." });
        }

        const { message_body, media_url } = messageResult[0];
        const contacts = await sql`SELECT full_name, whatsapp_number FROM contacts`;

        if (contacts.length === 0) {
            return res.status(404).json({ message: "No contacts to message." });
        }

        // Send based on method
        if (method === 'chat_api') {
            // Chat API - generate links
            const chatApiResult = await sendBroadcastViaChatApi(broadcast_id);
            return res.status(200).json({
                success: true,
                method: 'chat_api',
                message: `Generated ${chatApiResult.data?.totalRecipients || 0} WhatsApp links`,
                ...chatApiResult
            });
        } else {
            // WhatsApp Web - send actual messages
            processBulkMessages(contacts, message_body, media_url);

            return res.status(200).json({
                success: true,
                method: 'whatsapp_web',
                message: `🚀 Started sending to ${contacts.length} contacts...`,
                note: 'Messages sent in background'
            });
        }

    } catch (error) {
        console.error("Broadcast error:", error);
        res.status(500).json({ message: "Server error triggering broadcast." });
    }
};

// --- GET BROADCAST STATUS ---
export const getBroadcastStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const broadcastResult = await sql`
            SELECT * FROM broadcastmessages WHERE id = ${id}
        `;

        if (broadcastResult.length === 0) {
            return res.status(404).json({ message: "Broadcast not found." });
        }

        // Check if there's a schedule
        const scheduleResult = await sql`
            SELECT * FROM scheduledmessages WHERE broadcast_id = ${id}
        `;

        return res.status(200).json({
            success: true,
            data: {
                ...broadcastResult[0],
                schedule: scheduleResult[0] || null
            }
        });

    } catch (error) {
        res.status(500).json({ message: "Error getting broadcast status." });
    }
};

// --- GET ALL BROADCASTS ---
export const getAllBroadcasts = async (req, res) => {
    try {
        // Get all broadcasts
        const broadcasts = await sql`
            SELECT * FROM broadcastmessages 
            ORDER BY created_at DESC
        `;

        // Get all scheduled messages with their broadcasts
        const scheduled = await sql`
            SELECT sm.*, bm.message_body, bm.media_url
            FROM scheduledmessages sm
            JOIN broadcastmessages bm ON sm.broadcast_id = bm.id
            ORDER BY sm.scheduled_time DESC
        `;

        return res.status(200).json({
            success: true,
            data: {
                broadcasts: broadcasts,
                scheduled: scheduled
            }
        });

    } catch (error) {
        res.status(500).json({ message: "Error getting broadcasts." });
    }
};

// --- CANCEL SCHEDULED BROADCAST ---
export const cancelScheduledBroadcast = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await sql`
            UPDATE scheduledmessages 
            SET status = 'cancelled' 
            WHERE id = ${id} AND status = 'pending'
            RETURNING *
        `;

        if (result.length === 0) {
            return res.status(404).json({
                message: "Scheduled broadcast not found or already sent."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Scheduled broadcast cancelled."
        });

    } catch (error) {
        res.status(500).json({ message: "Error cancelling broadcast." });
    }
};

// --- GET SINGLE CONTACT WHATSAPP LINK ---
export const getContactWhatsAppLink = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;

        const contactResult = await sql`
            SELECT full_name, whatsapp_number FROM contacts WHERE id = ${id}
        `;

        if (contactResult.length === 0) {
            return res.status(404).json({ message: "Contact not found." });
        }

        const contact = contactResult[0];
        const personalizedMessage = personalizeMessage(message || 'Hello {name}!', contact.full_name);
        const waMeUrl = generateWhatsAppUrl(contact.whatsapp_number, personalizedMessage);

        return res.status(200).json({
            success: true,
            data: {
                name: contact.full_name,
                phone: contact.whatsapp_number,
                message: personalizedMessage,
                waMeUrl: waMeUrl
            }
        });

    } catch (error) {
        res.status(500).json({ message: "Error generating WhatsApp link." });
    }
};

// --- DOWNLOAD BROADCAST LINKS AS CSV ---
export const downloadBroadcastLinks = async (req, res) => {
    try {
        const { id } = req.params;

        const messageResult = await sql`
            SELECT message_body FROM broadcastmessages WHERE id = ${id}
        `;

        if (messageResult.length === 0) {
            return res.status(404).json({ message: "Message template not found." });
        }

        const contacts = await sql`SELECT full_name, whatsapp_number FROM contacts`;
        const csv = generateBroadcastCsv(contacts, messageResult[0].message_body);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=broadcast-${id}.csv`);
        return res.send(csv);

    } catch (error) {
        res.status(500).json({ message: "Error generating CSV." });
    }
};
