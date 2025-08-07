const {
    handleLeaderboardCommand,
    handleLeaderboardResponse,
    clearPendingLeaderboard,
    clearAllPendingLeaderboards,
} = require("./leaderboard");

class LeaderboardHandler {
    constructor(llmProvider, toolManager) {
        this.llmProvider = llmProvider;
        this.toolManager = toolManager;
    }

    async handleMessage(message) {
        try {
            // Handle leaderboard bot responses
            if (
                await handleLeaderboardResponse(
                    message,
                    this.llmProvider,
                    this.toolManager.getAnimalSayTool(),
                    this.toolManager.handleAnimalSay
                )
            ) {
                return true;
            }

            // Watch for leaderboard commands
            await handleLeaderboardCommand(message);
            return false;
        } catch (error) {
            console.error('Leaderboard handler error:', error.message);
            return false;
        }
    }

    clearPending(channelId) {
        clearPendingLeaderboard(channelId);
    }

    clearAllPending() {
        return clearAllPendingLeaderboards();
    }
}

module.exports = LeaderboardHandler;
