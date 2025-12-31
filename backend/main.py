"""
SecureChat Backend Server
========================

A FastAPI server for end-to-end encrypted messaging.

Key Points:
- Server NEVER sees plaintext messages
- Server stores only encrypted blobs
- Server cannot decrypt anything (no private keys)

Run with: python main.py
"""

import os
import json
import uuid
import asyncio
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import mysql.connector
from mysql.connector import pooling
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================

db_config = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'user': os.getenv('DB_USER', 'securechat'),
    'password': os.getenv('DB_PASSWORD', ''),
    'database': os.getenv('DB_NAME', 'securechat'),
}

# Connection pool for better performance
connection_pool = pooling.MySQLConnectionPool(
    pool_name="securechat_pool",
    pool_size=10,
    **db_config
)

def get_db():
    """Get a database connection from the pool."""
    return connection_pool.get_connection()

# =============================================================================
# WEBSOCKET CONNECTION MANAGER
# =============================================================================

class ConnectionManager:
    """
    Manages WebSocket connections for real-time messaging.
    Maps user_id -> WebSocket connection
    """
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        
        # Update online status in database
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE user_id = %s",
            (user_id,)
        )
        conn.commit()
        cursor.close()
        conn.close()
        
        # Notify contacts that user is online
        await self.broadcast_status(user_id, True)
    
    async def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        
        # Update offline status
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE user_id = %s",
            (user_id,)
        )
        conn.commit()
        cursor.close()
        conn.close()
        
        await self.broadcast_status(user_id, False)
    
    async def send_to_user(self, user_id: str, message: dict):
        """Send a message to a specific user if they're connected."""
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except:
                await self.disconnect(user_id)
    
    async def broadcast_status(self, user_id: str, is_online: bool):
        """Broadcast online/offline status to user's contacts."""
        event_type = "user_online" if is_online else "user_offline"
        message = {"type": event_type, "data": {"user_id": user_id}}
        
        # Get user's contacts and notify them
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT 
                CASE WHEN sender_id = %s THEN recipient_id ELSE sender_id END as contact_id
            FROM messages 
            WHERE sender_id = %s OR recipient_id = %s
        """, (user_id, user_id, user_id))
        
        contacts = [row[0] for row in cursor.fetchall()]
        cursor.close()
        conn.close()
        
        for contact_id in contacts:
            await self.send_to_user(contact_id, message)

manager = ConnectionManager()

# =============================================================================
# PYDANTIC MODELS (Request/Response Schemas)
# =============================================================================

class UserRegister(BaseModel):
    user_id: str
    public_key: str
    display_name: Optional[str] = None
    encrypted_private_key: Optional[str] = None

class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar: Optional[str] = None

class MessageCreate(BaseModel):
    recipient_id: str
    encrypted_content: str      # Encrypted for recipient
    encrypted_for_sender: str   # Encrypted for sender (so they can read their own messages)
    reply_to_id: Optional[int] = None
    delete_mode: str = "never"

class GroupCreate(BaseModel):
    name: str
    member_ids: List[str]
    encrypted_keys: Dict[str, str]  # user_id -> encrypted_group_key

class GroupMessageCreate(BaseModel):
    encrypted_content: str

# =============================================================================
# FASTAPI APPLICATION
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    print("🚀 SecureChat server starting...")
    yield
    print("👋 SecureChat server shutting down...")

app = FastAPI(
    title="SecureChat API",
    description="End-to-end encrypted messaging API",
    version="1.0.0",
    lifespan=lifespan
)

# =============================================================================
# USER ENDPOINTS
# =============================================================================

@app.post("/api/register")
async def register_user(user: UserRegister):
    """
    Register a new user.
    
    The server stores:
    - user_id: Derived from recovery key (client-side)
    - public_key: For others to encrypt messages TO this user
    - encrypted_private_key: Encrypted with recovery key (optional backup)
    
    The server NEVER has access to the actual private key.
    """
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            """INSERT INTO users (user_id, public_key, encrypted_private_key, display_name)
               VALUES (%s, %s, %s, %s)""",
            (user.user_id, user.public_key, user.encrypted_private_key, user.display_name)
        )
        conn.commit()
        return {"status": "ok", "user_id": user.user_id}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="User already exists")
    finally:
        cursor.close()
        conn.close()

@app.get("/api/user/{user_id}")
async def get_user(user_id: str):
    """Get user's public information (public key, display name, avatar)."""
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute(
        "SELECT user_id, public_key, display_name, avatar FROM users WHERE user_id = %s",
        (user_id,)
    )
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user

