-- Migration: Update scheduledmessages table with new columns
-- Run this on your NeonDB database

-- Add broadcast_id column (references broadcastmessages table)
ALTER TABLE scheduledmessages ADD COLUMN IF NOT EXISTS broadcast_id INTEGER REFERENCES broadcastmessages(id);

-- Add created_by column (references users table)
ALTER TABLE scheduledmessages ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

-- Add filters column (JSONB for storing organization and contact_group filters)
ALTER TABLE scheduledmessages ADD COLUMN IF NOT EXISTS filters JSONB DEFAULT '{}';

-- Add rate_limit_settings column (JSONB for storing rate limiting settings)
ALTER TABLE scheduledmessages ADD COLUMN IF NOT EXISTS rate_limit_settings JSONB DEFAULT '{"interval_ms": 5000, "batch_size": 10}';

-- Add contact_count column (number of recipients)
ALTER TABLE scheduledmessages ADD COLUMN IF NOT EXISTS contact_count INTEGER DEFAULT 0;

-- Create index for faster lookups by broadcast
CREATE INDEX IF NOT EXISTS idx_scheduledmessages_broadcast_id ON scheduledmessages(broadcast_id);

-- Create index for faster lookups by creator
CREATE INDEX IF NOT EXISTS idx_scheduledmessages_created_by ON scheduledmessages(created_by);
