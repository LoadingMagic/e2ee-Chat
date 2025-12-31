/**
 * SecureChat Main Application
 * ===========================
 * 
 * This is a simplified version for educational purposes.
 * Demonstrates the core concepts of E2EE messaging.
 */

const App = {
    // Server configuration - change for your deployment
    SERVER_HOST: 'localhost:8000',
    SERVER_PROTOCOL: 'http',

    getApiUrl: function(path) {
        if (window.Capacitor || window.location.protocol === 'file:') {
            return `${this.SERVER_PROTOCOL}://${this.SERVER_HOST}${path}`;
        }
        return path;
    },

    // User state
    userId: null,
    publicKey: null,
    privateKey: null,
    displayName: null,

    // Conversation state
    currentConversation: null,
    conversations: [],
    recipientPublicKeys: {},

    // DOM elements
    elements: {},

    /**
     * Initialize application
     */
    init: async function() {
        this.cacheElements();
        this.bindEvents();

        // Check for existing session
        const keys = await SecureCrypto.loadKeys();
        if (keys) {
            this.userId = keys.userId;
            this.publicKey = keys.publicKey;
            this.privateKey = keys.privateKey;
            this.displayName = localStorage.getItem('sc_display_name');
            await this.enterApp();
        } else {
            this.showScreen('welcome');
        }
    },

    /**
     * Cache DOM elements
     */
    cacheElements: function() {
        this.elements = {
            // Screens
            welcomeScreen: document.getElementById('welcome-screen'),
            signupScreen: document.getElementById('signup-screen'),
            restoreScreen: document.getElementById('restore-screen'),
            appScreen: document.getElementById('app-screen'),

            // Signup
            recoveryKeyDisplay: document.getElementById('recovery-key-display'),
            userIdDisplay: document.getElementById('user-id-display'),
            signupDisplayName: document.getElementById('signup-display-name'),

            // Restore
            restoreKeyInput: document.getElementById('restore-key-input'),
            restoreError: document.getElementById('restore-error'),

            // App
            currentUserId: document.getElementById('current-user-id'),
            currentDisplayName: document.getElementById('current-display-name'),
            conversationsList: document.getElementById('conversations-list'),
            newChatInput: document.getElementById('new-chat-input'),
            chatPlaceholder: document.getElementById('chat-placeholder'),
            chatContainer: document.getElementById('chat-container'),
            chatRecipientName: document.getElementById('chat-recipient-name'),
            messagesContainer: document.getElementById('messages-container'),
            messageInput: document.getElementById('message-input'),
            connectionStatus: document.getElementById('connection-status')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents: function() {
        // Welcome
        document.getElementById('btn-new-account').addEventListener('click', () => this.startSignup());
        document.getElementById('btn-restore').addEventListener('click', () => this.showScreen('restore'));

        // Signup
        document.getElementById('btn-copy-recovery').addEventListener('click', () => this.copyRecoveryKey());
        document.getElementById('btn-confirm-signup').addEventListener('click', () => this.confirmSignup());
        document.getElementById('btn-back-from-signup').addEventListener('click', () => this.showScreen('welcome'));

        // Restore
        document.getElementById('btn-confirm-restore').addEventListener('click', () => this.confirmRestore());
        document.getElementById('btn-back-from-restore').addEventListener('click', () => this.showScreen('welcome'));

        // App
        document.getElementById('btn-new-chat').addEventListener('click', () => this.startNewChat());
        document.getElementById('btn-send-message').addEventListener('click', () => this.sendMessage());
        document.getElementById('btn-logout').addEventListener('click', () => this.logout());
        
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.elements.newChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.startNewChat();
        });

        // WebSocket events
        SecureWebSocket.onMessage((type, data) => this.handleWebSocketMessage(type, data));
    },

    /**
     * Show a screen, hide others
     */
    showScreen: function(screen) {
        this.elements.welcomeScreen.classList.add('hidden');
        this.elements.signupScreen.classList.add('hidden');
        this.elements.restoreScreen.classList.add('hidden');
        this.elements.appScreen.classList.add('hidden');

        switch (screen) {
            case 'welcome':
                this.elements.welcomeScreen.classList.remove('hidden');
                break;
            case 'signup':
                this.elements.signupScreen.classList.remove('hidden');
                break;
            case 'restore':
                this.elements.restoreScreen.classList.remove('hidden');
                this.elements.restoreKeyInput.value = '';
                this.elements.restoreError.classList.add('hidden');
                break;
            case 'app':
                this.elements.appScreen.classList.remove('hidden');
                break;
        }
    },

    /**
     * Start signup - generate keys
     */
    startSignup: async function() {
        // Generate recovery key (this is the ONLY time it's shown)
        const recoveryKey = SecureCrypto.generateRecoveryKey();
        const userId = await SecureCrypto.deriveUserId(recoveryKey);
        const keyPair = await SecureCrypto.deriveKeyPair(recoveryKey);

        // Store temporarily
        this.tempRecoveryKey = recoveryKey;
        this.tempKeyPair = keyPair;
        this.tempUserId = userId;

        // Display to user
        this.elements.recoveryKeyDisplay.textContent = recoveryKey;
        this.elements.userIdDisplay.textContent = userId;

        this.showScreen('signup');
    },

    /**
     * Copy recovery key
     */
    copyRecoveryKey: async function() {
        await navigator.clipboard.writeText(this.tempRecoveryKey);
        document.getElementById('btn-copy-recovery').textContent = 'Copied!';
        setTimeout(() => {
            document.getElementById('btn-copy-recovery').textContent = 'Copy Key';
        }, 2000);
    },

    /**
     * Confirm signup and register
     */
    confirmSignup: async function() {
        const displayName = this.elements.signupDisplayName.value.trim() || null;
        const publicKeyB64 = await SecureCrypto.exportPublicKey(this.tempKeyPair.publicKey);

        try {
            const response = await fetch(this.getApiUrl('/api/register'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: this.tempUserId,
                    public_key: publicKeyB64,
                    display_name: displayName
                })
            });

            if (!response.ok) {
                const error = await response.json();
                alert('Registration failed: ' + error.detail);
                return;
            }

            // Store keys locally
            await SecureCrypto.storeKeys(this.tempRecoveryKey, this.tempKeyPair);
            if (displayName) localStorage.setItem('sc_display_name', displayName);

            // Set app state
            this.userId = this.tempUserId;
            this.publicKey = this.tempKeyPair.publicKey;
            this.privateKey = this.tempKeyPair.privateKey;
            this.displayName = displayName;

            // Clear temp
            this.tempRecoveryKey = null;
            this.tempKeyPair = null;
            this.tempUserId = null;

            await this.enterApp();
        } catch (e) {
            console.error('Signup error:', e);
            alert('Registration failed. Please try again.');
        }
    },

    /**
     * Restore from recovery key
     */
    confirmRestore: async function() {
        const recoveryKey = this.elements.restoreKeyInput.value.trim().toLowerCase();

        if (!/^[a-f0-9]{64}$/.test(recoveryKey)) {
            this.elements.restoreError.textContent = 'Invalid format. Must be 64 hex characters.';
            this.elements.restoreError.classList.remove('hidden');
            return;
        }

        try {
            const userId = await SecureCrypto.deriveUserId(recoveryKey);
            const keyPair = await SecureCrypto.deriveKeyPair(recoveryKey);
            const publicKeyB64 = await SecureCrypto.exportPublicKey(keyPair.publicKey);

            // Check if user exists
            const checkResponse = await fetch(this.getApiUrl(`/api/user/${userId}/exists`));
            const checkData = await checkResponse.json();

            if (!checkData.exists) {
                // Register new user with this recovery key
                await fetch(this.getApiUrl('/api/register'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        public_key: publicKeyB64
                    })
                });
            }

            await SecureCrypto.storeKeys(recoveryKey, keyPair);
            
            this.userId = userId;
            this.publicKey = keyPair.publicKey;
            this.privateKey = keyPair.privateKey;

            await this.enterApp();
        } catch (e) {
            console.error('Restore error:', e);
            this.elements.restoreError.textContent = 'Restore failed: ' + e.message;
            this.elements.restoreError.classList.remove('hidden');
        }
    },

    /**
     * Enter main app
     */
    enterApp: async function() {
        this.elements.currentUserId.textContent = this.userId;
        this.elements.currentDisplayName.textContent = this.displayName || 'Anonymous';

        SecureWebSocket.connect(this.userId);
        await this.loadConversations();

        this.showScreen('app');
    },

    /**
     * Load conversations list
     */
    loadConversations: async function() {
        try {
            const response = await fetch(this.getApiUrl(`/api/conversations?user_id=${this.userId}`));
            if (response.ok) {
                const data = await response.json();
                this.conversations = data.conversations;
                this.renderConversations();
            }
        } catch (e) {
            console.error('Failed to load conversations:', e);
        }
    },

    /**
     * Render conversations list
     */
    renderConversations: function() {
        this.elements.conversationsList.innerHTML = '';

        if (this.conversations.length === 0) {
            this.elements.conversationsList.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #888;">
                    No conversations yet.<br>Enter a User ID above to start.
                </div>
            `;
            return;
        }

        this.conversations.forEach(conv => {
            const div = document.createElement('div');
            div.className = 'conversation-item';
            if (this.currentConversation === conv.user_id) {
                div.classList.add('active');
            }
            
            div.innerHTML = `
                <div class="conv-name">${this.escapeHtml(conv.display_name || 'Anonymous')}</div>
                <div class="conv-id">${conv.user_id.substring(0, 12)}...</div>
            `;
            
            div.addEventListener('click', () => this.openConversation(conv.user_id));
            this.elements.conversationsList.appendChild(div);
        });
    },

    /**
     * Start new chat
     */
    startNewChat: async function() {
        const recipientId = this.elements.newChatInput.value.trim().toLowerCase();

        if (!recipientId || !/^[a-f0-9]{32}$/.test(recipientId)) {
            alert('Invalid User ID. Must be 32 hex characters.');
            return;
        }

        if (recipientId === this.userId) {
            alert('You cannot message yourself.');
            return;
        }

        try {
            const response = await fetch(this.getApiUrl(`/api/user/${recipientId}`));
            if (!response.ok) {
                alert('User not found.');
                return;
            }

            this.elements.newChatInput.value = '';
            await this.openConversation(recipientId);
        } catch (e) {
            alert('Failed to start chat.');
        }
    },

    /**
     * Open conversation
     */
    openConversation: async function(recipientId) {
        this.currentConversation = recipientId;

        // Get recipient's public key
        try {
            const response = await fetch(this.getApiUrl(`/api/user/${recipientId}`));
            if (response.ok) {
                const userData = await response.json();
                this.recipientPublicKeys[recipientId] = await SecureCrypto.importPublicKey(userData.public_key);
                this.elements.chatRecipientName.textContent = userData.display_name || 'Anonymous';
            }
        } catch (e) {
            console.error('Failed to get recipient info:', e);
        }

        this.elements.chatPlaceholder.classList.add('hidden');
        this.elements.chatContainer.classList.remove('hidden');

        this.renderConversations();
        await this.loadMessages();
    },

    /**
     * Load messages
     */
    loadMessages: async function() {
        if (!this.currentConversation) return;

        try {
            const response = await fetch(
                this.getApiUrl(`/api/messages/${this.currentConversation}?user_id=${this.userId}`)
            );
            
            if (response.ok) {
                const data = await response.json();
                await this.renderMessages(data.messages);
            }
        } catch (e) {
            console.error('Failed to load messages:', e);
        }
    },

    /**
     * Render messages
     */
    renderMessages: async function(messages) {
        this.elements.messagesContainer.innerHTML = '';

        for (const msg of messages) {
            const isSent = msg.sender_id === this.userId;
            const encryptedContent = isSent ? msg.encrypted_for_sender : msg.encrypted_content;

            let decryptedText;
            try {
                // DECRYPTION HAPPENS HERE - using our private key
                decryptedText = await SecureCrypto.decryptMessage(encryptedContent, this.privateKey);
            } catch (e) {
                decryptedText = '[Unable to decrypt]';
            }

            const div = document.createElement('div');
            div.className = `message ${isSent ? 'sent' : 'received'}`;
            div.innerHTML = `
                <div class="message-content">${this.escapeHtml(decryptedText)}</div>
                <div class="message-time">${this.formatTime(msg.created_at)}</div>
            `;
            
            this.elements.messagesContainer.appendChild(div);
        }

        // Scroll to bottom
        requestAnimationFrame(() => {
            this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        });
    },

    /**
     * Send message
     */
    sendMessage: async function() {
        const text = this.elements.messageInput.value.trim();
        if (!text || !this.currentConversation) return;

        const recipientPublicKey = this.recipientPublicKeys[this.currentConversation];
        if (!recipientPublicKey) {
            alert('Cannot encrypt. Recipient key not found.');
            return;
        }

        try {
            // ENCRYPTION HAPPENS HERE
            // Encrypt for recipient (they decrypt with their private key)
            const encryptedForRecipient = await SecureCrypto.encryptMessage(text, recipientPublicKey);
            // Encrypt for self (so we can read our own messages)
            const encryptedForSelf = await SecureCrypto.encryptMessage(text, this.publicKey);

            const response = await fetch(this.getApiUrl(`/api/messages?sender_id=${this.userId}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient_id: this.currentConversation,
                    encrypted_content: encryptedForRecipient,
                    encrypted_for_sender: encryptedForSelf
                })
            });

            if (response.ok) {
                this.elements.messageInput.value = '';

                // Add to UI immediately
                const div = document.createElement('div');
                div.className = 'message sent';
                div.innerHTML = `
                    <div class="message-content">${this.escapeHtml(text)}</div>
                    <div class="message-time">Just now</div>
                `;
                this.elements.messagesContainer.appendChild(div);
                this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;

                await this.loadConversations();
            }
        } catch (e) {
            console.error('Send error:', e);
            alert('Failed to send message.');
        }
    },

    /**
     * Handle WebSocket messages
     */
    handleWebSocketMessage: async function(type, data) {
        switch (type) {
            case 'connected':
                this.elements.connectionStatus.textContent = '●';
                this.elements.connectionStatus.style.color = '#10b981';
                break;

            case 'disconnected':
                this.elements.connectionStatus.textContent = '●';
                this.elements.connectionStatus.style.color = '#ef4444';
                break;

            case 'new_message':
                if (data.sender_id === this.currentConversation) {
                    // Decrypt and show immediately
                    try {
                        const decrypted = await SecureCrypto.decryptMessage(
                            data.encrypted_content,
                            this.privateKey
                        );
                        const div = document.createElement('div');
                        div.className = 'message received';
                        div.innerHTML = `
                            <div class="message-content">${this.escapeHtml(decrypted)}</div>
                            <div class="message-time">Just now</div>
                        `;
                        this.elements.messagesContainer.appendChild(div);
                        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
                    } catch (e) {
                        console.error('Decrypt error:', e);
                    }
                }
                await this.loadConversations();
                break;
        }
    },

    /**
     * Logout
     */
    logout: function() {
        if (!confirm('Make sure you saved your recovery key! Logout?')) return;

        SecureWebSocket.disconnect();
        SecureCrypto.clearKeys();
        
        this.userId = null;
        this.publicKey = null;
        this.privateKey = null;
        this.currentConversation = null;
        this.conversations = [];

        this.showScreen('welcome');
    },

    /**
     * Escape HTML
     */
    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Format timestamp
     */
    formatTime: function(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
};

// Start app when DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
