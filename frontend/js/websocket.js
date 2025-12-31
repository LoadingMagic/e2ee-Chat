/**
 * SecureChat WebSocket Module
 * ===========================
 * 
 * Handles real-time messaging via WebSocket connection.
 * Provides automatic reconnection and event handling.
 */

const SecureWebSocket = {
    socket: null,
    userId: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,
    pingInterval: null,
    messageHandlers: [],

    // Configure this for your server
    SERVER_HOST: 'localhost:8000',
    SERVER_PROTOCOL: 'ws', // Use 'wss' for production

    /**
     * Check if running in Capacitor/APK
     */
    isCapacitor: function() {
        return window.Capacitor !== undefined || 
               window.location.protocol === 'file:' || 
               window.location.protocol === 'capacitor:';
    },

    /**
     * Connect to WebSocket server
     */
    connect: function(userId) {
        this.userId = userId;
        
        let wsUrl;
        if (this.isCapacitor()) {
            // Running in APK - use configured server
            wsUrl = `${this.SERVER_PROTOCOL}://${this.SERVER_HOST}/ws/${userId}`;
        } else {
            // Running in browser - use current host
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${window.location.host}/ws/${userId}`;
        }
        
        console.log('[WebSocket] Connecting to:', wsUrl);
        
        try {
            this.socket = new WebSocket(wsUrl);
            this.setupEventHandlers();
        } catch (e) {
            console.error('[WebSocket] Connection failed:', e);
            this.scheduleReconnect();
        }
    },

    /**
     * Setup WebSocket event handlers
     */
    setupEventHandlers: function() {
        this.socket.onopen = () => {
            console.log('[WebSocket] Connected');
            this.reconnectAttempts = 0;
            this.startPing();
            this.notifyHandlers('connected', {});
        };

        this.socket.onclose = (event) => {
            console.log('[WebSocket] Disconnected:', event.code);
            this.stopPing();
            this.notifyHandlers('disconnected', { code: event.code });
            this.scheduleReconnect();
        };

        this.socket.onerror = (error) => {
            console.error('[WebSocket] Error:', error);
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.notifyHandlers(message.type, message.data);
            } catch (e) {
                console.error('[WebSocket] Parse error:', e);
            }
        };
    },

    /**
     * Send message through WebSocket
     */
    send: function(type, data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type, data }));
        }
    },

    /**
     * Send typing indicator
     */
    sendTyping: function(recipientId) {
        this.send('typing', { recipient_id: recipientId });
    },

    /**
     * Send read receipt
     */
    sendRead: function(senderId) {
        this.send('read', { sender_id: senderId });
    },

    /**
     * Keep connection alive with pings
     */
    startPing: function() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            this.send('ping', {});
        }, 30000);
    },

    stopPing: function() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    },

    /**
     * Auto-reconnect with exponential backoff
     */
    scheduleReconnect: function() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('[WebSocket] Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`[WebSocket] Reconnecting in ${delay}ms`);
        
        setTimeout(() => {
            if (this.userId) this.connect(this.userId);
        }, delay);
    },

    /**
     * Register event handler
     */
    onMessage: function(handler) {
        this.messageHandlers.push(handler);
    },

    /**
     * Notify all handlers
     */
    notifyHandlers: function(type, data) {
        this.messageHandlers.forEach(handler => {
            try {
                handler(type, data);
            } catch (e) {
                console.error('[WebSocket] Handler error:', e);
            }
        });
    },

    /**
     * Disconnect
     */
    disconnect: function() {
        this.stopPing();
        if (this.socket) {
            this.socket.close(1000, 'User disconnect');
            this.socket = null;
        }
    }
};

window.SecureWebSocket = SecureWebSocket;
