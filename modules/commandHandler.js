const characterManager = require('./characterManager');
const Pagination = require('./pagination');
const { EmbedBuilder } = require('discord.js');
const { getSystemPrompt, LLM_PROVIDER } = require('../config');
const Logger = require('./logger');

class CommandHandler {
    constructor() {
        // System prompt now comes from global config
    }

    getSystemPrompt() {
        return getSystemPrompt(LLM_PROVIDER);
    }

    handleHelpCommand(message) {
        const embed = new EmbedBuilder()
            .setTitle('🐄 Cowsay Bot Commands')
            .setColor(0x00AE86)
            .setThumbnail('https://cdn.discordapp.com/emojis/1234567890123456789.png') // cow emoji if available
            .addFields(
                {
                    name: '💬 Chat Commands',
                    value: '`!ask <question>` - Ask me anything\n`!chat <question>` - Start a conversation\n`!clear` - Clear your chat context',
                    inline: true
                },
                {
                    name: '🎭 Fun Commands', 
                    value: '`!cowsay <text>` - Make the cow speak\n`!joke` - Random dad joke\n`!rimshot` - Ba-dum-tss!',
                    inline: true
                },
                {
                    name: '🎮 Games & Currency',
                    value: '`!cowsay games` - View available games\n`!cowsay play <game>` - Start a game\n`!blackjack <mode> <bet>` - Quick blackjack\n`!cowsay join` - Join multiplayer lobbies\n`!cowsay balance` - Check your coins 🪙\n`!cowsay daily` - Claim daily bonus\n`!cowsay leaderboard` - Top coin holders',
                    inline: true
                },
                {
                    name: '🎯 Other Commands',
                    value: '`!characters` - View all ASCII characters\n`!clearleaderboard` - Clear leaderboard cache',
                    inline: false
                },
                {
                    name: '⚙️ Settings',
                    value: '`!toggleautoreply` - Toggle auto-reply to "cowsay" mentions\n`!toggleintent` - Cycle intent detection (Embedding/Regex/LLM)\n`!showconfig` - Show current configuration',
                    inline: false
                }
            )
            .setFooter({ 
                text: `${characterManager.getCharacters().length} ASCII characters available • Use !characters to browse them`,
                iconURL: message.author.displayAvatarURL()
            })
            .setTimestamp();
        
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