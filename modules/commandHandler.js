const characterManager = require('./characterManager');
const Pagination = require('./pagination');
const { EmbedBuilder } = require('discord.js');
const { getSystemPrompt, LLM_PROVIDER } = require('../config');
const Logger = require('./logger');
const discordPermissions = require('./discordPermissions');
const contextManager = require('./contextManager');

class CommandHandler {
    constructor() {
        // System prompt now comes from global config
    }

    async getSystemPrompt(serverId = null) {
        return await getSystemPrompt(LLM_PROVIDER, serverId);
    }

    async handleHelpCommand(message) {
        const userLevel = await discordPermissions.getUserPermissionLevel(message);
        const isAdmin = userLevel === 'admin' || userLevel === 'owner';
        const isModerator = isAdmin || userLevel === 'moderator';
        
        // Create help categories
        const categories = [
            {
                title: '💬 Chat Commands',
                commands: [
                    '`!ask <question>` - Ask me anything',
                    '`!chat <question>` - Start a conversation thread',
                    '`!clear` - Clear your chat context'
                ]
            },
            {
                title: '🎭 Fun Commands',
                commands: [
                    '`!cowsay <text>` - Make the cow speak',
                    '`!<character>say <text>` - Use other ASCII characters',
                    '`!characters` - Browse all ASCII characters',
                    '`!joke` - Random dad joke',
                    '`!rimshot` - Ba-dum-tss!'
                ]
            },
            {
                title: '🎮 Games',
                commands: [
                    '`!cowsay games` - View available games',
                    '`!cowsay play <game>` - Start a game',
                    '`!cowsay join` - Join multiplayer lobbies',
                    '`/battleship` - Battleship (slash command)',
                    '`/balatro` - Balatro poker (slash command)',
                    '`!blackjack <mode> <bet>` - Quick blackjack'
                ]
            },
            {
                title: '🪙 Currency & Shop',
                commands: [
                    '`!cowsay balance` - Check your coins & active boosts',
                    '`!cowsay daily` - Claim daily bonus',
                    '`!cowsay shop` - Browse premium characters & boosts',
                    '`!cowsay leaderboard` - Top coin holders',
                    '`!cowsay transactions` - View transaction history',
                    '`!cowsay help coins` - Learn about earning coins',
                    '`!cowsay help shop` - Learn about the shop system'
                ]
            },
            {
                title: '🎒 Inventory & Gifts',
                commands: [
                    '`!cowsay inventory` - View your complete inventory',
                    '`!cowsay inventory characters` - View owned characters only',
                    '`!cowsay inventory boosts` - View owned boosts only',
                    '`!cowsay gift @user <item> [message]` - Send a gift',
                    '`!cowsay gifts sent` - View gifts you\'ve sent',
                    '`!cowsay gifts received` - View gifts you\'ve received',
                    '`!cowsay wishlist add <item>` - Add item to wishlist',
                    '`!cowsay wishlist remove <item>` - Remove from wishlist',
                    '`!cowsay wishlist @user` - View someone\'s wishlist'
                ]
            },
            {
                title: '📊 Statistics',
                commands: [
                    '`!cowsay stats` - Your personal game statistics',
                    '`!cowsay stats @user` - View someone else\'s stats',
                    '`!cowsay optstats out/in` - Opt out/in of statistics tracking',
                    '`!cowsay myperms` - Check your permission level'
                ]
            }
        ];
        
        if (isModerator) {
            categories.push({
                title: '📊 Moderator Commands',
                commands: [
                    '`!cowsay serverstats` - Server game statistics',
                    '`!cowsay topplayers` - Server leaderboard',
                    '`!clearleaderboard` - Clear leaderboard cache'
                ]
            });
        }
        
        if (isAdmin) {
            categories.push(
                {
                    title: '🔥 Rivals System (Admin)',
                    commands: [
                        '`!cowsay rival add @user <description>` - Add a rival bot',
                        '`!cowsay rival remove @user` - Remove a rival',
                        '`!cowsay rival list` - Show all configured rivals',
                        '`!cowsay help rivals` - Learn about rivals system'
                    ]
                },
                {
                    title: '⚙️ Server Settings (Admin)',
                    commands: [
                        '`!toggleautoreply` - Toggle auto-reply to "cowsay" mentions',
                        '`!toggleintent` - Cycle intent detection modes',
                        '`!showconfig` - Show current server configuration'
                    ]
                },
                {
                    title: '🔐 Permissions (Admin)',
                    commands: [
                        '`!cowsay perms setrole <level> @role` - Map Discord role to permission level',
                        '`!cowsay perms listroles` - Show role mappings',
                        '`!cowsay perms check @user` - Check user permission level'
                    ]
                },
                {
                    title: '🔧 Admin Tools',
                    commands: [
                        '`!cowsay admin help` - View detailed admin commands',
                        '`!cowsay admin addcoins @user <amount>` - Add coins to user',
                        '`!cowsay admin removecoins @user <amount>` - Remove coins',
                        '`!cowsay admin balance @user` - Check any user\'s balance',
                        '`!cowsay admin transactions` - View all transactions'
                    ]
                }
            );
        }
        
        // Create paginated help
        const pages = categories.map(category => {
            const embed = new EmbedBuilder()
                .setTitle('🐄 Cowsay Bot Help')
                .setColor(0x00AE86)
                .addFields({
                    name: category.title,
                    value: category.commands.join('\n'),
                    inline: false
                })
                .setFooter({ 
                    text: `${characterManager.getCharacters().length} ASCII characters available • Your permission level: ${userLevel}`,
                    iconURL: message.author.displayAvatarURL()
                })
                .setTimestamp();
            
            return embed;
        });
        
        await Pagination.createEmbedPagination(message, pages, 'Help Categories');
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