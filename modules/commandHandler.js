const characterManager = require('./characterManager');
const Pagination = require('./pagination');
const { EmbedBuilder } = require('discord.js');
const { getSystemPrompt, LLM_PROVIDER } = require('../config');
const Logger = require('./logger');

class CommandHandler {
    constructor() {
        // System prompt now comes from global config
    }

    async getSystemPrompt(serverId = null) {
        return await getSystemPrompt(LLM_PROVIDER, serverId);
    }

    async handleHelpCommand(message) {
        const discordPermissions = require('./discordPermissions');
        const userLevel = await discordPermissions.getUserPermissionLevel(message);
        const isAdmin = userLevel === 'admin' || userLevel === 'owner';
        const isModerator = isAdmin || userLevel === 'moderator';
        
        const embed = new EmbedBuilder()
            .setTitle('🐄 Cowsay Bot Commands')
            .setColor(0x00AE86)
            .addFields(
                {
                    name: '💬 Chat Commands',
                    value: '`!ask <question>` - Ask me anything\n`!chat <question>` - Start a conversation\n`!clear` - Clear your chat context',
                    inline: true
                },
                {
                    name: '🎭 Fun Commands', 
                    value: '`!cowsay <text>` - Make the cow speak\n`!<character>say <text>` - Use other ASCII characters\n`!joke` - Random dad joke\n`!rimshot` - Ba-dum-tss!',
                    inline: true
                },
                {
                    name: '🎮 Games',
                    value: '`!cowsay games` - View available games\n`!cowsay play <game>` - Start a game\n`/battleship` - Battleship (slash command)\n`/balatro` - Balatro poker (slash command)\n`!blackjack <mode> <bet>` - Quick blackjack',
                    inline: true
                },
                {
                    name: '🪙 Currency System',
                    value: '`!cowsay balance` - Check your coins\n`!cowsay daily` - Claim daily bonus\n`!cowsay leaderboard` - Top coin holders\n`!cowsay transactions` - View transaction history\n`!cowsay shop` - Browse premium items\n`!cowsay help coins` - Learn about earning coins',
                    inline: true
                },
                {
                    name: '🎯 Other Commands',
                    value: '`!characters` - View all ASCII characters\n`!cowsay help rivals` - Learn about the rivals system\n`!cowsay stats` - Your game statistics\n`!cowsay myperms` - Check your permission level',
                    inline: false
                },
                {
                    name: '🛒 Shop System',
                    value: '`!cowsay shop` - Browse premium characters & boosts\n`!cowsay help shop` - Learn about the shop system\nClick buttons in shop to purchase items!',
                    inline: false
                }
            );
        
        if (isModerator) {
            embed.addFields({
                name: '📊 Moderator Commands',
                value: '`!cowsay serverstats` - Server statistics\n`!cowsay topplayers` - Server leaderboard\n`!clearleaderboard` - Clear leaderboard cache',
                inline: false
            });
        }
        
        if (isAdmin) {
            embed.addFields(
                {
                    name: '🔥 Rivals (Admin)',
                    value: '`!cowsay rival add @user description` - Add a rival\n`!cowsay rival remove @user` - Remove a rival\n`!cowsay rival list` - Show all rivals',
                    inline: false
                },
                {
                    name: '⚙️ Settings (Admin)',
                    value: '`!toggleautoreply` - Toggle auto-reply\n`!toggleintent` - Cycle intent detection\n`!showconfig` - Show configuration',
                    inline: false
                },
                {
                    name: '🔐 Permissions (Admin)',
                    value: '`!cowsay perms setrole <level> @role` - Map role\n`!cowsay perms listroles` - Show mappings\n`!cowsay perms check @user` - Check permissions',
                    inline: false
                },
                {
                    name: '🔧 Admin Commands',
                    value: '`!cowsay admin help` - View all admin commands\n`!cowsay admin addcoins @user <amount>` - Add coins\n`!cowsay admin transactions` - View all transactions',
                    inline: false
                }
            );
        }
        
        embed.setFooter({ 
            text: `${characterManager.getCharacters().length} ASCII characters available • Use !characters to browse them`,
            iconURL: message.author.displayAvatarURL()
        }).setTimestamp();
        
        message.reply({ embeds: [embed] });
        return true;
    }

    async handleCharactersCommand(message) {
        try {
            const characters = characterManager.getCharacters();
            const commands = characters.map(char => {
                const cleanName = char.replace(/[^a-zA-Z0-9]/g, "");
                return `!${cleanName}say`;
            });
            
            await Pagination.create(message, "Character Commands", commands, 12);
            return true;
        } catch (error) {
            Logger.error('Characters command error', error.message);
            message.reply('Sorry, there was an error loading the characters list.');
            return false;
        }
    }

    handleClearCommand(message) {
        const contextManager = require('./contextManager');
        const channelId = message.channel.id;
        
        if (message.channel.isThread()) {
            contextManager.threadContexts.delete(channelId);
            message.reply("Thread context has been cleared! 🧙");
        } else {
            contextManager.channelContexts.delete(channelId);
            message.reply("Channel context has been cleared! 🧙");
        }
        
        return true;
    }

    isHelpCommand(content) {
        return content === "!cowsay help";
    }

    isClearCommand(content) {
        return content === "!clear";
    }

    isCharactersCommand(content) {
        return content === "!characters";
    }
}

module.exports = new CommandHandler();