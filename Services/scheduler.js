import cron from 'node-cron';
import { sql } from '../Config/db.js';
import { processBulkMessages } from './whatsappService.js';
import { sendBroadcastViaChatApi } from './whatsappChatApi.js';

// Run every minute to check for scheduled broadcasts
cron.schedule('* * * * *', async () => {
    console.log('🔍 Checking for scheduled broadcasts...');

    try {
        // Find broadcasts that are due (scheduled_time <= NOW() and status = 'pending')
        // Uses FK: scheduledmessages.broadcast_id -> broadcastmessages.id
        const dueBroadcasts = await sql`
            SELECT 
                sm.id as schedule_id,
                sm.broadcast_id,
                sm.use_chat_api,
                sm.scheduled_time,
                bm.message_body,
                bm.media_url
            FROM scheduledmessages sm
            JOIN broadcastmessages bm ON sm.broadcast_id = bm.id
            WHERE sm.scheduled_time <= NOW() 
            AND sm.status = 'pending'
        `;

        if (dueBroadcasts.length === 0) {
            console.log('📭 No broadcasts due for sending.');
            return;
        }

        console.log(`📨 Found ${dueBroadcasts.length} broadcast(s) to send.`);

        for (const broadcast of dueBroadcasts) {
            try {
                // Update status to 'sending' to prevent duplicate processing
                await sql`
                    UPDATE scheduledmessages 
                    SET status = 'sending' 
                    WHERE id = ${broadcast.schedule_id}
                `;

                // Get all contacts
                const contacts = await sql`
                    SELECT full_name, whatsapp_number FROM contacts
                `;

                if (contacts.length === 0) {
                    console.log('⚠️ No contacts found, skipping broadcast.');
                    await sql`
                        UPDATE scheduledmessages 
                        SET status = 'no_contacts' 
                        WHERE id = ${broadcast.schedule_id}
                    `;
                    continue;
                }

                // Send based on method
                if (broadcast.use_chat_api) {
                    // Chat API method - generate links
                    console.log(`📱 Using Chat API for broadcast ${broadcast.broadcast_id}`);
                    await sendBroadcastViaChatApi(broadcast.broadcast_id);
                } else {
                    // WhatsApp Web method - send actual messages
                    console.log(`📲 Sending via WhatsApp Web for broadcast ${broadcast.broadcast_id}`);
                    await processBulkMessages(contacts, broadcast.message_body, broadcast.media_url);
                }

                // Mark as sent
                await sql`
                    UPDATE scheduledmessages 
                    SET status = 'sent', sent_at = NOW() 
                    WHERE id = ${broadcast.schedule_id}
                `;

                console.log(`✅ Broadcast ${broadcast.broadcast_id} completed!`);

            } catch (error) {
                console.error(`❌ Error processing broadcast ${broadcast.broadcast_id}:`, error.message);
                await sql`
                    UPDATE scheduledmessages 
                    SET status = 'failed' 
                    WHERE id = ${broadcast.schedule_id}
                `;
            }
        }

    } catch (error) {
        console.error('Scheduler error:', error.message);
    }
});

console.log('⏰ Broadcast scheduler initialized.');
