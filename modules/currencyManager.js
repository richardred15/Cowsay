const database = require('./database');
const fs = require('fs');
const path = require('path');
const SecurityUtils = require('./security');

class CurrencyManager {
    constructor() {
        this.migrated = false;
        this.migrateFromFile();
    }

    async migrateFromFile() {
        if (this.migrated) return;
        
        const oldDataPath = path.join(__dirname, '..', 'data', 'playerBalances.json');
        if (!fs.existsSync(oldDataPath)) {
            this.migrated = true;
            return;
        }
        
        try {
            const oldData = JSON.parse(fs.readFileSync(oldDataPath, 'utf8'));
            console.log('Migrating currency data to database...');
            
            for (const [userId, data] of Object.entries(oldData)) {
                await this.createUser(userId, data.balance || 1000, data.lastDaily);
            }
            
            // Rename old file to prevent re-migration
            fs.renameSync(oldDataPath, oldDataPath + '.migrated');
            console.log('Currency migration completed');
        } catch (error) {
            console.log('Migration error (continuing):', error.message);
        }
        
        this.migrated = true;
    }

    async createUser(userId, balance = 1000, lastDaily = null) {
        try {
            await database.query(
                'INSERT IGNORE INTO user_currency (user_id, balance, last_daily) VALUES (?, ?, ?)',
                [userId, balance, lastDaily]
            );
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error creating user currency', { error: error.message, userId });
        }
    }

    async getBalance(userId) {
        try {
            await this.migrateFromFile();
            const [rows] = await database.query(
                'SELECT balance FROM user_currency WHERE user_id = ?',
                [userId]
            );
            
            console.log(`[CURRENCY] Query result for ${SecurityUtils.sanitizeForLog(userId)}:`, rows);
            
            if (!rows || rows.length === 0) {
                console.log(`[CURRENCY] No user found, creating with 1000 coins`);
                await this.createUser(userId);
                return 1000;
            }
            
            const balance = rows[0]?.balance || rows.balance;
            console.log(`[CURRENCY] Returning balance: ${balance}`);
            return balance;
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error getting balance', { error: error.message, userId });
            return 1000;
        }
    }

    async addBalance(userId, amount) {
        try {
            await this.createUser(userId);
            await database.query(
                'UPDATE user_currency SET balance = balance + ?, total_earned = total_earned + ? WHERE user_id = ?',
                [amount, Math.max(0, amount), userId]
            );
            
            return await this.getBalance(userId);
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error adding balance', { error: error.message, userId });
            throw new Error('Failed to add balance: ' + error.message);
        }
    }

    async subtractBalance(userId, amount) {
        try {
            const balance = await this.getBalance(userId);
            if (balance < amount) return false;
            
            await database.query(
                'UPDATE user_currency SET balance = balance - ? WHERE user_id = ? AND balance >= ?',
                [amount, userId, amount]
            );
            
            return true;
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error subtracting balance', { error: error.message, userId });
            return false;
        }
    }

    async getDailyBonus(userId) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const [rows] = await database.query(
                'SELECT balance, last_daily FROM user_currency WHERE user_id = ?',
                [userId]
            );
            
            if (rows.length === 0) {
                await this.createUser(userId);
                return { success: false, message: "Welcome! You start with 1000 coins!" };
            }
            
            const player = rows[0];
            
            if (player.last_daily === today) {
                return { success: false, message: "You already claimed your daily bonus today!" };
            }
            
            if (player.balance >= 1000) {
                return { success: false, message: "You have enough coins! Daily bonus is for players with less than 1000 coins." };
            }
            
            let bonus = Math.min(100, 1000 - player.balance);
            const hasBoost = await this.hasDailyBoost(userId);
            
            if (hasBoost) {
                bonus *= 2;
            }
            
            await database.query(
                'UPDATE user_currency SET balance = balance + ?, last_daily = ?, total_earned = total_earned + ? WHERE user_id = ?',
                [bonus, today, bonus, userId]
            );
            
