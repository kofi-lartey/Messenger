import https from 'https';
import csv from 'csv-parser';
import fs from 'fs';
import { sql } from "../Config/db.js";
import cloudinary from "../utils/cloudinary.js";
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
            INSERT INTO contacts (full_name, whatsapp_number, organization, location, contact_group, created_by)
            VALUES (${full_name}, ${whatsapp_number}, ${organization}, ${location}, ${group || 'MEMBERS'}, ${user.id})
            RETURNING *
        `;

        res.status(201).json({
            message: 'Contact added successfully',
            contact: contact[0],
            createdBy: {
                id: user.id,
                full_name: user.full_name,
                work_email: user.work_email
            }
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// export const uploadBulkContacts = async (req, res) => {
//     // 1. Security Check
//     if (req.user.status !== 'activate') {
//         // Clean up uploaded file from Cloudinary if exists
//         if (req.file) {
//             try {
//                 await cloudinary.uploader.destroy(req.file.filename);
//             } catch (e) { }
//         }
//         return res.status(403).json({ message: "Verify your account to use bulk upload." });
//     }

//     // Check if file was uploaded
//     if (!req.file) {
//         return res.status(400).json({ message: "CSV file is required." });
//     }

//     const validGroups = ['VIP', 'SUPPORT', 'VENDOR', 'MARKETERS', 'LOGISTICS', 'PARTNERS', 'MEMBERS', 'STAFF'];
//     const results = [];

//     // Temp file path for processing (use relative path for Windows compatibility)
//     const tempPath = `./temp_${Date.now()}_${req.file.originalname}`;

//     try {
//         // Get the file URL from Cloudinary (already uploaded by multer-storage-cloudinary)
//         const fileUrl = req.file.secure_url;

//         console.log("File URL:", fileUrl);
//         console.log("req.file:", JSON.stringify(req.file, null, 2));

//         if (!fileUrl) {
//             throw new Error('No secure_url available from uploaded file. Check Cloudinary configuration.');
//         }

//         // Download file using https module
//         await new Promise((resolve, reject) => {
//             https.get(fileUrl, (response) => {
//                 if (response.statusCode !== 200) {
//                     reject(new Error(`Failed to download: ${response.statusCode}`));
//                     return;
//                 }
//                 const chunks = [];
//                 response.on('data', chunk => chunks.push(chunk));
//                 response.on('end', () => {
//                     fs.writeFileSync(tempPath, Buffer.concat(chunks));
//                     resolve();
//                 });
//                 response.on('error', reject);
//             }).on('error', reject);
//         });
//     } catch (e) {
//         console.error("Error downloading from Cloudinary:", e);
//         return res.status(500).json({ message: "Error processing uploaded file." });
//     }

//     // 2. Stream and Parse CSV
//     fs.createReadStream(tempPath)
//         .pipe(csv())
//         .on('data', (data) => results.push(data))
//         .on('error', async (err) => {
//             // Clean up temp file
//             if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
//             console.error("CSV Parse Error:", err);
//             res.status(400).json({ message: "Error parsing CSV file." });
//         })
//         .on('end', async () => {
//             try {
//                 // Clean up temp file
//                 if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

//                 if (results.length === 0) {
//                     return res.status(400).json({ message: "The CSV file is empty." });
//                 }

//                 // 3. Transform and Validate Data for Batch Insert
//                 const contactsToInsert = results.map(row => ({
//                     full_name: row.fullName || row.full_name || 'Unknown',
//                     whatsapp_number: row.contact || row.whatsapp_number,
//                     organization: row.organization || 'N/A',
//                     location: row.location || 'N/A',
//                     contact_group: validGroups.includes(row.group?.toUpperCase())
//                         ? row.group.toUpperCase()
//                         : 'MEMBERS',
//                     created_by: req.user.id
//                 }));

//                 // 4. Perform High-Speed Batch Insert
//                 await sql`
//                     INSERT INTO contacts ${sql(contactsToInsert,
//                     'full_name',
//                     'whatsapp_number',
//                     'organization',
//                     'location',
//                     'contact_group',
//                     'created_by'
//                 )}
//                     ON CONFLICT (whatsapp_number) DO NOTHING
//                 `;

//                 res.status(200).json({
//                     message: `Bulk upload successful: ${results.length} contacts processed.`,
//                     summary: {
//                         total: results.length,
//                         uploaded_by: req.user.full_name
//                     },
//                     createdBy: {
//                         id: req.user.id,
//                         full_name: req.user.full_name,
//                         work_email: req.user.work_email
//                     }
//                 });

//             } catch (error) {
//                 console.error("Bulk Upload Error:", error);
//                 res.status(500).json({ message: "Database error during bulk upload." });
//             }
//         });
// };

