
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This forces it to look in the root folder, no matter where you run the script from
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const PORT = process.env.PORT || 6591;

// Neon configuration
export const { PGUSER, PGPASSWORD, PGDATABASE, PGHOST } = process.env;

// JWT Secret
export const SECRET = process.env.SECRET;

// Infobip Configuration
export const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL;
export const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY;
export const INFOBIP_SENDER_NUMBER = process.env.INFOBIP_SENDER_NUMBER;

// Whether to actually send WhatsApp messages
export const USE_WHATSAPP = process.env.USE_WHATSAPP === 'true';

// Resend Configuration
export const RESEND_API_KEY = process.env.RESEND_API_KEY;

export const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY 

export const MY_SECRET_KEY = process.env.MY_SECRET_KEY || 'Pleaseyou5';

// cloudinary keys
export const CLOUD_NAME = process.env.CLOUD_NAME
export const CLOUD_API_KEY = process.env.CLOUD_API_KEY
export const CLOUD_API_SECRET = process.env.CLOUD_API_SECRET
export const CLIENT_URL = process.env.CLIENT_URL