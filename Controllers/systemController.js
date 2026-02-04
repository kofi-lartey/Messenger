/**
 * WhatsApp Status Check (Chat API - no device needed)
 */
export const getWhatsAppStatus = async (req, res) => {
    res.status(200).json({
        success: true,
        ready: true, // Always ready - wa.me links work without device linking
        type: "CHAT_API",
        info: "Using WhatsApp Chat API (wa.me links) - no device linking required"
    });
};