            return { success: true, amount: bonus, newBalance: player.balance + bonus, boosted: hasBoost };
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error getting daily bonus', { error: error.message, userId });
            return { success: false, message: "Error processing daily bonus." };
        }
    }

    async getLeaderboard(limit = 10) {
        try {
            const rows = await database.query(
                'SELECT user_id as userId, balance FROM user_currency WHERE balance > 0 ORDER BY balance DESC LIMIT ?',
                [parseInt(limit)]
            );
            
            return rows || [];
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error getting leaderboard', { error: error.message });
            return [];
        }
    }

    async awardCoins(userId, amount, reason = 'Game reward') {
        try {
            await this.createUser(userId);
            
            const rows = await database.query(
                'SELECT balance, win_streak, last_win FROM user_currency WHERE user_id = ?',
                [userId]
            );
            
            if (!rows || rows.length === 0) {
                const secureLogger = require('./secureLogger');
                secureLogger.info('Creating new user', { userId });
                await this.createUser(userId);
                const newRows = await database.query(
                    'SELECT balance, win_streak, last_win FROM user_currency WHERE user_id = ?',
                    [userId]
                );
                if (!newRows || newRows.length === 0) {
                    const secureLogger = require('./secureLogger');
                    secureLogger.error('Failed to create user', { userId });
                    return { awarded: 0, newBalance: 1000, streak: 0, firstWinBonus: false };
                }
            }
            
            const player = rows[0] || rows || { balance: 1000, win_streak: 0, last_win: null };
            const balanceBefore = player.balance;
            let finalAmount = amount;
            let newStreak = player.win_streak || 0;
            let firstWinBonus = false;
            
            const secureLogger = require('./secureLogger');
            secureLogger.info('Awarding coins to user', { amount, reason: SecurityUtils.sanitizeForLog(reason), userId });
            
            // Apply streak bonus for wins
            if (reason.includes('win')) {
                const today = new Date().toISOString().split('T')[0];
                
                if (player.last_win === today) {
                    // Multiple wins same day - increment streak
                    newStreak = newStreak + 1;
                } else {
                    // First win of day - reset streak
                    newStreak = 1;
                    firstWinBonus = true;
                    // First win of day bonus (2x)
                    finalAmount *= 2;
                }
                
                // Win streak bonus (max 50%)
                const streakBonus = Math.min(0.5, (newStreak - 1) * 0.1);
                finalAmount = Math.floor(finalAmount * (1 + streakBonus));
                
                const secureLogger = require('./secureLogger');
                secureLogger.info('Bonus calculation', { finalAmount, streak: newStreak, firstWin: firstWinBonus, userId });
                
                await database.query(
                    'UPDATE user_currency SET balance = balance + ?, win_streak = ?, last_win = ?, total_earned = total_earned + ? WHERE user_id = ?',
                    [finalAmount, newStreak, today, finalAmount, userId]
                );
            } else {
                await database.query(
                    'UPDATE user_currency SET balance = balance + ?, total_earned = total_earned + ? WHERE user_id = ?',
                    [finalAmount, finalAmount, userId]
                );
            }
            
            const newBalance = balanceBefore + finalAmount;
            
            // Log transaction
            await this.logTransaction(userId, finalAmount, reason, balanceBefore, newBalance);
            
            return {
                awarded: finalAmount,
                newBalance,
                streak: newStreak,
                firstWinBonus
            };
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error awarding coins', { error: error.message.substring(0, 100), userId });
            // Return safe defaults but don't fail silently
            throw new Error('Failed to award coins: ' + error.message);
        }
    }
    
    async resetStreak(userId) {
        try {
            await database.query(
                'UPDATE user_currency SET win_streak = 0 WHERE user_id = ?',
                [userId]
            );
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error resetting streak', { error: error.message, userId });
            throw error;
        }
    }
    
    async logTransaction(userId, amount, reason, balanceBefore, balanceAfter) {
        try {
            await database.query(
                'INSERT INTO coin_transactions (user_id, amount, reason, balance_before, balance_after) VALUES (?, ?, ?, ?, ?)',
                [userId, amount, reason, balanceBefore, balanceAfter]
            );
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error logging transaction', { error: error.message, userId });
        }
    }
    
    async getTransactionHistory(userId, limit = 10) {
        try {
            const rows = await database.query(
                'SELECT amount, reason, balance_before, balance_after, created_at FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
                [userId, parseInt(limit)]
            );
            return rows || [];
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error getting transaction history', { error: error.message, userId });
            return [];
        }
    }
    
    async spendCoins(userId, amount, reason = 'Purchase') {
        try {
            const balanceBefore = await this.getBalance(userId);
            if (balanceBefore < amount) {
                return false;
            }
            
            await database.query(
                'UPDATE user_currency SET balance = balance - ? WHERE user_id = ? AND balance >= ?',
                [amount, userId, amount]
            );
            
            const balanceAfter = balanceBefore - amount;
            await this.logTransaction(userId, -amount, reason, balanceBefore, balanceAfter);
            
            return true;
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error spending coins', { error: error.message, userId });
            return false;
        }
    }
    
    async adminAddCoins(userId, amount, reason = 'Admin grant') {
        try {
            await this.createUser(userId);
            const balanceBefore = await this.getBalance(userId);
            
            await database.query(
                'UPDATE user_currency SET balance = balance + ? WHERE user_id = ?',
                [amount, userId]
            );
            
            const balanceAfter = balanceBefore + amount;
            await this.logTransaction(userId, amount, reason, balanceBefore, balanceAfter);
            
            return { success: true, newBalance: balanceAfter };
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error adding coins', { error: error.message.substring(0, 100), userId });
            return { success: false, error: error.message };
        }
    }
    
    async adminRemoveCoins(userId, amount, reason = 'Admin removal') {
        try {
            const balanceBefore = await this.getBalance(userId);
            const finalAmount = Math.min(amount, balanceBefore); // Don't go negative
            
            await database.query(
                'UPDATE user_currency SET balance = balance - ? WHERE user_id = ?',
                [finalAmount, userId]
            );
            
            const balanceAfter = balanceBefore - finalAmount;
            await this.logTransaction(userId, -finalAmount, reason, balanceBefore, balanceAfter);
            
            return { success: true, newBalance: balanceAfter, actualAmount: finalAmount };
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error removing coins', { error: error.message.substring(0, 100), userId });
            return { success: false, error: error.message };
        }
    }
    
    async getAllTransactions(limit = 50) {
        try {
            const rows = await database.query(
                'SELECT user_id, amount, reason, balance_before, balance_after, created_at FROM coin_transactions ORDER BY created_at DESC LIMIT ?',
                [parseInt(limit)]
            );
            return rows || [];
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error getting all transactions', { error: error.message });
            return [];
        }
    }
    
    async activateDailyBoost(userId) {
        try {
            const expires = new Date();
            expires.setDate(expires.getDate() + 7); // 7 days from now
            
            await database.query(
                'UPDATE user_currency SET daily_boost_expires = ? WHERE user_id = ?',
                [expires.toISOString(), userId]
            );
            
            return true;
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error activating daily boost', { error: error.message, userId });
            return false;
        }
    }
    
    async hasDailyBoost(userId) {
        try {
            const rows = await database.query(
                'SELECT daily_boost_expires FROM user_currency WHERE user_id = ?',
                [userId]
            );
            
            if (!rows || rows.length === 0) return false;
            
            const expires = rows[0].daily_boost_expires;
            if (!expires) return false;
            
            return new Date(expires) > new Date();
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error checking daily boost', { error: error.message, userId });
            throw new Error('Failed to check daily boost: ' + error.message);
        }
    }
    
    async addStreakShield(userId, count = 1) {
        try {
            await database.query(
                'UPDATE user_currency SET streak_shield_count = streak_shield_count + ? WHERE user_id = ?',
                [count, userId]
            );
            
            return true;
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error adding streak shield', { error: error.message, userId });
            throw new Error('Failed to add streak shield: ' + error.message);
        }
    }
    
    async hasStreakShield(userId) {
        try {
            const rows = await database.query(
                'SELECT streak_shield_count FROM user_currency WHERE user_id = ?',
                [userId]
            );
            
            if (!rows || rows.length === 0) return false;
            
            return (rows[0].streak_shield_count || 0) > 0;
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error checking streak shield', { error: error.message, userId });
            return false;
        }
    }
    
    async recordLoss(userId) {
        try {
            const hasShield = await this.hasStreakShield(userId);
            if (hasShield) {
                await database.query(
                    'UPDATE user_currency SET streak_shield_count = streak_shield_count - 1 WHERE user_id = ?',
                    [userId]
                );
                return { shieldUsed: true };
            } else {
                await database.query(
                    'UPDATE user_currency SET win_streak = 0 WHERE user_id = ?',
                    [userId]
                );
                return { shieldUsed: false };
            }
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error recording loss', { error: error.message, userId });
            return { shieldUsed: false };
        }
    }
    
    async getBoostStatus(userId) {
        try {
            const rows = await database.query(
                'SELECT daily_boost_expires, streak_shield_count FROM user_currency WHERE user_id = ?',
                [userId]
            );
            
            if (!rows || rows.length === 0) {
                return { dailyBoost: false, streakShields: 0 };
            }
            
            const user = rows[0];
            const dailyBoost = user.daily_boost_expires && new Date(user.daily_boost_expires) > new Date();
            
            return {
                dailyBoost,
                dailyBoostExpires: user.daily_boost_expires,
                streakShields: user.streak_shield_count || 0
            };
        } catch (error) {
            const secureLogger = require('./secureLogger');
            secureLogger.error('Error getting boost status', { error: error.message, userId });
            return { dailyBoost: false, streakShields: 0 };
        }
    }
}

module.exports = new CurrencyManager();