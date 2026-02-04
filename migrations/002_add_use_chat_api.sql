-- Migration: Add use_chat_api column to scheduledmessages
-- Run this on your NeonDB database

ALTER TABLE scheduledmessages ADD COLUMN IF NOT EXISTS use_chat_api BOOLEAN DEFAULT false;