@app.get("/api/user/{user_id}/exists")
async def check_user_exists(user_id: str):
    """Check if a user exists (for restore flow)."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT 1 FROM users WHERE user_id = %s", (user_id,))
    exists = cursor.fetchone() is not None
    cursor.close()
    conn.close()
    
    return {"exists": exists}

@app.put("/api/user/{user_id}")
async def update_user(user_id: str, update: UserUpdate):
    """Update user's display name or avatar."""
    conn = get_db()
    cursor = conn.cursor()
    
    updates = []
    values = []
    
    if update.display_name is not None:
        updates.append("display_name = %s")
        values.append(update.display_name if update.display_name else None)
    
    if update.avatar is not None:
        updates.append("avatar = %s")
        values.append(update.avatar if update.avatar else None)
    
    if updates:
        values.append(user_id)
        cursor.execute(
            f"UPDATE users SET {', '.join(updates)} WHERE user_id = %s",
            values
        )
        conn.commit()
    
    cursor.close()
    conn.close()
    
    return {"status": "ok"}

# =============================================================================
# MESSAGE ENDPOINTS
# =============================================================================

@app.post("/api/messages")
async def send_message(message: MessageCreate, sender_id: str = Query(...)):
    """
    Send an encrypted message.
    
    IMPORTANT: The server receives and stores ONLY encrypted content.
    - encrypted_content: Encrypted with recipient's public key
    - encrypted_for_sender: Encrypted with sender's public key
    
    The server CANNOT read either of these.
    """
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if blocked
    cursor.execute(
        "SELECT 1 FROM blocked_users WHERE user_id = %s AND blocked_user_id = %s",
        (message.recipient_id, sender_id)
    )
    if cursor.fetchone():
        cursor.close()
        conn.close()
        raise HTTPException(status_code=403, detail="You are blocked by this user")
    
    # Insert message
    cursor.execute(
        """INSERT INTO messages 
           (sender_id, recipient_id, encrypted_content, encrypted_for_sender, reply_to_id, delete_mode)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (sender_id, message.recipient_id, message.encrypted_content, 
         message.encrypted_for_sender, message.reply_to_id, message.delete_mode)
    )
    message_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()
    
    # Notify recipient via WebSocket (if connected)
    await manager.send_to_user(message.recipient_id, {
        "type": "new_message",
        "data": {
            "message_id": message_id,
            "sender_id": sender_id,
            "encrypted_content": message.encrypted_content
        }
    })
    
    return {"status": "ok", "message_id": message_id}

@app.get("/api/messages/{contact_id}")
async def get_messages(contact_id: str, user_id: str = Query(...)):
    """
    Get all messages between current user and contact.
    
    Returns encrypted messages - client must decrypt them.
    """
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("""
        SELECT m.*, 
               r.encrypted_content as reply_encrypted_content,
               r.encrypted_for_sender as reply_encrypted_for_sender,
               r.sender_id as reply_sender_id
        FROM messages m
        LEFT JOIN messages r ON m.reply_to_id = r.id
        WHERE (m.sender_id = %s AND m.recipient_id = %s)
           OR (m.sender_id = %s AND m.recipient_id = %s)
        ORDER BY m.created_at ASC
    """, (user_id, contact_id, contact_id, user_id))
    
    messages = cursor.fetchall()
    
    # Convert datetime to string
    for msg in messages:
        if msg['created_at']:
            msg['created_at'] = msg['created_at'].isoformat()
    
    cursor.close()
    conn.close()
    
    return {"messages": messages}

@app.get("/api/conversations")
async def get_conversations(user_id: str = Query(...)):
    """Get list of conversations for a user."""
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("""
        SELECT 
            u.user_id,
            u.display_name,
            u.avatar,
            u.is_online,
            n.nickname,
            (SELECT COUNT(*) FROM messages 
             WHERE sender_id = u.user_id AND recipient_id = %s AND is_read = FALSE) as unread_count,
            (SELECT MAX(created_at) FROM messages 
             WHERE (sender_id = %s AND recipient_id = u.user_id) 
                OR (sender_id = u.user_id AND recipient_id = %s)) as last_message_at
        FROM users u
        LEFT JOIN nicknames n ON n.user_id = %s AND n.contact_id = u.user_id
        WHERE u.user_id IN (
            SELECT DISTINCT 
                CASE WHEN sender_id = %s THEN recipient_id ELSE sender_id END
            FROM messages 
            WHERE sender_id = %s OR recipient_id = %s
        )
        ORDER BY last_message_at DESC
    """, (user_id, user_id, user_id, user_id, user_id, user_id, user_id))
    
    conversations = cursor.fetchall()
    
    for conv in conversations:
        if conv['last_message_at']:
            conv['last_message_at'] = conv['last_message_at'].isoformat()
    
    cursor.close()
    conn.close()
    
    return {"conversations": conversations}

@app.delete("/api/messages/{contact_id}")
async def delete_messages(contact_id: str, user_id: str = Query(...)):
    """Delete all messages in a conversation (for this user only)."""
    conn = get_db()
    cursor = conn.cursor()
    
    # This deletes messages - in a real app you might want to just hide them
    cursor.execute("""
        DELETE FROM messages 
        WHERE (sender_id = %s AND recipient_id = %s)
           OR (sender_id = %s AND recipient_id = %s)
    """, (user_id, contact_id, contact_id, user_id))
    
    conn.commit()
    cursor.close()
    conn.close()
    
    return {"status": "ok"}

# =============================================================================
# GROUP ENDPOINTS
# =============================================================================

@app.post("/api/groups")
async def create_group(group: GroupCreate, user_id: str = Query(...)):
    """
    Create a new group chat.
    
    Each member receives the group's AES key encrypted with their public key.
    The server stores these encrypted keys but cannot decrypt them.
    """
    conn = get_db()
    cursor = conn.cursor()
    
    group_id = str(uuid.uuid4())
    
    # Create group
    cursor.execute(
        "INSERT INTO chat_groups (group_id, name, created_by) VALUES (%s, %s, %s)",
        (group_id, group.name, user_id)
    )
    
    # Add creator as member
    if user_id in group.encrypted_keys:
        cursor.execute(
            "INSERT INTO group_members (group_id, user_id, encrypted_group_key) VALUES (%s, %s, %s)",
            (group_id, user_id, group.encrypted_keys[user_id])
        )
    
    # Add other members
    for member_id in group.member_ids:
        if member_id in group.encrypted_keys and member_id != user_id:
            cursor.execute(
                "INSERT INTO group_members (group_id, user_id, encrypted_group_key) VALUES (%s, %s, %s)",
                (group_id, member_id, group.encrypted_keys[member_id])
            )
            # Notify member
            await manager.send_to_user(member_id, {
                "type": "group_added",
                "data": {"group_id": group_id, "name": group.name}
            })
    
    conn.commit()
    cursor.close()
    conn.close()
    
    return {"status": "ok", "group_id": group_id}

@app.get("/api/groups")
async def get_groups(user_id: str = Query(...)):
    """Get all groups the user is a member of."""
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("""
        SELECT g.group_id, g.name, g.avatar,
               (SELECT COUNT(*) FROM group_members WHERE group_id = g.group_id) as member_count
        FROM chat_groups g
        JOIN group_members gm ON g.group_id = gm.group_id
        WHERE gm.user_id = %s
    """, (user_id,))
    
    groups = cursor.fetchall()
    cursor.close()
    conn.close()
    
    return {"groups": groups}

@app.get("/api/groups/{group_id}")
async def get_group(group_id: str, user_id: str = Query(...)):
    """Get group details including the user's encrypted group key."""
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("""
        SELECT g.*, gm.encrypted_group_key,
               (SELECT COUNT(*) FROM group_members WHERE group_id = g.group_id) as member_count
        FROM chat_groups g
        JOIN group_members gm ON g.group_id = gm.group_id AND gm.user_id = %s
        WHERE g.group_id = %s
    """, (user_id, group_id))
    
    group = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    return group

@app.post("/api/groups/{group_id}/messages")
async def send_group_message(group_id: str, message: GroupMessageCreate, user_id: str = Query(...)):
    """
    Send an encrypted message to a group.
    
    The message is encrypted with the group's AES key (client-side).
    All members can decrypt it using their copy of the group key.
    """
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        "INSERT INTO group_messages (group_id, sender_id, encrypted_content) VALUES (%s, %s, %s)",
        (group_id, user_id, message.encrypted_content)
    )
    message_id = cursor.lastrowid
    conn.commit()
    
    # Notify all group members
    cursor.execute(
        "SELECT user_id FROM group_members WHERE group_id = %s AND user_id != %s",
        (group_id, user_id)
    )
    members = [row[0] for row in cursor.fetchall()]
    cursor.close()
    conn.close()
    
    for member_id in members:
        await manager.send_to_user(member_id, {
            "type": "group_message",
            "data": {"group_id": group_id, "message_id": message_id}
        })
    
    return {"status": "ok", "message_id": message_id}

