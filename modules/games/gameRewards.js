const currencyManager = require('../currencyManager');

class GameRewards {
    constructor() {
        this.gameRewards = {
            blackjack: { win: 50, participation: 10, blackjack: 75 },
            roulette: { participation: 5 },
            pong: { win: 50, participation: 10, perfect: 75 },
            tictactoe: { win: 30, participation: 5 },
            battleship: { win: 100, participation: 15 },
            balatro: { base: 25, maxAnte: 150 }
        };
    }

    async awardGameReward(userId, gameType, outcome, additionalData = {}) {
        const rewards = this.gameRewards[gameType];
        if (!rewards) return null;

        let amount = 0;
        let reason = '';

        switch (outcome) {
            case 'win':
                amount = rewards.win || 0;
                reason = `${gameType} win`;
                break;
            case 'participation':
                amount = rewards.participation || 0;
                reason = `${gameType} participation`;
                break;
            case 'perfect':
                amount = rewards.perfect || rewards.win || 0;
                reason = `${gameType} perfect win`;
                break;
            case 'blackjack':
                amount = rewards.blackjack || 0;
                reason = `${gameType} blackjack`;
                break;
            case 'custom':
                amount = additionalData.amount || 0;
                reason = additionalData.reason || `${gameType} reward`;
                break;
        }

        if (amount > 0) {
            return await currencyManager.awardCoins(userId, amount, reason);
        }

        return null;
    }

    async handleGameEnd(gameData, results) {
        const rewards = {};

        // Award winners
        for (const winner of results.winners || []) {
            const reward = await this.awardGameReward(
                winner.userId, 
                gameData.type, 
                winner.outcome || 'win',
                winner.additionalData
            );
            if (reward) rewards[winner.userId] = reward;
        }

        // Award participation and handle losses
        for (const loser of results.losers || []) {
            // Award participation coins
            if (loser.giveParticipation !== false) {
                await this.awardGameReward(
                    loser.userId, 
                    gameData.type, 
                    'participation'
                );
            }
            
            // Record loss for streak mechanics
            await currencyManager.recordLoss(loser.userId, `${gameData.type} loss`);
        }

        // Handle ties
        for (const tied of results.ties || []) {
            await this.awardGameReward(
                tied.userId, 
                gameData.type, 
                'participation'
            );
        }

        return rewards;
    }

    async awardBlackjackPayout(userId, betAmount, outcome) {
        let payout = 0;
        
        switch (outcome) {
            case 'blackjack':
                payout = Math.floor(betAmount * 2.5); // 2.5x for blackjack
                break;
            case 'win':
                payout = betAmount * 2; // 2x for regular win
                break;
            case 'push':
                payout = betAmount; // Return bet
                break;
            case 'loss':
                payout = 0; // No payout
                break;
        }

        if (payout > 0) {
            await currencyManager.addBalance(userId, payout);
        }

        return payout;
    }

    async awardRoulettePayout(userId, winnings, reason = 'Roulette winnings') {
        if (winnings > 0) {
            await currencyManager.awardCoins(userId, winnings, reason);
        }
        return winnings;
    }
}

module.exports = new GameRewards();