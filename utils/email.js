import { Resend } from 'resend';
import { RESEND_API_KEY } from '../Config/env.js';

// This pulls the key from your Render Environment variables
const resend = new Resend(RESEND_API_KEY);

export const sendVerificationEmail = async (userEmail, vCode) => {
    try {
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev', // Use this for testing; verify your own domain for production
            to: userEmail,
            subject: 'Verify your Account',
            html: `<p>Your verification code is: <strong>${vCode}</strong></p>`
        });

        if (error) {
            return console.error("❌ Email Error:", error);
        }

        console.log("✅ Email sent successfully:", data.id);
    } catch (err) {
        console.error("❌ Unexpected Error:", err);
    }
};