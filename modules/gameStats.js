const database = require('./database');
const Logger = require('./logger');

class GameStats {
    constructor() {
        this.cache = new Map(); // Cache for frequently accessed stats
    }

    async recordOutcome(gameData) {
        try {
            // Check if players have opted out
            if (await this.hasOptedOut(gameData.player1_id) || 
                (gameData.player2_id && gameData.player2_id !== 'ai_player' && await this.hasOptedOut(gameData.player2_id))) {
                Logger.info('Skipping stats recording - player opted out');
                return;
            }

            const sql = `INSERT INTO game_outcomes 
                        (server_id, game_type, player1_id, player1_name, player2_id, player2_name, 
                         winner_id, game_duration, final_score, game_mode) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            await database.query(sql, [
                gameData.server_id,
                gameData.game_type,
                gameData.player1_id,
                gameData.player1_name,
                gameData.player2_id || null,
                gameData.player2_name || null,
                gameData.winner_id || null,
                gameData.game_duration || null,
                JSON.stringify(gameData.final_score || {}),
                gameData.game_mode || 'standard'
            ]);

            Logger.info(`Recorded ${gameData.game_type} outcome`, {
                server: gameData.server_id,
                winner: gameData.winner_id
            });
        } catch (error) {
            Logger.error('Failed to record game outcome', error.message);
        }
    }

    async hasOptedOut(userId) {
        if (!userId || userId === 'ai_player') return false;
        
        try {
            const sql = 'SELECT stats_opt_out FROM user_preferences WHERE user_id = ?';
            const rows = await database.query(sql, [userId]);
            return rows.length > 0 && rows[0].stats_opt_out;
        } catch (error) {
            Logger.error('Failed to check opt-out status', error.message);
            return false;
        }
    }

    async setOptOut(userId, optOut = true) {
        try {
            const sql = `INSERT INTO user_preferences (user_id, stats_opt_out) 
                        VALUES (?, ?) 
                        ON DUPLICATE KEY UPDATE 
                        stats_opt_out = VALUES(stats_opt_out), 
                        updated_at = CURRENT_TIMESTAMP`;
            
            await database.query(sql, [userId, optOut]);
            
            if (optOut) {
                // Delete existing stats for this user
                await database.query('DELETE FROM game_outcomes WHERE player1_id = ? OR player2_id = ?', [userId, userId]);
            }
            
            return true;
        } catch (error) {
            Logger.error('Failed to set opt-out preference', error.message);
            return false;
        }
    }

    async getPersonalStats(userId) {
        try {
            const sql = `SELECT game_type, 
                               COUNT(*) as games_played,
                               SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as wins,
                               SUM(CASE WHEN winner_id = 'tie' THEN 1 ELSE 0 END) as ties,
                               AVG(game_duration) as avg_duration
                        FROM game_outcomes 
                        WHERE (player1_id = ? OR player2_id = ?) AND winner_id IS NOT NULL
                        GROUP BY game_type`;
            
            const rows = await database.query(sql, [userId, userId, userId]);
            
            const stats = {};
            rows.forEach(row => {
                stats[row.game_type] = {
                    games_played: row.games_played,
                    wins: row.wins,
                    losses: row.games_played - row.wins - row.ties,
                    ties: row.ties,
                    win_rate: row.games_played > 0 ? (row.wins / row.games_played * 100).toFixed(1) : '0.0',
                    avg_duration: row.avg_duration ? Math.round(row.avg_duration) : null
                };
            });
            
            return stats;
        } catch (error) {
            Logger.error('Failed to get personal stats', error.message);
            return {};
        }
    }

    async getServerStats(serverId) {
        try {
            const sql = `SELECT game_type, 
                               COUNT(*) as total_games,
                               COUNT(DISTINCT player1_id) + COUNT(DISTINCT CASE WHEN player2_id != 'ai_player' THEN player2_id END) as unique_players,
                               AVG(game_duration) as avg_duration
                        FROM game_outcomes 
                        WHERE server_id = ?
                        GROUP BY game_type
                        ORDER BY total_games DESC`;
            
            const rows = await database.query(sql, [serverId]);
            return rows;
        } catch (error) {
            Logger.error('Failed to get server stats', error.message);
            return [];
        }
    }

    async getTopPlayers(serverId, limit = 10) {
        try {
            const sql = `SELECT player1_id as user_id, player1_name as username,
                               COUNT(*) as total_games,
                               SUM(CASE WHEN winner_id = player1_id THEN 1 ELSE 0 END) as wins
                        FROM game_outcomes 
                        WHERE server_id = ? AND player1_id != 'ai_player'
                        GROUP BY player1_id, player1_name
                        UNION ALL
                        SELECT player2_id as user_id, player2_name as username,
                               COUNT(*) as total_games,
                               SUM(CASE WHEN winner_id = player2_id THEN 1 ELSE 0 END) as wins
                        FROM game_outcomes 
                        WHERE server_id = ? AND player2_id IS NOT NULL AND player2_id != 'ai_player'
                        GROUP BY player2_id, player2_name`;
            
            const rows = await database.query(sql, [serverId, serverId]);
            
            // Aggregate results by user
            const playerStats = new Map();
            rows.forEach(row => {
                if (playerStats.has(row.user_id)) {
                    const existing = playerStats.get(row.user_id);
                    existing.total_games += row.total_games;
                    existing.wins += row.wins;
                } else {
                    playerStats.set(row.user_id, {
                        user_id: row.user_id,
                        username: row.username,
                        total_games: row.total_games,
                        wins: row.wins
                    });
                }
            });
            
            // Sort by wins and return top players
            return Array.from(playerStats.values())
                .map(player => ({
                    ...player,
                    win_rate: player.total_games > 0 ? (player.wins / player.total_games * 100).toFixed(1) : '0.0'
                }))
                .sort((a, b) => b.wins - a.wins)
                .slice(0, limit);
        } catch (error) {
            Logger.error('Failed to get top players', error.message);
            return [];
        }
    }
}

module.exports = new GameStats();