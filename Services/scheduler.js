import cron from 'node-cron';
import sql from '../Config/db.js';
import { processBulkMessages } from './whatsappService.js';

// Run every minute
cron.schedule('* * * * *', async () => {
    console.log('Checking for scheduled messages...');

    // 1. Find messages due to be sent
    const dueMessages = await sql`
        SELECT sm.id, bm.message_body, bm.id as bm_id
        FROM ScheduledMessages sm
        JOIN BroadcastMessages bm ON sm.broadcast_id = bm.id
        WHERE sm.scheduled_time <= NOW() AND sm.status = 'pending'
    `;

    for (const msg of dueMessages) {
        // 2. Fetch all contacts (or filter by group if you add groupIDs to Broadcast table)
        const contacts = await sql`SELECT full_name, whatsapp_number FROM Contacts`;

        // 3. Update status to 'sending' so another worker doesn't grab it
        await sql`UPDATE ScheduledMessages SET status = 'sending' WHERE id = ${msg.id}`;

        // 4. Trigger the WhatsApp Logic we built earlier
        await processBulkMessages(contacts, msg.message_body);

        // 5. Mark as complete
        await sql`UPDATE ScheduledMessages SET status = 'sent' WHERE id = ${msg.id}`;
    }
});