@app.get("/api/groups/{group_id}/messages")
async def get_group_messages(group_id: str, user_id: str = Query(...)):
    """Get all messages in a group."""
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("""
        SELECT gm.*, u.display_name as sender_name
        FROM group_messages gm
        JOIN users u ON gm.sender_id = u.user_id
        WHERE gm.group_id = %s
        ORDER BY gm.created_at ASC
    """, (group_id,))
    
    messages = cursor.fetchall()
    
    for msg in messages:
        if msg['created_at']:
            msg['created_at'] = msg['created_at'].isoformat()
    
    cursor.close()
    conn.close()
    
    return {"messages": messages}

# =============================================================================
# WEBSOCKET ENDPOINT
# =============================================================================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """
    WebSocket connection for real-time messaging.
    
    Handles:
    - Connection/disconnection with online status
    - Real-time message delivery
    - Typing indicators
    - Read receipts
    """
    await manager.connect(websocket, user_id)
    
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            msg_data = data.get("data", {})
            
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            
            elif msg_type == "typing":
                recipient_id = msg_data.get("recipient_id")
                if recipient_id:
                    await manager.send_to_user(recipient_id, {
                        "type": "typing",
                        "data": {"sender_id": user_id}
                    })
            
            elif msg_type == "read":
                sender_id = msg_data.get("sender_id")
                if sender_id:
                    # Mark messages as read in database
                    conn = get_db()
                    cursor = conn.cursor()
                    cursor.execute("""
                        UPDATE messages SET is_read = TRUE 
                        WHERE sender_id = %s AND recipient_id = %s AND is_read = FALSE
                    """, (sender_id, user_id))
                    conn.commit()
                    cursor.close()
                    conn.close()
                    
                    # Notify sender
                    await manager.send_to_user(sender_id, {
                        "type": "messages_read",
                        "data": {"reader_id": user_id}
                    })
    
    except WebSocketDisconnect:
        await manager.disconnect(user_id)

# =============================================================================
# STATIC FILES (Frontend)
# =============================================================================

# Serve frontend files
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/js", StaticFiles(directory=os.path.join(frontend_path, "js")), name="js")
    app.mount("/css", StaticFiles(directory=os.path.join(frontend_path, "css")), name="css")
    
    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(frontend_path, "index.html"))
    
    @app.get("/favicon.svg")
    async def serve_favicon():
        return FileResponse(os.path.join(frontend_path, "favicon.svg"))

# =============================================================================
# RUN SERVER
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    
    print(f"""
    ╔═══════════════════════════════════════════╗
    ║         🔒 SecureChat Server 🔒           ║
    ╠═══════════════════════════════════════════╣
    ║  Running on: http://{host}:{port}          
    ║  API Docs:   http://{host}:{port}/docs     
    ╚═══════════════════════════════════════════╝
    """)
    
    uvicorn.run(app, host=host, port=port)
