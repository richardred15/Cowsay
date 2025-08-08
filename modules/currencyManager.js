const database = require('./database');
const fs = require('fs');
const path = require('path');

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
            console.log('Error creating user currency:', error.message);
        }
    }

    async getBalance(userId) {
        try {
            await this.migrateFromFile();
            const [rows] = await database.query(
                'SELECT balance FROM user_currency WHERE user_id = ?',
                [userId]
            );
            
            console.log(`[CURRENCY] Query result for ${userId}:`, rows);
            
            if (!rows || rows.length === 0) {
                console.log(`[CURRENCY] No user found, creating with 1000 coins`);
                await this.createUser(userId);
                return 1000;
            }
            
            const balance = rows[0]?.balance || rows.balance;
            console.log(`[CURRENCY] Returning balance: ${balance}`);
            return balance;
        } catch (error) {
            console.log('Error getting balance:', error.message);
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
            console.log('Error adding balance:', error.message);
            return 1000;
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
            console.log('Error subtracting balance:', error.message);
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
            
            const bonus = Math.min(100, 1000 - player.balance);
            
            await database.query(
                'UPDATE user_currency SET balance = balance + ?, last_daily = ?, total_earned = total_earned + ? WHERE user_id = ?',
                [bonus, today, bonus, userId]
            );
            
            return { success: true, amount: bonus, newBalance: player.balance + bonus };
        } catch (error) {
            console.log('Error getting daily bonus:', error.message);
            return { success: false, message: "Error processing daily bonus." };
        }
    }

    async getLeaderboard(limit = 10) {
        try {
            const rows = await database.query(
                `SELECT user_id as userId, balance FROM user_currency ORDER BY balance DESC LIMIT ${limit}`
            );
            
            return rows || [];
        } catch (error) {
            console.log('Error getting leaderboard:', error.message);
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
                console.log(`No user found for ${userId}, creating new user`);
                await this.createUser(userId);
                const newRows = await database.query(
                    'SELECT balance, win_streak, last_win FROM user_currency WHERE user_id = ?',
                    [userId]
                );
                if (!newRows || newRows.length === 0) {
                    console.log(`Failed to create user ${userId}`);
                    return { awarded: 0, newBalance: 1000, streak: 0, firstWinBonus: false };
                }
            }
            
            const player = rows[0] || rows || { balance: 1000, win_streak: 0, last_win: null };
            const balanceBefore = player.balance;
            let finalAmount = amount;
            let newStreak = player.win_streak || 0;
            let firstWinBonus = false;
            
            console.log(`Awarding ${amount} coins to ${userId} for ${reason}`);
            
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
                
                console.log(`Final amount after bonuses: ${finalAmount} (streak: ${newStreak}, firstWin: ${firstWinBonus})`);
                
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
            console.log('Error awarding coins:', error.message, error.stack);
            return { awarded: 0, newBalance: 1000, streak: 0, firstWinBonus: false };
        }
    }
    
    async resetStreak(userId) {
        try {
            await database.query(
                'UPDATE user_currency SET win_streak = 0 WHERE user_id = ?',
                [userId]
            );
        } catch (error) {
            console.log('Error resetting streak:', error.message);
        }
    }
    
    async logTransaction(userId, amount, reason, balanceBefore, balanceAfter) {
        try {
            await database.query(
                'INSERT INTO coin_transactions (user_id, amount, reason, balance_before, balance_after) VALUES (?, ?, ?, ?, ?)',
                [userId, amount, reason, balanceBefore, balanceAfter]
            );
        } catch (error) {
            console.log('Error logging transaction:', error.message);
        }
    }
    
    async getTransactionHistory(userId, limit = 10) {
        try {
            const rows = await database.query(
                `SELECT amount, reason, balance_before, balance_after, created_at FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ${limit}`,
                [userId]
            );
            return rows || [];
        } catch (error) {
            console.log('Error getting transaction history:', error.message);
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
            console.log('Error spending coins:', error.message);
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
            console.log('Error adding coins:', error.message);
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
            console.log('Error removing coins:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    async getAllTransactions(limit = 50) {
        try {
            const rows = await database.query(
                `SELECT user_id, amount, reason, balance_before, balance_after, created_at FROM coin_transactions ORDER BY created_at DESC LIMIT ${limit}`
            );
            return rows || [];
        } catch (error) {
            console.log('Error getting all transactions:', error.message);
            return [];
        }
    }
}

module.exports = new CurrencyManager();