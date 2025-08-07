const tictactoe = require('./games/tictactoe');
const blackjack = require('./games/blackjack');
const battleship = require('./games/battleship');
const balatro = require('./games/balatro');

class GameManager {
    constructor() {
        this.activeGames = new Map();
        this.games = { tictactoe, blackjack, battleship, balatro };
    }

    getAvailableGames() {
        return ["tictactoe", "blackjack", "battleship", "balatro"];
    }

    createGamesEmbed() {
        const { EmbedBuilder } = require('discord.js');
        return new EmbedBuilder()
            .setTitle('🎮 Available Games')
            .setColor(0x00AE86)
            .addFields(
                {
                    name: '🃏 Blackjack',
                    value: '`!cowsay play blackjack` - Interactive setup\n`!cowsay play blackjack single <bet>` - Quick single player\n`!cowsay play blackjack player <bet>` - Quick multiplayer (AI dealer)\n`!cowsay play blackjack dealer <bet>` - Quick multiplayer (you deal)',
                    inline: false
                },
                {
                    name: '⭕ Tic-Tac-Toe',
                    value: '`!cowsay play tictactoe` - Start a game\n`!cowsay play tictactoe @user` - Challenge someone',
                    inline: false
                },
                {
                    name: '🚢 Battleship',
                    value: '`/battleship` - Create a new battleship game',
                    inline: false
                },
                {
                    name: '🃏 Balatro',
                    value: '`/balatro` - Start a poker-based scoring game',
                    inline: false
                },
                {
                    name: '🎯 Other Commands',
                    value: '`!cowsay join` - Join multiplayer lobbies\n`!cowsay help blackjack` - Blackjack rules & tips',
                    inline: false
                }
            )
            .setFooter({ text: 'Use coins to bet in blackjack! Check !cowsay balance' });
    }

    createBlackjackHelpEmbed() {
        const { EmbedBuilder } = require('discord.js');
        return new EmbedBuilder()
            .setTitle('🃏 Blackjack Help')
            .setColor(0x00AE86)
            .setDescription('Get as close to 21 as possible without going over. Beat the dealer to win!')
            .addFields(
                {
                    name: '🎯 Quick Commands',
                    value: '`!cowsay play blackjack single 50` - Single player, 50 coin bet\n`!cowsay play blackjack player 100` - Multiplayer (AI dealer)\n`!cowsay play blackjack dealer 25` - Multiplayer (you deal)',
                    inline: false
                },
                {
                    name: '🎮 How to Play',
                    value: '• **Hit** - Take another card\n• **Stand** - Keep your current total\n• **Double Down** - Double bet, take one card, then stand\n• **Blackjack** - 21 with first 2 cards (pays 2.5x)',
                    inline: false
                },
                {
                    name: '💰 Payouts',
                    value: '• **Win**: 2x your bet\n• **Blackjack**: 2.5x your bet\n• **Push** (tie): Get your bet back\n• **Lose**: Lose your bet',
                    inline: false
                },
                {
                    name: '🎲 Card Values',
                    value: '• **Ace**: 1 or 11 (whichever is better)\n• **Face cards**: 10\n• **Number cards**: Face value',
                    inline: false
                }
            )
            .setFooter({ text: 'Minimum bet: 10 coins • Use !cowsay daily for free coins!' });
    }

    async startGame(message, gameName, opponent = null) {
        const game = this.games[gameName];
        if (!game) return false;
        
        const result = await game.start(message, opponent);
        if (result) {
            this.activeGames.set(result.gameKey, result.gameData);
            return true;
        }
        return false;
    }

    async startBlackjackGame(message, mode, betAmount) {
        const game = this.games.blackjack;
        if (!game) return false;

        // Clean up any existing setup games for this user
        const existingSetupKey = `bj_setup_${message.author.id}`;
        this.activeGames.delete(existingSetupKey);

        // Create setup game data
        const setupKey = `bj_setup_${message.author.id}`;
        const gameData = { type: "blackjack", phase: "setup", creator: message.author.id, mode };
        this.activeGames.set(setupKey, gameData);

        // Create fake interaction for consistent flow
        const fakeInteraction = {
            user: message.author,
            channel: message.channel,
            reply: async (options) => message.reply(options),
            update: async (options) => message.reply(options)
        };

        if (mode === 'single') {
            return await game.startSinglePlayer(fakeInteraction, this, betAmount);
        } else {
            const isDealer = mode === 'dealer';
            return await game.showWaitTimeSelection(fakeInteraction, isDealer, betAmount);
        }
    }

