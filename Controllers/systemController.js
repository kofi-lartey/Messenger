import { isWhatsAppReady, whatsappClient } from "../utils/whatsapp-client.js";



export const getWhatsAppStatus = async (req, res) => {
    try {
        const state = isWhatsAppReady;

        // Detailed check: getting the client's current state (CONNECTED, PAIRING, etc.)
        const internalState = await whatsappClient.getState().catch(() => 'OFFLINE');

        res.status(200).json({
            success: true,
            ready: state,
            state: internalState,
            info: state ? whatsappClient.info.pushname : null
        });
    } catch (error) {
        res.status(500).json({ ready: false, message: "Engine initializing..." });
    }
};