// --- CREATE BROADCAST MESSAGE ---
export const uploadBulkContacts = async (req, res) => {
    // 1. Security Check - using 'activate' as requested
    if (req.user.status !== 'activate') {
        if (req.file) {
            try {
                // Multer-storage-cloudinary usually puts the public_id in req.file.filename
                await cloudinary.uploader.destroy(req.file.filename);
            } catch (e) { console.error("Cloudinary Cleanup Error:", e.message); }
        }
        return res.status(403).json({ message: "Verify your account to use bulk upload." });
    }

    if (!req.file) {
        return res.status(400).json({ message: "CSV file is required." });
    }

    const validGroups = ['VIP', 'SUPPORT', 'VENDOR', 'MARKETERS', 'LOGISTICS', 'PARTNERS', 'MEMBERS', 'STAFF'];
    const results = [];

    // Cloudinary URL is stored in path or secure_url
    const fileUrl = req.file.path || req.file.secure_url;

    // 2. Stream Directly from Cloudinary
    https.get(fileUrl, (response) => {
        if (response.statusCode !== 200) {
            return res.status(500).json({ message: "Failed to download CSV from cloud storage." });
        }

        response.pipe(csv())
            .on('data', (data) => {
                // Only push if the row isn't completely empty
                if (Object.values(data).some(val => val)) {
                    results.push(data);
                }
            })
            .on('error', (err) => {
                console.error("CSV Parse Error:", err);
                if (!res.headersSent) res.status(400).json({ message: "Error parsing CSV file content." });
            })
            .on('end', async () => {
                try {
                    if (results.length === 0) {
                        return res.status(400).json({ message: "The CSV file is empty." });
                    }

                    // 3. Transform Data for Batch Insert
                    const contactsToInsert = results.map(row => ({
                        full_name: row.fullName || row.full_name || 'Unknown',
                        whatsapp_number: String(row.contact || row.whatsapp_number).replace(/\s+/g, ''),
                        organization: row.organization || 'N/A',
                        location: row.location || 'N/A',
                        contact_group: validGroups.includes(row.group?.toUpperCase())
                            ? row.group.toUpperCase()
                            : 'MEMBERS',
                        created_by: req.user.id
                    }));

                    // 4. Batch Insert (Neon/Postgres.js syntax)
                    await sql`
                        INSERT INTO contacts ${sql(contactsToInsert,
                        'full_name', 'whatsapp_number', 'organization', 'location', 'contact_group', 'created_by'
                    )}
                        ON CONFLICT (whatsapp_number) DO NOTHING
                    `;

                    // 5. Success Response
                    res.status(200).json({
                        message: `Bulk upload successful: ${results.length} contacts processed.`,
                        summary: {
                            total_rows: results.length,
                            status: "Success"
                        },
                        createdBy: {
                            id: req.user.id,
                            full_name: req.user.full_name,
                            work_email: req.user.work_email
                        }
                    });

                } catch (error) {
                    console.error("Bulk Upload DB Error:", error);
                    if (!res.headersSent) res.status(500).json({ message: "Database error during bulk upload." });
                }
            });
    }).on('error', (e) => {
        console.error("Cloudinary Stream Error:", e);
        if (!res.headersSent) res.status(500).json({ message: "Error retrieving file from Cloudinary." });
    });
};

export const createBroadcast = async (req, res) => {
    try {
        const user = req.user;

        if (user.status !== 'activate') {
            // Clean up uploaded file from Cloudinary if exists
            if (req.file) {
                try {
                    await cloudinary.uploader.destroy(req.file.filename);
                } catch (e) { }
            }
            return res.status(403).json({ message: "Account pending verification. Please verify your email first." });
        }

        const {
            campaign_name,
            message_title,
            message_body,
            action_link,
            scheduled_time,  // Optional: ISO datetime string
            use_chat_api     // true = no linking needed
        } = req.body;

        if (!message_body) {
            return res.status(400).json({ message: "Message body is required." });
        }

        // Get media_url from uploaded file or body
        const media_url = req.file ? req.file.path : req.body.media_url;

        // Create the broadcast message first
        const broadcastResult = await sql`
            INSERT INTO broadcastmessages (campaign_name, message_title, message_body, media_url, action_link, created_by)
            VALUES (${campaign_name || 'General'}, ${message_title || 'No Title'}, ${message_body}, ${media_url || null}, ${action_link || null}, ${user.id})
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
                    type: 'scheduled',
                    media_url: media_url || null
                },
                createdBy: {
                    id: user.id,
                    full_name: user.full_name,
                    work_email: user.work_email
                }
            });
        }

        return res.status(201).json({
            success: true,
            message: "Broadcast created. Click 'Send' to deliver now.",
            data: {
                broadcast_id: broadcastId,
                type: 'immediate',
                media_url: media_url || null
            },
            createdBy: {
                id: user.id,
                full_name: user.full_name,
                work_email: user.work_email
            }
        });

    } catch (error) {
        console.error("Create broadcast error:", error);
        // Clean up uploaded file from Cloudinary if exists
        if (req.file) {
            try {
                await cloudinary.uploader.destroy(req.file.filename);
            } catch (e) { }
        }
        res.status(500).json({ message: "Failed to create broadcast message." });
    }
};

// --- TRIGGER BROADCAST (IMMEDIATE SENDING) ---
export const triggerBroadcast = async (req, res) => {
    if (req.user.status !== 'activate') {
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
