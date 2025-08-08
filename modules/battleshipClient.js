const WebSocket = require("ws");
const Logger = require("./logger");

class BattleshipClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.messageQueue = [];
        this.gameCallbacks = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

        try {
            const wsUrl = process.env.BATTLESHIP_WS_URL || "wss://localhost:3050/api/bot";
            const authToken = process.env.BATTLESHIP_AUTH_TOKEN;
            
            if (!authToken) {
                Logger.error('BATTLESHIP_AUTH_TOKEN not configured');
                return;
            }
            
            this.ws = new WebSocket(wsUrl, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            this.ws.on("open", () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                Logger.info("Battleship WebSocket connected");
                this.send({ type: "list_games" });
                this.processQueue();
            });

            this.ws.on("message", (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                } catch (error) {
                    Logger.error(
                        "Battleship message parse error",
                        error.message
                    );
                }
            });

            this.ws.on("close", () => {
                this.connected = false;
                Logger.info("Battleship WebSocket disconnected");
                this.scheduleReconnect();
            });

            this.ws.on("error", (error) => {
                Logger.error("Battleship WebSocket error", error.message);
            });
        } catch (error) {
            Logger.error("Battleship connection error", error.message);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

        const delay = Math.pow(2, this.reconnectAttempts) * 1000;
        this.reconnectAttempts++;

        setTimeout(() => this.connect(), delay);
    }

    send(message) {
        if (this.connected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            this.messageQueue.push(message);
            if (!this.connected) this.connect();
        }
    }

    processQueue() {
        while (this.messageQueue.length > 0 && this.connected) {
            const message = this.messageQueue.shift();
            this.ws.send(JSON.stringify(message));
        }
    }

    handleMessage(message) {
        if (message.type === "games_list") {
            return;
        }

        const messageHandlers = {
            'game_created': () => this.handleCreateGameMessage(message),
            'error': () => this.handleCreateGameMessage(message),
            'ascii_response': () => this.handleAsciiMessage(message),
            'game_update': () => this.handleGameUpdateMessage(message),
            'subscribed': () => this.handleGameUpdateMessage(message)
        };

        const handler = messageHandlers[message.type];
        if (handler) {
            handler();
        }
    }

    handleCreateGameMessage(message) {
        for (const [key, callback] of this.gameCallbacks) {
            if (key.startsWith('create_')) {
                callback(message);
                break;
            }
        }
    }

    handleAsciiMessage(message) {
        for (const [key, callback] of this.gameCallbacks) {
            if (key.startsWith(`ascii_${message.gameId}_`)) {
                callback(message);
                break;
            }
        }
    }

    handleGameUpdateMessage(message) {
        const callback = this.gameCallbacks.get(`sub_${message.gameId}`);
        if (callback) {
            callback(message);
        }
    }

    createGame(callback, userId = null, userMessage = null) {
        const SecurityUtils = require('./security');
        
        if (!userId) {
            callback({ type: 'error', message: 'User ID required for game creation' });
            return;
        }
        
        // Validate authorization if user message is provided
        if (userMessage) {
            SecurityUtils.validateAuthorization(userMessage, 'user').then(authorized => {
                if (!authorized) {
                    callback({ type: 'error', message: 'Unauthorized game creation attempt' });
                    return;
                }
                this.performGameCreation(callback, userId);
            }).catch(() => {
                callback({ type: 'error', message: 'Authorization check failed' });
            });
        } else {
            this.performGameCreation(callback, userId);
        }
    }
    
    performGameCreation(callback, userId) {
        const SecurityUtils = require('./security');
        const tempId = `create_${Date.now()}`;
        this.gameCallbacks.set(tempId, (message) => {
            if (message.type === "game_created") {
                this.gameCallbacks.delete(tempId);
                callback(message);
            } else if (message.type === "error") {
                this.gameCallbacks.delete(tempId);
                callback(message);
            }
        });
        this.send({ type: "create_game", userId: SecurityUtils.sanitizeForLog(userId) });
    }

    getAscii(gameId, callback) {
        const tempId = `ascii_${gameId}_${Date.now()}`;
        this.gameCallbacks.set(tempId, (message) => {
            if (message.type === "ascii_response" && message.gameId === gameId) {
                this.gameCallbacks.delete(tempId);
                callback(message);
            }
        });
        this.send({ type: "get_ascii", gameId });
    }

    subscribeGame(gameId, callback) {
        this.gameCallbacks.set(`sub_${gameId}`, callback);
        this.send({ type: "subscribe_game", gameId });
    }

    unsubscribe(gameId) {
        this.gameCallbacks.delete(`sub_${gameId}`);
    }
}

module.exports = new BattleshipClient();
