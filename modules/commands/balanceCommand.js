const BaseCommand = require('./baseCommand');
const currencyManager = require('../currencyManager');
const secureLogger = require('../secureLogger');

class BalanceCommand extends BaseCommand {
    constructor() {
        super('balance', {
            description: 'Check your coin balance and active boosts',
            category: 'currency'
        });
    }

    async execute(message) {
        secureLogger.info('Getting balance for user', {
            userId: message.author.id,
        });
        
        const balance = await currencyManager.getBalance(message.author.id);
        const boosts = await currencyManager.getBoostStatus(message.author.id);
        
        secureLogger.info('Retrieved balance', { balance });

        let response = `🪙 You have **${balance}** coins!`;

        if (boosts.dailyBoost || boosts.streakShields > 0) {
            response += "\n\n**Active Boosts:**";
            if (boosts.dailyBoost) {
                const expires = new Date(boosts.dailyBoostExpires).toLocaleDateString();
                response += `\n⚡ Daily Boost (2x daily bonus until ${expires})`;
            }
            if (boosts.streakShields > 0) {
                response += `\n🛡️ Streak Shield (${boosts.streakShields} protection${boosts.streakShields > 1 ? "s" : ""})`;
            }
        }

        message.reply(response);
    }
}

module.exports = BalanceCommand;