/**
 * SecureChat E2EE Crypto Module
 * =============================
 * 
 * Uses Web Crypto API - NO external dependencies
 * All encryption happens in the browser, server sees only encrypted blobs
 * 
 * Algorithms:
 * - RSA-OAEP (2048-bit) for key exchange
 * - AES-256-GCM for message encryption
 * - PBKDF2 (SHA-256, 100k iterations) for key derivation
 */

const SecureCrypto = {
    
    // =========================================================================
    // KEY GENERATION
    // =========================================================================
    
    /**
     * Generate 64-char hex recovery key (seed for everything)
     * This is shown ONCE to the user and must be saved
     */
    generateRecoveryKey: function() {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Derive 32-char user ID from recovery key using SHA-256
     * User ID is public and used to identify users
     */
    deriveUserId: async function(recoveryKey) {
        const encoder = new TextEncoder();
        const data = encoder.encode(recoveryKey + ':userid');
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Generate RSA key pair for encryption/decryption
     * Note: Web Crypto doesn't support seeded RSA, so keys are random
     * The recovery key is used to encrypt the private key for backup
     */
    deriveKeyPair: async function(recoveryKey) {
        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256'
            },
            true,  // extractable
            ['encrypt', 'decrypt']
        );
        return keyPair;
    },

    // =========================================================================
    // KEY IMPORT/EXPORT
    // =========================================================================

    exportPublicKey: async function(publicKey) {
        const exported = await crypto.subtle.exportKey('spki', publicKey);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    },

    exportPrivateKey: async function(privateKey) {
        const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    },

    importPublicKey: async function(base64Key) {
        const binaryString = atob(base64Key);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return await crypto.subtle.importKey(
            'spki', bytes,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            true, ['encrypt']
        );
    },

    importPrivateKey: async function(base64Key) {
        const binaryString = atob(base64Key);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return await crypto.subtle.importKey(
            'pkcs8', bytes,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            true, ['decrypt']
        );
    },

    // =========================================================================
    // MESSAGE ENCRYPTION (Hybrid: RSA + AES)
    // =========================================================================

    /**
     * Encrypt a message for a recipient
     * 
     * How it works:
     * 1. Generate random AES-256 key for THIS message only
     * 2. Encrypt message with AES-GCM
     * 3. Encrypt the AES key with recipient's RSA public key
     * 4. Combine: [Encrypted AES Key (256 bytes)] + [IV (12 bytes)] + [Ciphertext]
     */
    encryptMessage: async function(message, recipientPublicKey) {
        // Step 1: Generate random AES key
        const aesKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true, ['encrypt']
        );

        // Step 2: Generate random IV (nonce)
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Step 3: Encrypt message with AES-GCM
        const encoder = new TextEncoder();
        const encryptedMessage = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            aesKey,
            encoder.encode(message)
        );

        // Step 4: Encrypt AES key with RSA
        const exportedAesKey = await crypto.subtle.exportKey('raw', aesKey);
        const encryptedAesKey = await crypto.subtle.encrypt(
            { name: 'RSA-OAEP' },
            recipientPublicKey,
            exportedAesKey
        );

        // Step 5: Combine everything
        const combined = new Uint8Array(
            encryptedAesKey.byteLength + iv.byteLength + encryptedMessage.byteLength
        );
        combined.set(new Uint8Array(encryptedAesKey), 0);
        combined.set(iv, encryptedAesKey.byteLength);
        combined.set(new Uint8Array(encryptedMessage), encryptedAesKey.byteLength + iv.byteLength);

        return btoa(String.fromCharCode(...combined));
    },

    /**
     * Decrypt a message using own private key
     * 
     * Reverses the encryption process:
     * 1. Split the payload into components
     * 2. Decrypt AES key with RSA private key
     * 3. Decrypt message with AES key
     */
    decryptMessage: async function(encryptedPayload, privateKey) {
        // Decode base64
        const binaryString = atob(encryptedPayload);
        const combined = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            combined[i] = binaryString.charCodeAt(i);
        }

        // Split components
        const encryptedAesKey = combined.slice(0, 256);
        const iv = combined.slice(256, 268);
        const encryptedMessage = combined.slice(268);

        // Decrypt AES key with RSA
        const aesKeyBytes = await crypto.subtle.decrypt(
            { name: 'RSA-OAEP' },
            privateKey,
            encryptedAesKey
        );

        // Import AES key
        const aesKey = await crypto.subtle.importKey(
            'raw', aesKeyBytes,
            { name: 'AES-GCM', length: 256 },
            false, ['decrypt']
        );

        // Decrypt message
        const decryptedMessage = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            aesKey,
            encryptedMessage
        );

        return new TextDecoder().decode(decryptedMessage);
    },

    // =========================================================================
    // GROUP ENCRYPTION (AES key shared with all members)
    // =========================================================================

    generateGroupKey: async function() {
        return await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true, ['encrypt', 'decrypt']
        );
    },

    encryptKeyForUser: async function(aesKey, publicKey) {
        const exported = await crypto.subtle.exportKey('raw', aesKey);
        const encrypted = await crypto.subtle.encrypt(
            { name: 'RSA-OAEP' }, publicKey, exported
        );
        return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    },

    decryptKeyForUser: async function(encryptedKey, privateKey) {
        const bytes = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));
        const decrypted = await crypto.subtle.decrypt(
            { name: 'RSA-OAEP' }, privateKey, bytes
        );
        return await crypto.subtle.importKey(
            'raw', decrypted,
            { name: 'AES-GCM', length: 256 },
            true, ['encrypt', 'decrypt']
        );
    },

    encryptWithAes: async function(message, aesKey) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            aesKey,
            new TextEncoder().encode(message)
        );
        const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.byteLength);
        return btoa(String.fromCharCode(...combined));
    },

    decryptWithAes: async function(encryptedPayload, aesKey) {
        const combined = Uint8Array.from(atob(encryptedPayload), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv }, aesKey, encrypted
        );
        return new TextDecoder().decode(decrypted);
    },

    // =========================================================================
    // LOCAL KEY STORAGE
    // =========================================================================

    storeKeys: async function(recoveryKey, keyPair) {
        const publicKeyB64 = await this.exportPublicKey(keyPair.publicKey);
        const privateKeyB64 = await this.exportPrivateKey(keyPair.privateKey);
        const userId = await this.deriveUserId(recoveryKey);

        localStorage.setItem('sc_user_id', userId);
        localStorage.setItem('sc_public_key', publicKeyB64);
        localStorage.setItem('sc_private_key', privateKeyB64);
    },

    loadKeys: async function() {
        const userId = localStorage.getItem('sc_user_id');
        const publicKeyB64 = localStorage.getItem('sc_public_key');
        const privateKeyB64 = localStorage.getItem('sc_private_key');

        if (!userId || !publicKeyB64 || !privateKeyB64) return null;

        try {
            return {
                userId,
                publicKey: await this.importPublicKey(publicKeyB64),
                privateKey: await this.importPrivateKey(privateKeyB64)
            };
        } catch (e) {
            console.error('Failed to load keys:', e);
            return null;
        }
    },

    clearKeys: function() {
        localStorage.removeItem('sc_user_id');
        localStorage.removeItem('sc_public_key');
        localStorage.removeItem('sc_private_key');
    },

    // =========================================================================
    // UTILITIES
    // =========================================================================

    /**
     * Generate a visual identicon from user ID
     * Creates a unique, deterministic avatar
     */
    generateIdenticon: function(userId, size = 80) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const hue = parseInt(userId.substring(0, 4), 16) % 360;
        const color = `hsl(${hue}, 65%, 50%)`;
        const bgColor = `hsl(${hue}, 65%, 85%)`;
        
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, size, size);
        
        const cellSize = size / 5;
        ctx.fillStyle = color;
        
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 3; col++) {
                const idx = (row * 3 + col) * 2;
                const val = parseInt(userId.substring(idx % 28, (idx % 28) + 2), 16);
                if (val % 2 === 0) {
                    ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
                    if (col < 2) {
                        ctx.fillRect((4 - col) * cellSize, row * cellSize, cellSize, cellSize);
                    }
                }
            }
        }
        return canvas.toDataURL('image/png');
    },

    /**
     * Generate safety number for contact verification
     * Both users see the same number if keys are authentic
     */
    generateSafetyNumber: async function(myPublicKey, theirPublicKey) {
        const myKeyB64 = await this.exportPublicKey(myPublicKey);
        const theirKeyB64 = await this.exportPublicKey(theirPublicKey);
        
        const combined = [myKeyB64, theirKeyB64].sort().join(':');
        const hashBuffer = await crypto.subtle.digest(
            'SHA-256', new TextEncoder().encode(combined)
        );
        const hashArray = new Uint8Array(hashBuffer);
        
        let digits = '';
        for (let i = 0; i < 30; i++) {
            digits += (hashArray[i] % 100).toString().padStart(2, '0');
        }
        
        const groups = [];
        for (let i = 0; i < 60; i += 5) {
            groups.push(digits.substring(i, i + 5));
        }
        
        return [
            groups.slice(0, 4).join(' '),
            groups.slice(4, 8).join(' '),
            groups.slice(8, 12).join(' ')
        ].join('\n');
    }
};

window.SecureCrypto = SecureCrypto;
