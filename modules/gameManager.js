const tictactoe = require('./games/tictactoe');
const blackjack = require('./games/blackjack');
const battleship = require('./games/battleship');
const balatro = require('./games/balatro');
const pong = require('./games/pong');
const roulette = require('./games/roulette');
const gameUI = require('./games/gameUI');
const gameRewards = require('./games/gameRewards');
const BaseGame = require('./games/baseGame');

class GameManager {
    constructor() {
        this.activeGames = new Map();
        this.games = { tictactoe, blackjack, battleship, balatro, pong, roulette, hangman: require('./games/hangman'), baccarat: require('./games/baccarat'), unoexpress: require('./games/unoexpress') };
        this.client = null;
    }

    setClient(client) {
        this.client = client;
    }

    deleteGame(gameKey) {
        const gameData = this.activeGames.get(gameKey);
        if (gameData && gameData.type === 'blackjack' && gameData.ephemeralInteractions) {
            // Clean up all ephemeral timeouts for blackjack games
            Object.keys(gameData.ephemeralInteractions).forEach(userId => {
                this.games.blackjack.cleanupEphemeralTimeouts(userId, gameData);
            });
        }
        return this.activeGames.delete(gameKey);
    }

    getAvailableGames() {
        return Object.keys(this.games);
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
                    value: '`/battleship` - Create a new battleship game\n• **Slash command** - Real-time naval combat\n• Player 1 gets private link, Player 2 uses button',
                    inline: false
                },
                {
                    name: '🃏 Balatro',
                    value: '`/balatro` - Start a poker-based scoring game\n• **Slash command** - Single player poker scoring\n• Build hands to beat blind requirements\n• Persistent across bot restarts',
                    inline: false
                },
                {
                    name: '🏓 Pong',
                    value: '`!cowsay play pong` - Classic paddle game\n`!cowsay play pong ai` - Single player vs AI\n• **Multiplayer**: Use "Join Game" or "Play vs AI" buttons\n• Shared Up/Down controls for paddles\n• First to 5 points wins (1 FPS gameplay)',
                    inline: false
                },
                {
                    name: '🎰 Roulette',
                    value: '`!cowsay play roulette` - European roulette wheel\n• **Multiple bet types**: Red/Black, Even/Odd, Numbers\n• **60-second betting phase** with animated wheel\n• **Payouts**: 1:1 for outside bets, 35:1 for numbers',
                    inline: false
                },
                {
                    name: '🎯 Hangman',
                    value: '`!hangman` - Guess the word letter by letter\n• **Betting system**: Choose your wager\n• **6 wrong guesses** maximum\n• **Perfect bonus**: 3x payout for no wrong guesses',
                    inline: false
                },
                {
                    name: '🎰 Baccarat',
                    value: '`!baccarat` - Classic casino card game\n• **60-second betting phase**: Player/Banker/Tie\n• **Automatic dealing**: No decisions after betting\n• **Multiple payouts**: 2:1, 1.95:1, 8:1',
                    inline: false
                },
                {
                    name: '🎯 UNO Express',
                    value: '`!unoexpress` - Fast-paced card game\n• **2-6 players**: Multiplayer lobby system\n• **7 cards to start**: Faster than regular UNO\n• **Private hands**: DM system for card management',
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
        
        // Clean up abandoned setups older than 5 minutes
        this.cleanupAbandonedSetups();

        // Create setup game data with timeout
        const setupKey = `bj_setup_${message.author.id}`;
        const gameData = { 
            type: "blackjack", 
            phase: "setup", 
            creator: message.author.id, 
            mode,
            createdAt: Date.now()
        };
        this.activeGames.set(setupKey, gameData);
        
        // Set cleanup timeout for this setup
        setTimeout(() => {
            if (this.activeGames.has(setupKey)) {
                const data = this.activeGames.get(setupKey);
                if (data && data.phase === 'setup') {
                    this.activeGames.delete(setupKey);
                }
            }
        }, 300000); // 5 minutes

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
                    try {
                        const msg = await message.channel.messages.fetch({ limit: 10 });
                        const lastBotMsg = msg.find(m => m.author.bot && m.embeds.length > 0);
                        if (lastBotMsg) await lastBotMsg.edit(options);
                    } catch (error) {
                        const Logger = require('./logger');
                        Logger.error('Failed to update message in fake interaction', error.message);
                        // Fallback to reply if edit fails
                        await message.reply(options);
                    }
                }
            };
            return await blackjack.joinLobby(fakeInteraction);
        }
        message.reply("No active game lobby to join!");
        return false;
    }

    cleanupAbandonedSetups() {
        const now = Date.now();
        const fiveMinutesAgo = now - 300000;
        
        for (const [key, data] of this.activeGames) {
            if (data && data.phase === 'setup' && data.createdAt && data.createdAt < fiveMinutesAgo) {
                this.activeGames.delete(key);
                if (this.userGameMap) {
                    this.userGameMap.delete(data.creator);
                }
            }
        }
    }

    async handleButtonInteraction(interaction) {
        const userId = interaction.user.id;
        
        // Handle gameUI interactions first
        if (interaction.customId.startsWith('gameUI_')) {
            return await gameUI.handleGameUIInteraction(interaction);
        }
        
        // Only handle game-related buttons
        const gameButtonPrefixes = ['bs_', 'bal_', 'pong_', 'bj_', 'ttt_', 'roulette_', 'hangman_', 'baccarat_', 'uno_'];
        const isGameButton = gameButtonPrefixes.some(prefix => interaction.customId.startsWith(prefix)) ||
                            ['bj_join', 'bj_cancel', 'bj_start', 'bj_game_view'].includes(interaction.customId);
        
        if (!isGameButton) return false;
        
        // Find game by interaction prefix
        const gameType = this.getGameTypeFromInteraction(interaction);
        const game = this.games[gameType];
        
        if (!game) return false;
        
        // Special handling for games that need channel-based lookup (roulette, hangman, baccarat)
        if (gameType === 'roulette') {
            const channelId = interaction.channel.id;
            for (const [key, data] of this.activeGames) {
                if (data && data.type === 'roulette' && data.channelId === channelId) {
                    return await game.handleInteraction(interaction, data, key, this);
                }
            }
            await interaction.reply({ content: "No active roulette game found!", flags: require('discord.js').MessageFlags.Ephemeral });
            return true;
        }
        
        if (gameType === 'baccarat') {
            const channelId = interaction.channel.id;
            for (const [key, data] of this.activeGames) {
                if (data && data.type === 'baccarat' && data.channelId === channelId) {
                    return await game.handleInteraction(interaction, data, key, this);
                }
            }
            await interaction.reply({ content: "No active baccarat game found!", flags: require('discord.js').MessageFlags.Ephemeral });
            return true;
        }
        
        if (gameType === 'unoexpress') {
            const channelId = interaction.channel.id;
            for (const [key, data] of this.activeGames) {
                if (data && data.type === 'unoexpress' && data.channelId === channelId) {
                    return await game.handleInteraction(interaction, data, key, this);
                }
            }
            await interaction.reply({ content: "No active UNO Express game found!", flags: require('discord.js').MessageFlags.Ephemeral });
            return true;
        }
        
        if (gameType === 'hangman') {
            const userId = interaction.user.id;
            // Look for playing game first, then setup game
            for (const [key, data] of this.activeGames) {
                if (data && data.type === 'hangman' && data.creator === userId && data.phase === 'playing') {
                    return await game.handleInteraction(interaction, data, key, this);
                }
            }
            await interaction.reply({ content: "No active hangman game found!", flags: require('discord.js').MessageFlags.Ephemeral });
            return true;
        }
        
        // Special handling for lobby-based games (blackjack)
        if (['bj_join', 'bj_cancel', 'bj_start'].includes(interaction.customId) || 
            interaction.customId.startsWith('bj_join_bet_')) {
            return await game.handleInteraction(interaction, null, null, this);
        }
        
        // Special handling for bj_game_view - find game by channel
        if (interaction.customId === 'bj_game_view') {
            const channelId = interaction.channel.id;
            for (const [key, data] of this.activeGames) {
                if (data && data.type === 'blackjack' && (data.channelId === channelId || key.includes(channelId))) {
                    return await game.handleInteraction(interaction, data, key, this);
                }
            }
        }
        
        // Standard game lookup by user
        const { gameData, gameKey } = this.findUserGame(userId, gameType);
        
        if (!gameData) {
            await interaction.reply({ content: "No active game found!", flags: require('discord.js').MessageFlags.Ephemeral });
            return true;
        }
        
        return await game.handleInteraction(interaction, gameData, gameKey, this);
    }
    
    getGameTypeFromInteraction(interaction) {
        const customId = interaction.customId;
        if (customId.startsWith('bs_')) return 'battleship';
        if (customId.startsWith('bal_')) return 'balatro';
        if (customId.startsWith('pong_')) return 'pong';
        if (customId.startsWith('bj_') || ['bj_join', 'bj_cancel', 'bj_start', 'bj_game_view'].includes(customId)) return 'blackjack';
        if (customId.startsWith('ttt_')) return 'tictactoe';
        if (customId.startsWith('roulette_')) return 'roulette';
        if (customId.startsWith('hangman_')) return 'hangman';
        if (customId.startsWith('baccarat_')) return 'baccarat';
        if (customId.startsWith('uno_')) return 'unoexpress';
        return null;
    }
    
    findUserGame(userId, gameType) {
        // Use efficient user-to-game mapping
        if (!this.userGameMap) this.userGameMap = new Map();
        
        // Check cache first
        const cachedGameKey = this.userGameMap.get(userId);
        if (cachedGameKey && this.activeGames.has(cachedGameKey)) {
            const gameData = this.activeGames.get(cachedGameKey);
            if (gameData.type === gameType) {
                return { gameData, gameKey: cachedGameKey };
            }
        }
        
        // Search for user's game
        for (const [key, data] of this.activeGames) {
            if (!data || data.type !== gameType) continue;
            
            if (data.type === 'blackjack') {
                if ((data.phase === 'setup' && data.creator === userId) || 
                    (data.players?.some?.(p => p.id === userId))) {
                    this.userGameMap.set(userId, key);
                    return { gameData: data, gameKey: key };
                }
            } else if (key.includes(userId)) {
                this.userGameMap.set(userId, key);
                return { gameData: data, gameKey: key };
            }
        }
        
        return { gameData: null, gameKey: null };
    }
}

module.exports = new GameManager();
