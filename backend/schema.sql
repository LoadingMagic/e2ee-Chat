-- SecureChat Database Schema
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS securechat;
USE securechat;

-- Users table
CREATE TABLE users (
    user_id VARCHAR(32) PRIMARY KEY,
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT,
    display_name VARCHAR(32),
    avatar MEDIUMTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_online BOOLEAN DEFAULT FALSE
);

-- Messages table
CREATE TABLE messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sender_id VARCHAR(32) NOT NULL,
    recipient_id VARCHAR(32) NOT NULL,
    encrypted_content TEXT NOT NULL,
    encrypted_for_sender TEXT NOT NULL,
    reply_to_id BIGINT,
    delete_mode ENUM('never', '24hr', 'on_read') DEFAULT 'never',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL,
    
    INDEX idx_conversation (sender_id, recipient_id),
    INDEX idx_recipient (recipient_id),
    INDEX idx_created (created_at)
);

-- Blocked users table
CREATE TABLE blocked_users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(32) NOT NULL,
    blocked_user_id VARCHAR(32) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_block (user_id, blocked_user_id)
);

-- Nicknames table (user-assigned nicknames for contacts)
CREATE TABLE nicknames (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(32) NOT NULL,
    contact_id VARCHAR(32) NOT NULL,
    nickname VARCHAR(32) NOT NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES users(user_id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_nickname (user_id, contact_id)
);

-- Conversation settings table
CREATE TABLE conversation_settings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(32) NOT NULL,
    contact_id VARCHAR(32) NOT NULL,
    delete_mode ENUM('never', '24hr', 'on_read') DEFAULT 'never',
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES users(user_id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_settings (user_id, contact_id)
);

-- Groups table
CREATE TABLE chat_groups (
    group_id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    avatar MEDIUMTEXT,
    created_by VARCHAR(32) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Group members table
CREATE TABLE group_members (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    encrypted_group_key TEXT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (group_id) REFERENCES chat_groups(group_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_member (group_id, user_id)
);

-- Group messages table
CREATE TABLE group_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(32) NOT NULL,
    encrypted_content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (group_id) REFERENCES chat_groups(group_id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE,
    
    INDEX idx_group (group_id),
    INDEX idx_created (created_at)
);

-- Message reactions table
CREATE TABLE message_reactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id BIGINT NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_reaction (message_id, user_id)
);
