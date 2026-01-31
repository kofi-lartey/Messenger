
import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT || 6591;

// Neon configuration
export const{PGUSER,PGPASSWORD,PGDATABASE,PGHOST}=process.env;

// JWT Secret
export const SECRET = process.env.SECRET;