-- Migration: Add created_by to broadcastmessages table
-- Run this on your NeonDB database

-- Add created_by column to broadcastmessages table (if not exists)
ALTER TABLE broadcastmessages ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

-- Create index for faster lookups by creator
CREATE INDEX IF NOT EXISTS idx_broadcastmessages_created_by ON broadcastmessages(created_by);
