const Logger = require('./logger');
const CommandRegistry = require('./CommandRegistry');
const SecurityUtils = require('./security');
const rateLimiter = require('./rateLimiter');

class MessageHandler {
    constructor() {
        this.setupCommands();
    }

    setupCommands() {
        // Currency commands
        CommandRegistry.register('balance', this.handleBalance);
        CommandRegistry.register('daily', this.handleDaily);
        CommandRegistry.register('leaderboard', this.handleLeaderboard);
        CommandRegistry.register('transactions', this.handleTransactions);
        CommandRegistry.register('shop', this.handleShop);
        CommandRegistry.register('inventory', this.handleInventory);
        
        // Game commands
        CommandRegistry.register('games', this.handleGames);
        CommandRegistry.register('join', this.handleJoin);
        
        // Admin commands
        CommandRegistry.register('admin', this.handleAdmin, { permissions: 'admin' });
        
        // Character commands
        CommandRegistry.register('cowsay', this.handleCowsay);
        
        // Utility commands
        CommandRegistry.register('help', this.handleHelp);
        CommandRegistry.register('stats', this.handleStats);
    }

    async handleMessage(message, client) {
        // Skip bot messages except for specific handling
        if (message.author.bot && message.author.id !== client.user.id) {
            return this.handleBotMessage(message, client);
        }

        // Add to context
        const contextManager = require('./contextManager');
        contextManager.addMessage(message);

        // Check rate limits
        const isCommand = message.content.startsWith('!') || message.mentions.has(client.user);
        if (isCommand && !rateLimiter.checkLimits(message.author.id)) {
            message.reply('⚠️ Rate limit exceeded. Please wait a moment before trying again.');
            return;
        }

        // Handle commands
        if (message.content.startsWith('!cowsay ')) {
            const args = message.content.slice(9).trim().split(' ');
            const subCommand = args[0];
            const commandArgs = args.slice(1);
            
            if (await CommandRegistry.execute(message, subCommand, commandArgs)) {
                return;
            }
            
            // Fallback to cowsay text
            await this.handleCowsay(message, args);
            return;
        }

        // Handle character commands
        const characterManager = require('./characterManager');
        for (const char of characterManager.getCharacters()) {
            const cleanName = char.replace(/[^a-zA-Z0-9]/g, '');
            const command = `!${cleanName}say`;
            if (message.content.startsWith(command)) {
                await this.handleCharacterCommand(message, char, command);
                return;
            }
        }

        // Handle other message types
        await this.handleSpecialMessages(message, client);
    }

    async handleBalance(message) {
        const currencyManager = require('./currencyManager');
        const balance = await currencyManager.getBalance(message.author.id);
        const boosts = await currencyManager.getBoostStatus(message.author.id);
        
        let response = `🪙 You have **${balance}** coins!`;
        
        if (boosts.dailyBoost || boosts.streakShields > 0) {
            response += '\n\n**Active Boosts:**';
            if (boosts.dailyBoost) {
                const expires = new Date(boosts.dailyBoostExpires).toLocaleDateString();
                response += `\n⚡ Daily Boost (2x daily bonus until ${expires})`;
            }
            if (boosts.streakShields > 0) {
                response += `\n🛡️ Streak Shield (${boosts.streakShields} protection${boosts.streakShields > 1 ? 's' : ''})`;
            }
        }
        
        message.reply(response);
    }

    async handleDaily(message) {
        const currencyManager = require('./currencyManager');
        const result = await currencyManager.getDailyBonus(message.author.id);
        
        if (result.success) {
            const boostText = result.boosted ? ' (2x Daily Boost applied!)' : '';
            message.reply(`🎁 Daily bonus claimed! +${result.amount} coins${boostText} New balance: **${result.newBalance}** coins 🪙`);
        } else {
            message.reply(`❌ ${result.message}`);
        }
    }

    async handleCowsay(message, args) {
        const text = args.join(' ');
        const validation = SecurityUtils.validateInput(text, 500);

        if (!validation.valid) {
            message.reply(`Error: ${validation.error}`);
            return;
        }

        if (!text) {
            message.reply('Please provide text for the cow to say! Usage: `!cowsay Hello World`');
            return;
        }

        try {
            const characterManager = require('./characterManager');
            const cow = await characterManager.generateAscii('cow', text, message.author.id);
            const escaped = cow.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
            const formatted = `\`\`\`\n${escaped}\n\`\`\``;
            
            if (formatted.length > 2000) {
                const maxContent = 2000 - 8;
                const truncated = escaped.slice(0, maxContent - 20) + '\n[... ASCII too long ...]';
                message.reply(`\`\`\`\n${truncated}\n\`\`\``);
            } else {
                message.reply(formatted);
            }
        } catch (error) {
            Logger.error('Cowsay generation error', error.message);
            message.reply('Sorry, there was an error generating the cow message.');
        }
    }

    async handleCharacterCommand(message, char, command) {
        const text = message.content.slice(command.length).trim();
        if (!text) {
            message.reply(`Please provide text! Usage: \`${command} Hello World\``);
            return;
        }

        const validation = SecurityUtils.validateInput(text, 500);
        if (!validation.valid) {
            message.reply(`Error: ${validation.error}`);
            return;
        }

        try {
            const characterManager = require('./characterManager');
            const result = await characterManager.generateAscii(char, text, message.author.id);
            
            if (result.includes('🔒')) {
                message.reply(result);
                return;
            }
            
            const escaped = result.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
            const formatted = `\`\`\`\n${escaped}\n\`\`\``;
            
            if (formatted.length > 2000) {
                const maxContent = 2000 - 8;
                const truncated = escaped.slice(0, maxContent - 20) + '\n[... ASCII too long ...]';
                message.reply(`\`\`\`\n${truncated}\n\`\`\``);
            } else {
                message.reply(formatted);
            }
        } catch (error) {
            Logger.error(`Character generation error for ${char}`, error.message);
            message.reply(`Sorry, ${char} character is not available.`);
        }
    }

    async handleBotMessage(message, client) {
        const leaderboardHandler = require('./leaderboardHandler');
        const rivalManager = require('./rivalManager');
        
        if (await leaderboardHandler.handleMessage(message)) {
            return;
        }
        
        const isRival = await rivalManager.isRival(message.guild?.id, message.author.id);
        if (isRival) {
            const responseCollapse = require('./responseCollapse');
            responseCollapse.shouldCollapse(message, client.user.id);
        }
    }

    async handleSpecialMessages(message, client) {
        // Handle mentions, auto-reply, intent detection, etc.
        const autoReply = require('./autoReply');
        const responseCollapse = require('./responseCollapse');
        
        if (message.mentions.has(client.user)) {
            responseCollapse.shouldCollapse(message, client.user.id);
            return;
        }

        if (await autoReply.shouldReply(message, client.user.id)) {
            responseCollapse.shouldCollapse(message, client.user.id);
            return;
        }
    }
}

module.exports = new MessageHandler();