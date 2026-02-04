-- Migration: Create scheduledmessages table
-- Run this on your NeonDB database

CREATE TABLE IF NOT EXISTS scheduledmessages (
    id SERIAL PRIMARY KEY,
    campaign_name VARCHAR(255) DEFAULT 'General',
    message_title VARCHAR(255) DEFAULT 'No Title',
    message_body TEXT NOT NULL,
    media_url TEXT,
    action_link TEXT,
    scheduled_time TIMESTAMP NOT NULL,
    use_chat_api BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'pending', -- pending, sent, cancelled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_scheduledmessages_status ON scheduledmessages(status);
CREATE INDEX IF NOT EXISTS idx_scheduledmessages_scheduled_time ON scheduledmessages(scheduled_time);
