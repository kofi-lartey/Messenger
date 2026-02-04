/**
 * WhatsApp Web Service
 * Handles sending messages via WhatsApp Web (Puppeteer)
 */

import { sql } from "../Config/db.js";

/**
 * Process bulk messages via WhatsApp Web
 * @param {Array} contacts - Array of contact objects { full_name, whatsapp_number }
 * @param {string} messageBody - Message template with {name} placeholder
 * @param {string} mediaUrl - Optional media URL to send
 */
export const processBulkMessages = async (contacts, messageBody, mediaUrl) => {
    try {
        console.log(`[WhatsApp Service] Starting bulk send to ${contacts.length} contacts`);

        for (const contact of contacts) {
            try {
                // Personalize message with contact name
                const personalizedMessage = messageBody.replace(/\{name\}/gi, contact.full_name);

                // Log the message to be sent (actual sending would require WhatsApp Web/Puppeteer setup)
                console.log(`[WhatsApp Service] Would send to ${contact.whatsapp_number}: ${personalizedMessage.substring(0, 50)}...`);

                // Store in sent_messages table for tracking
                await sql`
                    INSERT INTO sent_messages (contact_id, broadcast_id, status, sent_at)
                    VALUES (${contact.id}, NULL, 'pending', NOW())
                `;

                // In a full implementation, this would:
                // 1. Launch Puppeteer browser
                // 2. Navigate to WhatsApp Web
                // 3. Open chat for each contact
                // 4. Send message (and media if provided)
                // 5. Track delivery status

            } catch (error) {
                console.error(`[WhatsApp Service] Error sending to ${contact.whatsapp_number}:`, error.message);
            }
        }

        console.log(`[WhatsApp Service] Bulk send complete for ${contacts.length} contacts`);

    } catch (error) {
        console.error("[WhatsApp Service] Bulk send error:", error);
        throw error;
    }
};

/**
 * Send a single WhatsApp message via Web
 * @param {string} phoneNumber - Contact phone number
 * @param {string} message - Message to send
 * @returns {Object} - Result object
 */
export const sendSingleMessage = async (phoneNumber, message) => {
    try {
        // Generate wa.me URL as fallback
        const waMeUrl = `https://wa.me/${phoneNumber.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;

        console.log(`[WhatsApp Service] Single message URL generated: ${waMeUrl}`);

        return {
            success: true,
            url: waMeUrl,
            note: "Open the URL to send the message via WhatsApp"
        };

    } catch (error) {
        console.error("[WhatsApp Service] Single message error:", error);
        return {
            success: false,
            error: error.message
        };
    }
};
