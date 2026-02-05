/**
 * WhatsApp Chat API Service
 * Uses wa.me URLs to send messages - NO device linking required!
 * 
 * How it works:
 * 1. User clicks a wa.me link
 * 2. Opens WhatsApp with pre-filled message
 * 3. User clicks send
 * 
 * For automation, users can use WhatsApp Business API or third-party services.
 */

import { sql } from "../Config/db.js";

/**
 * Generate WhatsApp Chat API URL
 * @param {string} phoneNumber - Phone number with country code (e.g., 233557655008)
 * @param {string} message - Message to send
 * @returns {string} - wa.me URL
 */
export const generateWhatsAppUrl = (phoneNumber, message) => {
    // Clean phone number - remove all non-digits
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    // URL encode the message
    const encodedMessage = encodeURIComponent(message);

    // Generate wa.me URL
    return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
};

/**
 * Generate personalized message with contact name
 * @param {string} template - Message template with {name} placeholder
 * @param {string} contactName - Contact's full name
 * @returns {string} - Personalized message
 */
export const personalizeMessage = (template, contactName) => {
    if (!template) return '';
    if (!contactName) return template;

    // Replace {name} placeholder with actual name
    return template.replace(/\{name\}/gi, contactName);
};

/**
 * Process broadcast - returns wa.me URLs for each contact
 * @param {Array} recipients - Array of contact objects { full_name, whatsapp_number }
 * @param {string} messageBody - Message template with {name} placeholder
 * @returns {Array} - Array of { name, phone, wa.meUrl }
 */
export const processBroadcastChatApi = (recipients, messageBody) => {
    const results = [];

    for (const contact of recipients) {
        const personalizedMessage = personalizeMessage(messageBody, contact.full_name);
        const waMeUrl = generateWhatsAppUrl(contact.whatsapp_number, personalizedMessage);

        results.push({
            name: contact.full_name,
            phone: contact.whatsapp_number,
            message: personalizedMessage,
            waMeUrl: waMeUrl
        });
    }

    return results;
};

/**
 * Send broadcast via Chat API (for display/download)
 * Returns list of wa.me URLs that users can click or share
 * @param {number} broadcastId - The broadcast message ID
 * @param {Array} contacts - Optional: Array of contact objects to use instead of fetching all
 */
export const sendBroadcastViaChatApi = async (broadcastId, contacts = null) => {
    try {
        // Get message template
        const messageResult = await sql`
            SELECT id, message_body, media_url FROM broadcastmessages WHERE id = ${broadcastId}
        `;

        if (messageResult.length === 0) {
            return { success: false, message: "Message template not found." };
        }

        const { message_body, media_url } = messageResult[0];

        // Use provided contacts or fetch all
        let contactsToUse = contacts;
        if (!contactsToUse) {
            contactsToUse = await sql`
                SELECT full_name, whatsapp_number FROM contacts
            `;
        }

        if (contactsToUse.length === 0) {
            return { success: false, message: "No contacts found." };
        }

        // Generate wa.me URLs for all contacts
        const broadcastResults = processBroadcastChatApi(contactsToUse, message_body);

        return {
            success: true,
            message: `Generated ${broadcastResults.length} WhatsApp links`,
            data: {
                totalRecipients: broadcastResults.length,
                links: broadcastResults,
                note: "Click each link to send the message via WhatsApp"
            }
        };

    } catch (error) {
        console.error("Broadcast error:", error);
        return { success: false, message: error.message };
    }
};

/**
 * Generate CSV file content with all wa.me links
 */
export const generateBroadcastCsv = (recipients, messageBody) => {
    const results = processBroadcastChatApi(recipients, messageBody);

    let csv = 'Name,Phone,Message,WhatsApp Link\n';

    for (const item of results) {
        csv += `"${item.name}","${item.phone}","${item.message}","${item.waMeUrl}"\n`;
    }

    return csv;
};
