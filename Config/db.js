import { neon } from '@neondatabase/serverless'
import { PGUSER, PGPASSWORD, PGDATABASE, PGHOST } from './env.js'

export const sql = neon(
    `postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}/${PGDATABASE}?
    sslmode=require&
    channel_binding=require`
);