# Encryption Deep Dive

This document explains exactly how SecureChat's encryption works, step by step.

## Table of Contents
1. [Overview](#overview)
2. [Key Generation](#key-generation)
3. [Message Encryption](#message-encryption)
4. [Message Decryption](#message-decryption)
5. [Group Encryption](#group-encryption)
6. [Security Properties](#security-properties)

---

## Overview

SecureChat uses **hybrid encryption** - a combination of asymmetric (RSA) and symmetric (AES) encryption:

- **RSA-OAEP (2048-bit)**: Used for key exchange
- **AES-256-GCM**: Used for actual message encryption
- **PBKDF2 (SHA-256)**: Used for key derivation

This is the same approach used by secure email (PGP), Signal, and TLS.

### Why Hybrid?

| Algorithm | Speed | Key Size | Use Case |
|-----------|-------|----------|----------|
| RSA-2048 | Slow | Large | Encrypt small data (keys) |
| AES-256 | Fast | Small | Encrypt large data (messages) |

RSA can only encrypt ~190 bytes with 2048-bit keys. Messages can be much longer. So we:
1. Generate a random AES key for each message
2. Encrypt the message with AES (fast, no size limit)
3. Encrypt the AES key with RSA (secure key exchange)

---

## Key Generation

### Recovery Key
```
┌────────────────────────────────────────┐
│ Recovery Key Generation                 │
├────────────────────────────────────────┤
│ 1. Generate 32 random bytes            │
│ 2. Convert to 64-character hex string  │
│                                        │
│ Example: a1b2c3d4...64 chars total     │
└────────────────────────────────────────┘
```

```javascript
// Generate 32 cryptographically secure random bytes
const bytes = new Uint8Array(32);
crypto.getRandomValues(bytes);

// Convert to hex string
const recoveryKey = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
// Result: "a1b2c3d4e5f6..." (64 chars)
```

### User ID Derivation
```
┌────────────────────────────────────────┐
│ User ID = SHA-256(recoveryKey + salt)  │
│ Take first 16 bytes → 32 hex chars     │
└────────────────────────────────────────┘
```

```javascript
const data = recoveryKey + ':userid';
const hash = await crypto.subtle.digest('SHA-256', encode(data));
const userId = hash.slice(0, 16).toHex();
// Result: "f8a3b2c1..." (32 chars)
```

### RSA Key Pair
```
┌────────────────────────────────────────┐
│ RSA-OAEP Key Pair                       │
├────────────────────────────────────────┤
│ Modulus: 2048 bits                     │
│ Public Exponent: 65537                 │
│ Hash: SHA-256                          │
│ Padding: OAEP                          │
└────────────────────────────────────────┘
```

```javascript
const keyPair = await crypto.subtle.generateKey(
    {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), // 65537
        hash: 'SHA-256'
    },
    true, // extractable
    ['encrypt', 'decrypt']
);
```

---

## Message Encryption

When Alice sends a message to Bob:

```
┌─────────────────────────────────────────────────────────────┐
│                    ENCRYPTION FLOW                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  "Hello Bob!" (plaintext)                                   │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────┐                                   │
│  │ Generate random     │                                   │
│  │ AES-256 key         │──────────────────┐                │
│  └─────────────────────┘                  │                │
│       │                                   │                │
│       ▼                                   ▼                │
│  ┌─────────────────────┐    ┌─────────────────────┐       │
│  │ Generate random     │    │ Encrypt AES key     │       │
│  │ 12-byte IV (nonce)  │    │ with Bob's RSA      │       │
│  └─────────────────────┘    │ public key          │       │
│       │                     └─────────────────────┘       │
│       ▼                              │                     │
│  ┌─────────────────────┐             │                     │
│  │ Encrypt message     │             │                     │
│  │ with AES-256-GCM    │             │                     │
│  └─────────────────────┘             │                     │
│       │                              │                     │
│       ▼                              ▼                     │
│  ┌─────────────────────────────────────────────────┐      │
│  │     FINAL PAYLOAD (sent to server)              │      │
│  │  [RSA(AES_KEY)] + [IV] + [AES(message)]        │      │
│  │   256 bytes      12 bytes    variable          │      │
│  └─────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Code Walkthrough

```javascript
async function encryptMessage(message, recipientPublicKey) {
    // STEP 1: Generate random AES key (used only for this message)
    const aesKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt']
    );

    // STEP 2: Generate random IV (nonce)
    // CRITICAL: Never reuse an IV with the same key!
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // STEP 3: Encrypt message with AES-GCM
    const encryptedMessage = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        aesKey,
        new TextEncoder().encode(message)
    );

    // STEP 4: Encrypt AES key with recipient's RSA public key
    const exportedAesKey = await crypto.subtle.exportKey('raw', aesKey);
    const encryptedAesKey = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        recipientPublicKey,
        exportedAesKey
    );

    // STEP 5: Combine into single payload
    // Layout: [encryptedAesKey (256 bytes)][iv (12 bytes)][encryptedMessage]
    const combined = new Uint8Array(
        encryptedAesKey.byteLength + iv.byteLength + encryptedMessage.byteLength
    );
    combined.set(new Uint8Array(encryptedAesKey), 0);
    combined.set(iv, encryptedAesKey.byteLength);
    combined.set(new Uint8Array(encryptedMessage), encryptedAesKey.byteLength + iv.byteLength);

    // STEP 6: Base64 encode for transmission
    return btoa(String.fromCharCode(...combined));
}
```

---

## Message Decryption

When Bob receives a message from Alice:

```
┌─────────────────────────────────────────────────────────────┐
│                    DECRYPTION FLOW                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [RSA(AES_KEY)] + [IV] + [AES(message)]  (from server)     │
│       │            │           │                            │
│       ▼            │           │                            │
│  ┌─────────────────────┐       │                           │
│  │ Decrypt AES key     │       │                           │
│  │ with Bob's RSA      │       │                           │
│  │ private key         │       │                           │
│  └─────────────────────┘       │                           │
│       │                        │                            │
│       ▼                        ▼                            │
│  ┌─────────────────────────────────────────────────┐       │
│  │ Decrypt message with AES key + IV               │       │
│  └─────────────────────────────────────────────────┘       │
│       │                                                     │
│       ▼                                                     │
│  "Hello Bob!" (plaintext)                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Code Walkthrough

```javascript
async function decryptMessage(encryptedPayload, privateKey) {
    // STEP 1: Decode base64
    const combined = Uint8Array.from(atob(encryptedPayload), c => c.charCodeAt(0));

    // STEP 2: Split components
    const encryptedAesKey = combined.slice(0, 256);      // RSA output is always 256 bytes
    const iv = combined.slice(256, 268);                  // IV is 12 bytes
    const encryptedMessage = combined.slice(268);         // Rest is the ciphertext

    // STEP 3: Decrypt AES key with RSA private key
    const aesKeyBytes = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        encryptedAesKey
    );

    // STEP 4: Import raw AES key
    const aesKey = await crypto.subtle.importKey(
        'raw',
        aesKeyBytes,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );

    // STEP 5: Decrypt message with AES-GCM
    const decryptedMessage = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        aesKey,
        encryptedMessage
    );

    // STEP 6: Decode UTF-8
    return new TextDecoder().decode(decryptedMessage);
}
```

---

## Group Encryption

For group chats, we use a shared symmetric key:

```
┌─────────────────────────────────────────────────────────────┐
│                 GROUP KEY DISTRIBUTION                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Creator generates random AES-256 group key                 │
│                      │                                      │
│          ┌──────────┼──────────┐                           │
│          ▼          ▼          ▼                           │
│    ┌──────────┐┌──────────┐┌──────────┐                   │
│    │RSA(key)  ││RSA(key)  ││RSA(key)  │                   │
│    │for Alice ││for Bob   ││for Carol │                   │
│    └──────────┘└──────────┘└──────────┘                   │
│          │          │          │                           │
│          ▼          ▼          ▼                           │
│    ┌────────────────────────────────────┐                 │
│    │         Server stores:             │                 │
│    │  { alice: encrypted_key,           │                 │
│    │    bob: encrypted_key,             │                 │
│    │    carol: encrypted_key }          │                 │
│    └────────────────────────────────────┘                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Each member can decrypt the group key with their private key, then use it to encrypt/decrypt all group messages.

---

## Security Properties

### What We Achieve

| Property | Status | Explanation |
|----------|--------|-------------|
| **Confidentiality** | ✅ | Only recipient can decrypt |
| **Integrity** | ✅ | GCM provides authentication |
| **End-to-End** | ✅ | Server sees only ciphertext |

### What We Don't Have (Yet)

| Property | Status | Solution |
|----------|--------|----------|
| **Forward Secrecy** | ❌ | Implement Double Ratchet |
| **Deniability** | ❌ | Use OTR or Signal protocol |
| **Post-Compromise Security** | ❌ | Key rotation |

### Why AES-GCM?

**GCM (Galois/Counter Mode)** provides:
1. **Encryption** - Confidentiality
2. **Authentication** - Integrity (detects tampering)
3. **Speed** - Hardware acceleration on most CPUs

```
AES-GCM = AES-CTR (encryption) + GMAC (authentication)
```

### Why RSA-OAEP?

**OAEP (Optimal Asymmetric Encryption Padding)** prevents:
1. Chosen-ciphertext attacks
2. Padding oracle attacks
3. Malleability attacks

Never use "textbook RSA" or PKCS#1 v1.5 padding!

---

## Further Reading

- [Web Crypto API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Signal Protocol Whitepaper](https://signal.org/docs/)
- [NIST SP 800-38D (GCM)](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [RFC 8017 (RSA OAEP)](https://tools.ietf.org/html/rfc8017)
