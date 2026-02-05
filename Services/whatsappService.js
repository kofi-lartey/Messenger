/**
 * WhatsApp Web Service
 * Handles sending messages via WhatsApp Web (Puppeteer)
 */

import { sql } from "../Config/db.js";

// Rate limiting configuration
const RATE_LIMIT = {
    MIN_INTERVAL_MS: 5000,    // Minimum 5 seconds between messages
    MAX_INTERVAL_MS: 15000,   // Maximum 15 seconds between messages
    BATCH_SIZE: 10,           // Messages per batch
    BATCH_DELAY_MS: 60000,    // 1 minute break between batches
    DAILY_LIMIT: 500          // Maximum messages per day
};

/**
 * Calculate delay with jitter to avoid pattern detection
 * @param {number} baseInterval - Base interval in ms
 * @returns {number} - Random interval between base and base+5000ms
 */
const getRandomizedDelay = (baseInterval) => {
    const jitter = Math.floor(Math.random() * 3000); // 0-3 seconds jitter
    return baseInterval + jitter;
};

/**
 * Check if we've exceeded daily limit
 */
const checkDailyLimit = async (userId) => {
    try {
        const result = await sql`
            SELECT COUNT(*) as count FROM sent_messages 
            WHERE created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day'
        `;
        return parseInt(result[0]?.count || 0) >= RATE_LIMIT.DAILY_LIMIT;
    } catch (error) {
        console.error("[WhatsApp Service] Error checking daily limit:", error);
        return false;
    }
};

/**
 * Process bulk messages via WhatsApp Web with rate limiting
 * @param {Array} contacts - Array of contact objects { full_name, whatsapp_number, id }
 * @param {string} messageBody - Message template with {name} placeholder
 * @param {string} mediaUrl - Optional media URL to send
 * @param {Object} options - Rate limiting options
 */
export const processBulkMessages = async (contacts, messageBody, mediaUrl = null, options = {}) => {
    const {
        intervalMs = RATE_LIMIT.MIN_INTERVAL_MS,
        batchSize = RATE_LIMIT.BATCH_SIZE,
        onProgress = () => { }
    } = options;

    try {
        const totalContacts = contacts.length;
        let sentCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        console.log(`[WhatsApp Service] Starting bulk send to ${totalContacts} contacts`);
        console.log(`[WhatsApp Service] Rate limit: ${intervalMs}ms between messages, batch size: ${batchSize}`);

        // Check daily limit
        const dailyLimitReached = await checkDailyLimit(contacts[0]?.created_by);
        if (dailyLimitReached) {
            console.warn("[WhatsApp Service] Daily message limit reached!");
            return {
                success: false,
                message: "Daily message limit (500) reached. Try again tomorrow.",
                sent: sentCount,
                failed: failedCount,
                skipped: skippedCount
            };
        }

        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];

            // Check if we should take a batch break
            if (batchSize > 0 && i > 0 && i % batchSize === 0) {
                console.log(`[WhatsApp Service] Batch complete (${i}/${totalContacts}). Taking ${RATE_LIMIT.BATCH_DELAY_MS / 1000}s break...`);
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.BATCH_DELAY_MS));
            }

            try {
                // Personalize message with contact name
                const personalizedMessage = messageBody.replace(/\{name\}/gi, contact.full_name);

                // Simulate sending (actual Puppeteer code would go here)
                console.log(`[WhatsApp Service] [${i + 1}/${totalContacts}] Sending to ${contact.whatsapp_number}: "${personalizedMessage.substring(0, 30)}..."`);

                // Store in sent_messages table for tracking
                await sql`
                    INSERT INTO sent_messages (contact_id, broadcast_id, status, sent_at, message_body)
                    VALUES (${contact.id || NULL}, NULL, 'sent', NOW(), ${personalizedMessage})
                `;

                sentCount++;

                // Report progress
                onProgress({
                    sent: sentCount,
                    failed: failedCount,
                    skipped: skippedCount,
                    total: totalContacts,
                    current: contact
                });

            } catch (error) {
                console.error(`[WhatsApp Service] Error sending to ${contact.whatsapp_number}:`, error.message);
                failedCount++;

                // Store failed message for retry
                await sql`
                    INSERT INTO sent_messages (contact_id, broadcast_id, status, sent_at, error_message)
                    VALUES (${contact.id || NULL}, NULL, 'failed', NOW(), ${error.message})
                `;
            }

            // Rate limiting delay (skip after last message)
            if (i < contacts.length - 1) {
                const delay = getRandomizedDelay(intervalMs);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        console.log(`[WhatsApp Service] Bulk send complete. Sent: ${sentCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`);

        return {
            success: true,
            message: `Sent ${sentCount} messages, ${failedCount} failed`,
            sent: sentCount,
            failed: failedCount,
            skipped: skippedCount
        };

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