    async handleJoinCommand(message) {
        const channelId = message.channel.id;
        if (blackjack.lobbies.has(channelId)) {
            const fakeInteraction = {
                customId: "bj_join",
                user: message.author,
                channel: message.channel,
                reply: async (options) => message.reply(options),
                update: async (options) => {
                    const msg = await message.channel.messages.fetch({ limit: 10 });
                    const lastBotMsg = msg.find(m => m.author.bot && m.embeds.length > 0);
                    if (lastBotMsg) await lastBotMsg.edit(options);
                }
            };
            return await blackjack.joinLobby(fakeInteraction);
        }
        message.reply("No active game lobby to join!");
        return false;
    }

    async handleButtonInteraction(interaction) {
        const userId = interaction.user.id;
        
        // Check for battleship interactions first
        if (interaction.customId.startsWith('bs_')) {
            return await battleship.handleInteraction(interaction, null, null, this);
        }
        
        // Check for balatro interactions
        if (interaction.customId.startsWith('bal_')) {
            return await balatro.handleInteraction(interaction, null, null, this);
        }
        
        // Check for blackjack lobby interactions first (join/cancel/start)
        if (interaction.customId === 'bj_join' || interaction.customId === 'bj_cancel' || interaction.customId === 'bj_start' || interaction.customId.startsWith('bj_join_bet_')) {
            return await blackjack.handleInteraction(interaction, null, null, this);
        }
        
        // Check for view hand button (should work for any player)
        if (interaction.customId === 'bj_game_view') {
            // Find the blackjack game this user is part of
            for (const [key, data] of this.activeGames) {
                if (data && data.type === 'blackjack' && data.players && 
                    Array.isArray(data.players) && data.players.some(p => p.id === userId)) {
                    return await blackjack.handleViewHand(interaction, data, key, this);
                }
            }
            await interaction.reply({ content: "You're not in any active blackjack game!", flags: require('discord.js').MessageFlags.Ephemeral });
            return true;
        }
        
        let gameData = null;
        let gameKey = null;

        // Create user-to-game mapping for faster lookups
        if (!this.userGameMap) {
            this.userGameMap = new Map();
        }
        
        // Check cache first
        const cachedGameKey = this.userGameMap.get(userId);
        if (cachedGameKey && this.activeGames.has(cachedGameKey)) {
            gameData = this.activeGames.get(cachedGameKey);
            gameKey = cachedGameKey;
        } else {
            // Find the game this user is part of and update cache
            for (const [key, data] of this.activeGames) {
                if (data && data.type === 'blackjack') {
                    // For blackjack setup phase or if user is in players array
                    if ((data.phase === 'setup' && data.creator === userId) || 
                        (data.players && Array.isArray(data.players) && data.players.some(p => p.id === userId))) {
                        gameData = data;
                        gameKey = key;
                        this.userGameMap.set(userId, key);
                        break;
                    }
                } else if (key.includes(userId)) {
                    // For other games, use existing logic
                    gameData = data;
                    gameKey = key;
                    this.userGameMap.set(userId, key);
                    break;
                }
            }
        }
        
        if (!gameData) {
            console.log(`DEBUG: No game found for user ${userId}. Active games:`, Array.from(this.activeGames.keys()));
            await interaction.reply({ content: "No active game found!", flags: require('discord.js').MessageFlags.Ephemeral });
            return true;
        }

        // Route to appropriate game handler
        const game = this.games[gameData.type];
        if (game) {
            return await game.handleInteraction(interaction, gameData, gameKey, this);
        }

        return false;
    }
}

module.exports = new GameManager();
