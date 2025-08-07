const dataStore = require('./dataStore');

class LeaderboardHistory {
    constructor() {
        this.history = new Map(); // channelId -> [snapshots]
        this.maxSnapshots = 3;
        this.loadData();
    }

    async loadData() {
        const data = await dataStore.load('leaderboard_history');
        if (data) {
            this.history = new Map(Object.entries(data));
            console.log(`Loaded leaderboard history for ${this.history.size} channels`);
        }
    }

    async saveData() {
        const data = Object.fromEntries(this.history);
        await dataStore.save('leaderboard_history', data);
    }

    parseLeaderboard(text) {
        const entries = [];
        const lines = text.split('\n');
        
        for (const line of lines) {
            const match = line.match(/(\d+)\.\s*([^:]+)::\s*Level\s*(\d+)\s*\((\d+)\s*XP\)/);
            if (match) {
                entries.push({
                    rank: parseInt(match[1]),
                    username: match[2].trim(),
                    level: parseInt(match[3]),
                    xp: parseInt(match[4])
                });
            }
        }
        
        return entries;
    }

    addSnapshot(channelId, leaderboardText) {
        const entries = this.parseLeaderboard(leaderboardText);
        if (entries.length === 0) return null;

        const snapshot = {
            timestamp: Date.now(),
            entries: entries
        };

        if (!this.history.has(channelId)) {
            this.history.set(channelId, []);
        }

        const channelHistory = this.history.get(channelId);
        channelHistory.push(snapshot);

        // Keep only last N snapshots
        if (channelHistory.length > this.maxSnapshots) {
            channelHistory.shift();
        }

        // Save to disk
        this.saveData();

        return snapshot;
    }

    getChanges(channelId) {
        const channelHistory = this.history.get(channelId);
        if (!channelHistory || channelHistory.length < 2) {
            return null;
        }

        const previous = channelHistory[channelHistory.length - 2];
        const current = channelHistory[channelHistory.length - 1];

        const changes = [];
        const prevMap = new Map(previous.entries.map(e => [e.username, e]));

        for (const currentEntry of current.entries) {
            const prevEntry = prevMap.get(currentEntry.username);
            
            if (prevEntry) {
                const xpGain = currentEntry.xp - prevEntry.xp;
                const rankChange = prevEntry.rank - currentEntry.rank; // Positive = moved up
                
                if (xpGain > 0 || rankChange !== 0) {
                    changes.push({
                        username: currentEntry.username,
                        currentRank: currentEntry.rank,
                        previousRank: prevEntry.rank,
                        xpGain: xpGain,
                        rankChange: rankChange,
                        currentXP: currentEntry.xp,
                        currentLevel: currentEntry.level
                    });
                }
            } else {
                // New player
                changes.push({
                    username: currentEntry.username,
                    currentRank: currentEntry.rank,
                    previousRank: null,
                    xpGain: currentEntry.xp,
                    rankChange: 0,
                    currentXP: currentEntry.xp,
                    currentLevel: currentEntry.level,
                    isNew: true
                });
            }
        }

        return changes.length > 0 ? changes : null;
    }

    generateContextSummary(channelId) {
        const changes = this.getChanges(channelId);
        if (!changes) return null;

        const summary = changes.map(change => {
            if (change.isNew) {
                return `${change.username} joined at #${change.currentRank} (${change.currentXP} XP)`;
            }
            
            let desc = `${change.username}: #${change.currentRank}`;
            if (change.rankChange > 0) desc += ` (↑${change.rankChange})`;
            if (change.rankChange < 0) desc += ` (↓${Math.abs(change.rankChange)})`;
            if (change.xpGain > 0) desc += ` +${change.xpGain} XP`;
            
            return desc;
        }).join(', ');

        return `Changes: ${summary}`;
    }
}

module.exports = new LeaderboardHistory();