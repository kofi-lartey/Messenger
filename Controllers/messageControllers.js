import csv from 'csv-parser';
import fs from 'fs';
import { sql } from "../Config/db.js";
import { processBulkMessages } from '../Services/whatsappService.js';


export const createContact = async (req, res) => {
    try {
        // req.user is available because we use the 'authenticate' middleware
        const userId = req.user.id;
        // const userEmail = req.user.work_email; // Ensure this matches your JWT/Request property

        // 1. Fetch the user's current status from the DB
        const userResult = await sql`
                SELECT status FROM Users WHERE user_id = ${userId}
            `;

        if (userResult.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        // check if user is active
        const user = userResult[0];
        if (user.status !== 'activate' && user.status !== 'active') {
            return res.status(403).json({ message: "Please verify your account to create contacts." });
        }

        const { full_name, whatsapp_number, organization, location, group } = req.body;
        const contact = await sql`
            INSERT INTO Contacts (full_name, whatsapp_number, organization, location, contact_group)
            VALUES (${full_name}, ${whatsapp_number}, ${organization}, ${location}, ${group})
            RETURNING *
        `;
        res.status(201).json({
            message: 'Contact Added Succefully',
            Contacts: contact[0]
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// bulk contact upload function
export const uploadBulkContacts = async (req, res) => {
    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            try {
                // Bulk insert logic for PostgreSQL
                for (const row of results) {
                    await sql`
                        INSERT INTO Contacts (full_name, whatsapp_number, organization, location, contact_group)
                        VALUES (${row.fullName}, ${row.contact}, ${row.organization}, ${row.location}, ${row.group})
                        ON CONFLICT (whatsapp_number) DO NOTHING
                    `;
                }
                res.status(200).json({ message: "Bulk upload successful" });
            } catch (error) {
                res.status(500).json({ message: "Database error during bulk upload" });
            }
        });
};

// create broadcast message function
export const createBroadcast = async (req, res) => {
    try {
        const {
            campaign_name,
            message_title,
            message_body,
            media_url,
            action_link
        } = req.body;

        // Basic validation
        if (!message_body) {
            return res.status(400).json({ message: "Message body is required." });
        }

        // Insert into Neon DB
        const result = await sql`
            INSERT INTO BroadcastMessages (
                campaign_name, 
                message_title, 
                message_body, 
                media_url, 
                action_link
            )
            VALUES (
                ${campaign_name || 'General'}, 
                ${message_title || 'No Title'}, 
                ${message_body}, 
                ${media_url || null}, 
                ${action_link || null}
            )
            RETURNING *
        `;

        return res.status(201).json({
            success: true,
            message: "Broadcast message created successfully.",
            data: result[0] // Returns the ID so you can use it for scheduling
        });

    } catch (error) {
        console.error('Create Broadcast Error:', error);
        return res.status(500).json({ message: "Failed to create broadcast message." });
    }
};

// message broadcast function
export const triggerBroadcast = async (req, res) => {
    const { broadcast_id } = req.body;

    try {
        // 1. Fetch the message content
        const messageResult = await sql`
            SELECT id, message_body, media_url 
            FROM BroadcastMessages 
            WHERE id = ${broadcast_id}
        `;

        if (messageResult.length === 0) {
            return res.status(404).json({ message: "Broadcast message not found." });
        }

        const { message_body, media_url } = messageResult[0];

        // 2. Check if this message is already tied to a PENDING schedule
        // If it is, we block the manual trigger to avoid double-sending.
        const activeSchedule = await sql`
            SELECT id, scheduled_time 
            FROM ScheduledMessages 
            WHERE broadcast_id = ${broadcast_id} AND status = 'pending'
        `;

        if (activeSchedule.length > 0) {
            return res.status(400).json({
                success: false,
                message: `This message is already scheduled for ${activeSchedule[0].scheduled_time}. Please cancel the schedule before sending manually.`
            });
        }

        // 3. Fetch recipients
        const users = await sql`SELECT full_name, whatsapp_number FROM Contacts`;

        if (users.length === 0) {
            return res.status(404).json({ message: "No contacts found." });
        }

        // 4. Fire and forget: process in the background
        processBulkMessages(users, message_body, media_url);

        return res.status(200).json({
            success: true,
            message: `Manual broadcast started for ${users.length} users.`
        });

    } catch (error) {
        console.error("Manual Trigger Error:", error);
        return res.status(500).json({ message: "Server error triggering broadcast." });
    }
};