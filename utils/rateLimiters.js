import rateLimit from 'express-rate-limit';

export const resendLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 1, // Limit each IP to 1 resend request per minute
    message: { message: "Please wait 60 seconds before requesting a new code." },
    standardHeaders: true,
    legacyHeaders: false,
});
