import axios from 'axios';
import { INFOBIP_API_KEY, INFOBIP_BASE_URL, INFOBIP_SENDER_NUMBER } from '../Config/env.js';
import { whatsappClient,isWhatsAppReady } from './whatsapp-client.js';



/**
 * Sends a 6-digit WhatsApp verification code via Infobip
 * @param {string} whatsapp_number - The user's phone number (e.g., 0531114795 or +233...)
 * @returns {Promise<string>} - The generated verification code
 */
export const sendVerificationCode = async (whatsapp_number) => {
    const vCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Formatting for Ghana (233)
    let formattedNumber = whatsapp_number.replace(/\D/g, '');
    if (formattedNumber.startsWith('0')) {
        formattedNumber = '233' + formattedNumber.substring(1);
    } else if (!formattedNumber.startsWith('233')) {
        formattedNumber = '233' + formattedNumber;
    }

    if (process.env.USE_WHATSAPP !== 'true') {
        console.log(`[OFFLINE] WhatsApp disabled. Code for ${formattedNumber}: ${vCode}`);
        return vCode;
    }

    try {
        const response = await axios.post(
            `https://${INFOBIP_BASE_URL}/whatsapp/1/message/template`,
            {
                messages: [{
                    from: INFOBIP_SENDER_NUMBER,
                    to: formattedNumber,
                    content: {
                        templateName: "authentication", // Matches your Active template
                        templateData: {
                            body: {
                                placeholders: [vCode] // Injects code into {{1}}
                            }
                        },
                        language: "en"
                    }
                }]
            },
            {
                headers: {
                    'Authorization': `App ${INFOBIP_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`WhatsApp Sent! Message ID: ${response.data.messages[0].messageId}`);
        return vCode;

    } catch (error) {
        if (error.response) {
            const errorData = error.response.data;
            const errorCode = errorData.requestError?.serviceException?.messageId;

            // Common WhatsApp Business API Errors
            if (errorCode === 'REJECTED_DESTINATION_ADDRESS') {
                console.error('❌ Error: The phone number is not opted-in or is invalid.');
            } else if (errorCode === 'NO_CAPABLE_SENDER') {
                console.error('❌ Error: Sender number is not linked to this template.');
            } else if (error.response.status === 400) {
                console.error('❌ Error: Template mismatch. Check your placeholders or template name.');
            }

            console.error('Full API Error Response:', JSON.stringify(errorData, null, 2));
        } else {
            console.error('❌ Network/Connection Error:', error.message);
        }

        // Fallback: We still return vCode so the user isn't stuck
        return vCode;
    }
};



// export const sendWhatsAppVerificationCode = async (number, code) => {
//     try {
//         // Format the number to WhatsApp ID format
//         const chatId = `${number.replace(/\D/g, '')}@c.us`;

//         const message = `*Your Messenger Verification Code*\n\nYour code is: *${code}*\n\nThis code will expire in 10 minutes. Please do not share this with anyone.`;

//         await whatsappClient.sendMessage(chatId, message);
//         console.log(`📲 Verification code sent to WhatsApp: ${number}`);
//         return { success: true };
//     } catch (error) {
//         console.error("❌ WhatsApp Code Error:", error.message);
//         return { success: false, error: error.message };
//     }
// };


// export const sendVerificationSMS = async (req, res) => {
//     try {
//         const userId = req.user.id; // From your auth middleware

//         // 1. Get the user and their generated code
//         const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
//         if (!user[0]) return res.status(404).json({ message: "User not found" });

//         const { whatsapp_number, verification_code } = user[0];

//         // 2. Check if WhatsApp is actually ready
//         if (!isWhatsAppReady) {
//             return res.status(503).json({ message: "WhatsApp engine is offline" });
//         }

//         // 3. Send the 6-digit code
//         const chatId = `${whatsapp_number}@c.us`;
//         await whatsappClient.sendMessage(chatId, `Your verification code is: ${verification_code}`);

//         return res.status(200).json({ success: true, message: "Verification code sent to WhatsApp!" });
//     } catch (error) {
//         return res.status(500).json({ message: "Failed to send code", error: error.message });
//     }
// };