import whatsappClient from "../utils/whatsapp-client.js";
import { MessageMedia } from 'whatsapp-web.js';

export const processBulkMessages = async (recipients, text, mediaUrl = null) => {
    let media = null;

    // 1. Prepare media once outside the loop to save bandwidth and memory
    if (mediaUrl) {
        try {
            media = await MessageMedia.fromUrl(mediaUrl);
            console.log("📂 Media loaded successfully from URL.");
        } catch (error) {
            console.error("❌ Failed to load media from URL. Sending text-only instead.");
        }
    }

    // 2. Start the loop
    for (const user of recipients) {
        try {
            // Format number: remove non-digits and add WhatsApp suffix
            const chatId = `${user.whatsapp_number.replace(/\D/g, '')}@c.us`;
            const personalizedText = text.replace('{name}', user.full_name || 'there');

            // 3. Send with or without media
            if (media) {
                await whatsappClient.sendMessage(chatId, media, { caption: personalizedText });
            } else {
                await whatsappClient.sendMessage(chatId, personalizedText);
            }

            console.log(`✅ Sent to ${user.full_name} (${user.whatsapp_number})`);

            // 4. Safety Delay (Randomized 5-10 seconds)
            const delay = Math.floor(Math.random() * 5000) + 5000;
            await new Promise(res => setTimeout(res, delay));

        } catch (error) {
            // Keep the catch inside the loop so one failure doesn't stop the whole broadcast
            console.error(`❌ Error sending to ${user.full_name}:`, error.message);
        }
    }

    console.log("🏁 Broadcast finished.");
};