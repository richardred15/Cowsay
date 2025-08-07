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
            this.ws = new WebSocket("ws://localhost:3050/api/bot");

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

        // Handle different message types with appropriate callbacks
        if (message.type === "game_created" || message.type === "error") {
            // Find create game callback
            for (const [key, callback] of this.gameCallbacks) {
                if (key.startsWith('create_')) {
                    callback(message);
                    break;
                }
            }
        } else if (message.type === "ascii_response") {
            // Find ASCII callback for this game
            for (const [key, callback] of this.gameCallbacks) {
                if (key.startsWith(`ascii_${message.gameId}_`)) {
                    callback(message);
                    break;
                }
            }
        } else if (message.type === "game_update" || message.type === "subscribed") {
            // Find subscription callback
            const callback = this.gameCallbacks.get(`sub_${message.gameId}`);
            if (callback) {
                callback(message);
            }
        }
    }

    createGame(callback) {
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
        this.send({ type: "create_game" });
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
