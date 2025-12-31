# 🔒 SecureChat - End-to-End Encrypted Messaging

A fully functional end-to-end encrypted (E2EE) chat application built with vanilla JavaScript and Python. **Zero external crypto libraries** - uses only the native Web Crypto API.

> ⚠️ **Educational Project**: This is a demonstration of E2EE concepts. While the cryptography is solid, a production system would need additional hardening.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.8+-green.svg)
![JavaScript](https://img.shields.io/badge/javascript-ES6+-yellow.svg)
![Release](https://img.shields.io/github/v/release/LoadingMagic/e2ee-Chat)
[![Website](https://img.shields.io/badge/Website-e2eechat.online-blue)](https://e2eechat.online)

## ✨ Features

- **True End-to-End Encryption** - Messages encrypted in browser, server sees only ciphertext
- **No Account Required** - No email, phone, or password. Just a cryptographic identity
- **Recovery Key System** - 64-character hex key for account backup/restore
- **Group Chats** - Encrypted group messaging with AES key sharing
- **Real-time Messaging** - WebSocket-based instant delivery
- **Cross-Platform** - Web app + Android APK (via Capacitor)
- **Self-Hostable** - Run your own server with full control

## 🔐 How The Encryption Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        KEY GENERATION                           │
├─────────────────────────────────────────────────────────────────┤
│  Recovery Key (64 hex) ──► PBKDF2 ──► RSA-2048 Key Pair        │
│                                        ├── Public Key (shared) │
│                                        └── Private Key (local) │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     MESSAGE ENCRYPTION                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Generate random AES-256 key for this message                │
│  2. Encrypt message with AES-256-GCM                            │
│  3. Encrypt AES key with recipient's RSA public key             │
│  4. Send: [Encrypted AES Key + IV + Encrypted Message]          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     MESSAGE DECRYPTION                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Decrypt AES key using own RSA private key                   │
│  2. Decrypt message using AES key + IV                          │
│  3. Display plaintext to user                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Cryptographic Primitives

| Purpose | Algorithm | Details |
|---------|-----------|---------|
| Key Exchange | RSA-OAEP | 2048-bit modulus, SHA-256 |
| Message Encryption | AES-GCM | 256-bit key, 96-bit IV |
| Key Derivation | PBKDF2 | SHA-256, 100,000 iterations |
| User ID | SHA-256 | First 128 bits of hash |

### What The Server Sees

```javascript
// Server storage - completely opaque
{
  "sender_id": "a1b2c3d4e5f6...",
  "recipient_id": "9z8y7x6w5v4...",
  "encrypted_content": "Base64(RSA(AES_Key) + IV + AES(message))",
  "created_at": "2024-01-15T10:30:00Z"
}
// Server CANNOT read message content - no private keys
```

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  app.js          │  crypto.js       │  websocket.js      │  │
│  │  - UI Logic      │  - Web Crypto    │  - Real-time       │  │
│  │  - State Mgmt    │  - RSA/AES       │  - Reconnection    │  │
│  │  - API Calls     │  - Key Storage   │  - Event Handling  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬──────────────────────────────────┘
                              │ HTTPS / WSS
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                         BACKEND                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  FastAPI                                                  │  │
│  │  - REST API (messages, users, groups)                    │  │
│  │  - WebSocket server (real-time delivery)                 │  │
│  │  - NO encryption/decryption (just stores blobs)          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  MySQL Database                                           │  │
│  │  - Users (public keys only)                              │  │
│  │  - Messages (encrypted blobs)                            │  │
│  │  - Groups (encrypted group keys per member)              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- MySQL 8.0+
- Node.js 16+ (for APK build only)

### 1. Clone & Setup

```bash
git clone https://github.com/yourusername/securechat.git
cd securechat

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn mysql-connector-python websockets python-dotenv
```

### 2. Configure Database

```sql
CREATE DATABASE securechat;
CREATE USER 'securechat'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON securechat.* TO 'securechat'@'localhost';
```

### 3. Environment Variables

Create `.env` in the backend folder:

```env
DB_HOST=localhost
DB_USER=securechat
DB_PASSWORD=your_password
DB_NAME=securechat
```

### 4. Run

```bash
cd backend
python main.py
```

Visit `http://localhost:8000` - that's it!

## 📱 Building the Android APK

```bash
cd frontend

# Install Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# Initialize (first time only)
npx cap init SecureChat com.securechat.app

# Copy web files to www/
.\build.ps1  # or: node build.js

# Add Android platform
npx cap add android

# Sync and build
npx cap sync android
npx cap open android  # Opens Android Studio
```

Build APK in Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**

## 📁 Project Structure

```
securechat/
├── backend/
│   ├── main.py              # FastAPI server + WebSocket
│   ├── database.py          # MySQL connection pool
│   ├── schema.sql           # Database schema
│   └── .env                  # Configuration (not in repo)
│
├── frontend/
│   ├── index.html           # Single page app
│   ├── css/
│   │   └── style.css        # Dark theme UI
│   ├── js/
│   │   ├── app.js           # Main application logic
│   │   ├── crypto.js        # Web Crypto API wrapper
│   │   └── websocket.js     # Real-time connection
│   ├── www/                  # Capacitor build output
│   ├── android/              # Android project
│   ├── build.js             # Node.js build script
│   ├── build.ps1            # PowerShell build script
│   └── capacitor.config.json
│
└── README.md
```

## 🔒 Security Considerations

### What This Project Does Well

✅ **Proper E2EE** - Private keys never leave the device  
✅ **Standard Algorithms** - RSA-OAEP, AES-GCM, PBKDF2  
✅ **No Crypto Libraries** - Native Web Crypto API only  
✅ **Server-Side Ignorance** - Server cannot read messages  

### Production Improvements Needed

⚠️ **Forward Secrecy** - Implement Double Ratchet (like Signal)  
⚠️ **Key Verification** - Safety numbers shown but not enforced  
⚠️ **Code Signing** - Verify frontend hasn't been tampered with  
⚠️ **Rate Limiting** - Add brute-force protection  
⚠️ **Audit Logging** - Security event monitoring  

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Server compromise | Server has no keys, only encrypted blobs |
| Network interception | TLS + E2EE double protection |
| Database leak | Messages remain encrypted |
| APK decompilation | Security is in keys, not code |
| Device theft | Keys in localStorage (use device encryption) |

## 🤝 Contributing

Contributions welcome!

## 📚 Learning Resources

If you're learning about E2EE, check out:

- [Web Crypto API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Signal Protocol Specifications](https://signal.org/docs/)
- [Cryptographic Right Answers](https://latacora.micro.blog/2018/04/03/cryptographic-right-answers.html)

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

**Built for learning. Use responsibly. Stay secure.** 🔐
