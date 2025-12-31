# API Documentation

SecureChat uses a simple REST API + WebSocket for real-time messaging.

## Base URL

```
http://localhost:8000
```

## Authentication

There is **no traditional authentication**. Users are identified by their cryptographic user ID (32-char hex string). The server cannot verify identity - it simply routes encrypted messages.

---

## Endpoints

### Users

#### Register User
```http
POST /api/register
```

**Request:**
```json
{
    "user_id": "a1b2c3d4e5f6...",
    "public_key": "base64-encoded-spki-public-key",
    "display_name": "Alice"
}
```

**Response:**
```json
{
    "status": "ok",
    "user_id": "a1b2c3d4e5f6..."
}
```

#### Get User
```http
GET /api/user/{user_id}
```

**Response:**
```json
{
    "user_id": "a1b2c3d4e5f6...",
    "public_key": "base64-encoded-public-key",
    "display_name": "Alice",
    "avatar": "data:image/png;base64,..."
}
```

#### Check User Exists
```http
GET /api/user/{user_id}/exists
```

**Response:**
```json
{
    "exists": true
}
```

---

### Messages

#### Send Message
```http
POST /api/messages?sender_id={sender_id}
```

**Request:**
```json
{
    "recipient_id": "b2c3d4e5f6...",
    "encrypted_content": "base64-encrypted-for-recipient",
    "encrypted_for_sender": "base64-encrypted-for-self"
}
```

**Note:** Messages are encrypted twice:
- `encrypted_content`: Encrypted with **recipient's** public key
- `encrypted_for_sender`: Encrypted with **sender's** public key (so sender can read their own messages)

**Response:**
```json
{
    "status": "ok",
    "message_id": 123
}
```

#### Get Messages
```http
GET /api/messages/{contact_id}?user_id={user_id}
```

**Response:**
```json
{
    "messages": [
        {
            "id": 123,
            "sender_id": "a1b2c3d4...",
            "recipient_id": "b2c3d4e5...",
            "encrypted_content": "base64...",
            "encrypted_for_sender": "base64...",
            "created_at": "2024-01-15T10:30:00Z"
        }
    ]
}
```

#### Delete Messages
```http
DELETE /api/messages/{contact_id}?user_id={user_id}
```

---

### Conversations

#### List Conversations
```http
GET /api/conversations?user_id={user_id}
```

**Response:**
```json
{
    "conversations": [
        {
            "user_id": "b2c3d4e5...",
            "display_name": "Bob",
            "is_online": true,
            "unread_count": 3,
            "last_message_at": "2024-01-15T10:30:00Z"
        }
    ]
}
```

---

### Groups

#### Create Group
```http
POST /api/groups?user_id={user_id}
```

**Request:**
```json
{
    "name": "Project Team",
    "member_ids": ["user1", "user2"],
    "encrypted_keys": {
        "creator_id": "base64-rsa-encrypted-aes-key",
        "user1": "base64-rsa-encrypted-aes-key",
        "user2": "base64-rsa-encrypted-aes-key"
    }
}
```

**Note:** The group AES key is encrypted separately for each member with their RSA public key.

#### Get Groups
```http
GET /api/groups?user_id={user_id}
```

#### Send Group Message
```http
POST /api/groups/{group_id}/messages?user_id={user_id}
```

**Request:**
```json
{
    "encrypted_content": "base64-aes-encrypted-message"
}
```

---

## WebSocket

### Connection
```
ws://localhost:8000/ws/{user_id}
```

### Message Format
All messages are JSON:
```json
{
    "type": "message_type",
    "data": { ... }
}
```

### Events (Server → Client)

| Type | Description | Data |
|------|-------------|------|
| `new_message` | New message received | `{sender_id, encrypted_content}` |
| `typing` | User is typing | `{sender_id}` |
| `user_online` | Contact came online | `{user_id}` |
| `user_offline` | Contact went offline | `{user_id}` |
| `messages_read` | Messages were read | `{reader_id}` |

### Events (Client → Server)

| Type | Description | Data |
|------|-------------|------|
| `ping` | Keep-alive | `{}` |
| `typing` | Notify typing | `{recipient_id}` |
| `read` | Mark messages read | `{sender_id}` |

---

## Server Data Model

The server stores:

| Data | Encrypted? | Notes |
|------|-----------|-------|
| User ID | No | Public identifier |
| Public Key | No | Needed for encryption |
| Display Name | No | Optional, user-set |
| Messages | **Yes** | Server cannot read |
| Group Keys | **Yes** | Per-member encrypted |

The server **cannot**:
- Read message content
- Decrypt any data
- Impersonate users
- Forge messages

---

## Error Responses

```json
{
    "detail": "Error message here"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (invalid data) |
| 403 | Forbidden (blocked user) |
| 404 | Not found (user/group) |
| 500 | Server error |
