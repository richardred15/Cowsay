const security = require('../security');

class BaseGame {
    constructor(gameType) {
        this.gameType = gameType;
    }

    createBaseGameData(creator, serverId, additionalData = {}) {
        return {
            type: this.gameType,
            phase: "waiting",
            serverId: serverId,
            startTime: Date.now(),
            creator: creator.id,
            creatorName: this.sanitizePlayerName(creator.displayName),
            ...additionalData
        };
    }

    sanitizePlayerName(name) {
        if (!name) return "Unknown";
        return security.sanitizeForDisplay(String(name)).substring(0, 32);
    }

    validateInteraction(interaction, gameData, allowedPhases = null) {
        if (!interaction.customId.startsWith(`${this.gameType}_`)) {
            return { valid: false, error: "Invalid interaction type" };
        }

        if (allowedPhases && !allowedPhases.includes(gameData.phase)) {
            return { valid: false, error: `Game is not in correct phase (${gameData.phase})` };
        }

        return { valid: true };
    }

    isPlayerInGame(userId, gameData) {
        if (gameData.player1?.id === userId) return true;
        if (gameData.player2?.id === userId) return true;
        if (gameData.players?.some(p => p.id === userId)) return true;
        return false;
    }

    getGameDuration(gameData) {
        return gameData.startTime ? Math.floor((Date.now() - gameData.startTime) / 1000) : null;
    }

    async recordGameOutcome(gameData, winnerId, additionalData = {}) {
        const gameStats = require('../gameStats');
        
        const baseOutcome = {
            server_id: gameData.serverId || 'unknown',
            game_type: this.gameType,
            winner_id: winnerId,
            game_duration: this.getGameDuration(gameData),
            ...additionalData
        };

        return gameStats.recordOutcome(baseOutcome);
    }
}

module.exports = BaseGame;