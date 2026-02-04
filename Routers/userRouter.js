import { Router } from "express";
import { getPairingCode, loginUser, registerUser, resendCode, syatemReset, verifyUser } from "../Controllers/userController.js";
import {
    createContact,
    uploadBulkContacts,
    createBroadcast,
    triggerBroadcast,
    getContactWhatsAppLink,
    downloadBroadcastLinks,
    getBroadcastStatus,
    getAllBroadcasts,
    cancelScheduledBroadcast
} from "../Controllers/messageControllers.js";
import { authenticate } from "../Middleware/auth.js";
import { resendLimiter } from '../utils/rateLimiters.js';


export const userRouter = Router();

// User Auth Routes
userRouter.post('/user/register', registerUser);
userRouter.post('/user/login', loginUser);
userRouter.post('/verify', authenticate, verifyUser);
userRouter.post('/resend-code', authenticate, resendLimiter, resendCode);  // Add ?method=email or ?method=whatsapp
userRouter.get('/get-pairing-code', authenticate, resendLimiter, getPairingCode);
userRouter.get('/system-reset', syatemReset);

// Contact Routes
userRouter.post('/contact/create', authenticate, createContact);
userRouter.post('/contacts/upload', authenticate, uploadBulkContacts);

// Broadcast Routes - Create
userRouter.post('/broadcast/create', authenticate, createBroadcast);

// Broadcast Routes - Send Immediately
userRouter.post('/broadcast/send', authenticate, triggerBroadcast);

// Broadcast Routes - Schedule
userRouter.post('/broadcast/schedule', authenticate, createBroadcast);

// Broadcast Routes - Management
userRouter.get('/broadcasts', authenticate, getAllBroadcasts);
userRouter.get('/broadcast/:id', authenticate, getBroadcastStatus);
userRouter.delete('/broadcast/:id/cancel', authenticate, cancelScheduledBroadcast);

// Chat API Routes (NO DEVICE LINKING REQUIRED)
userRouter.get('/contact/:id/whatsapp-link', authenticate, getContactWhatsAppLink);
userRouter.get('/broadcast/:id/download-links', authenticate, downloadBroadcastLinks);
