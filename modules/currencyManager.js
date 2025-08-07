const fs = require('fs');
const path = require('path');

class CurrencyManager {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data', 'playerBalances.json');
        this.balances = this.loadBalances();
    }

    loadBalances() {
        try {
            if (fs.existsSync(this.dataPath)) {
                return JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
            }
        } catch (error) {
            console.log('Error loading balances, starting fresh');
        }
        return {};
    }

    saveBalances() {
        try {
            const dir = path.dirname(this.dataPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.dataPath, JSON.stringify(this.balances, null, 2));
        } catch (error) {
            console.log('Error saving balances:', error);
        }
    }

    getBalance(userId) {
        if (!this.balances[userId]) {
            this.balances[userId] = { balance: 1000, lastDaily: null };
            this.saveBalances();
        }
        return this.balances[userId].balance;
    }

    addBalance(userId, amount) {
        if (!this.balances[userId]) {
            this.balances[userId] = { balance: 1000, lastDaily: null };
        }
        this.balances[userId].balance += amount;
        this.saveBalances();
        return this.balances[userId].balance;
    }

    subtractBalance(userId, amount) {
        const balance = this.getBalance(userId);
        if (balance < amount) return false;
        
        this.balances[userId].balance -= amount;
        this.saveBalances();
        return true;
    }

    getDailyBonus(userId) {
        const today = new Date().toDateString();
        const player = this.balances[userId];
        
        if (!player) {
            this.balances[userId] = { balance: 1000, lastDaily: today };
            this.saveBalances();
            return { success: false, message: "Welcome! You start with 1000 coins!" };
        }

        if (player.lastDaily === today) {
            return { success: false, message: "You already claimed your daily bonus today!" };
        }

        if (player.balance >= 1000) {
            return { success: false, message: "You have enough coins! Daily bonus is for players with less than 1000 coins." };
        }

        const bonus = Math.min(100, 1000 - player.balance);
        player.balance += bonus;
        player.lastDaily = today;
        this.saveBalances();
        
        return { success: true, amount: bonus, newBalance: player.balance };
    }

    getLeaderboard(limit = 10) {
        return Object.entries(this.balances)
            .sort(([,a], [,b]) => b.balance - a.balance)
            .slice(0, limit)
            .map(([userId, data]) => ({ userId, balance: data.balance }));
    }
}

module.exports = new CurrencyManager();