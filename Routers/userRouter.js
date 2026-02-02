import { Router } from "express";
import { getPairingCode, registerUser, resendCode, verifyUser } from "../Controllers/userController.js";
import { authenticate } from "../Middleware/auth.js";
import { resendLimiter } from '../utils/rateLimiters.js';



export const userRouter = Router();

userRouter.post('/user/register', registerUser);
userRouter.post('/verify', authenticate, verifyUser);
userRouter.post('/resend-code', authenticate, resendLimiter, resendCode);
userRouter.post('/link-phone', authenticate, resendLimiter, resendCode); 
userRouter.get('/get-pairing-code', resendLimiter, getPairingCode);
