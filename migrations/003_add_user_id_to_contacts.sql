-- Migration: Add user_id to contacts table
-- Run this on your NeonDB database

-- Add user_id column to contacts table (if not exists)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

-- Create index for faster lookups by creator
CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by);
