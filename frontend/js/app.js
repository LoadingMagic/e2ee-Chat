/**
 * SecureChat Main Application
 * Handles UI, state management, and coordination between crypto and websocket modules.
 */

const App = {
    // Server configuration - UPDATE THIS FOR YOUR DEPLOYMENT
    SERVER_HOST: 'your-server.com',
    SERVER_PROTOCOL: 'https',

    /**
     * Get API base URL.
     */
    getApiUrl: function(path) {
        // Check if running in Capacitor (APK) or browser
        const isCapacitor = window.Capacitor !== undefined || 
                           window.location.protocol === 'file:' || 
                           window.location.protocol === 'capacitor:' ||
                           window.location.protocol === 'https:' && window.location.hostname === 'localhost';
        
        if (isCapacitor) {
            return `${this.SERVER_PROTOCOL}://${this.SERVER_HOST}${path}`;
        }
        // Running in browser, use relative path
        return path;
    },

    // Current user state
    userId: null,
    publicKey: null,
    privateKey: null,
    displayName: null,
    avatar: null,

    // Current conversation state
    currentConversation: null,
    conversations: [],
    recipientPublicKeys: {},
    recipientAvatars: {},
    contactNicknames: {},
    blockedUsers: [],
    
    // Reply state
    replyingTo: null,

    // Message cache for replies
    messageCache: {},
    
    // Groups state
    groups: [],
    currentGroup: null,
    groupKeys: {},
    
    // Sound settings
    soundEnabled: true,
    notificationSound: null,
    
    // Double-tap tracking
    lastTapTime: 0,
    lastTapMessageId: null,
    
    // Reaction emojis for quick react
    reactionEmojis: ['❤️', '👍', '😂', '😮', '😢', '🔥'],

    // Mobile detection
    isMobile: function() {
        return window.innerWidth <= 768;
    },

    // UI Elements (populated on init)
    elements: {},

    // Common emojis for picker
    commonEmojis: [
        '😀', '😂', '😄', '😊', '😍', '🥰', '😘', '😎', '🤔', '😅',
        '👍', '👎', '👋', '🙏', '💪', '🎉', '🔥', '❤️', '💯', '✨',
        '😢', '😭', '😤', '😱', '🤯', '😴', '🤢', '💀', '👀', '🙄',
        '✅', '❌', '⭐', '💡', '📌', '🚀', '💬', '📷', '🎵', '🎮'
    ],

    // =========================================================================
    // KEY VERIFICATION (localStorage-based)
    // =========================================================================
    
    /**
     * Check if a contact is verified.
     * @param {string} contactId - Contact's user ID.
     * @returns {boolean} True if contact is verified.
     */
    isContactVerified: function(contactId) {
        try {
            const verified = JSON.parse(localStorage.getItem('sc_verified_contacts') || '{}');
            return verified[contactId] === true;
        } catch (e) {
            return false;
        }
    },

    /**
     * Mark a contact as verified.
     * @param {string} contactId - Contact's user ID.
     */
    markContactVerified: function(contactId) {
        try {
            const verified = JSON.parse(localStorage.getItem('sc_verified_contacts') || '{}');
            verified[contactId] = true;
            localStorage.setItem('sc_verified_contacts', JSON.stringify(verified));
        } catch (e) {
            console.error('Failed to save verification status:', e);
        }
    },

    /**
     * Mark a contact as unverified.
     * @param {string} contactId - Contact's user ID.
     */
    markContactUnverified: function(contactId) {
        try {
            const verified = JSON.parse(localStorage.getItem('sc_verified_contacts') || '{}');
            delete verified[contactId];
            localStorage.setItem('sc_verified_contacts', JSON.stringify(verified));
        } catch (e) {
            console.error('Failed to save verification status:', e);
        }
    },

    /**
     * Update the verification banner in chat UI.
     */
    updateVerificationBanner: function() {
        const banner = document.getElementById('verification-banner');
        if (!banner) return;
        
        // Only show for direct messages, not groups
        if (!this.currentConversation || this.currentGroup) {
            banner.classList.add('hidden');
            return;
        }
        
        const isVerified = this.isContactVerified(this.currentConversation);
        
        if (isVerified) {
            banner.classList.add('hidden');
        } else {
            banner.classList.remove('hidden');
        }
    },

    /**
     * Initialize application.
     */
    init: async function() {
        this.cacheElements();
        this.bindEvents();
        this.createEmojiPicker();
        this.initSound();
        this.initMobileNav();

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

    // ... rest of app.js methods would continue here
    // For brevity, see the full source in the main frontend/js/app.js
};

document.addEventListener('DOMContentLoaded', () => App.init());
