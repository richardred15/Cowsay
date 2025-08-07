const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const database = require('../database');
const Logger = require('../logger');

class Balatro {
    constructor() {
        this.activeGames = new Map();
        this.suits = ['♠', '♥', '♦', '♣'];
        this.ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        this.blinds = {
            1: { small: 300, big: 800, boss: 2000 },
            2: { small: 450, big: 1200, boss: 3000 },
            3: { small: 600, big: 1600, boss: 4000 }
        };
    }

    async start(interaction) {
        const gameId = `balatro_${interaction.user.id}_${Date.now()}`;
        
        try {
            // Create new game state
            const gameData = {
                id: gameId,
                userId: interaction.user.id,
                ante: 1,
                chips: 300,
                handsRemaining: 4,
                discardsRemaining: 3,
                currentHand: this.dealHand(),
                deck: this.createDeck(),
                jokers: [],
                blindData: { type: 'small', requirement: 300 },
                selectedCards: [],
                phase: 'playing'
            };

            // Save to database
            await this.saveGame(gameData);
            this.activeGames.set(gameId, gameData);

            await interaction.reply({
                content: '🃏 Starting Balatro game...',
                flags: MessageFlags.Ephemeral
            });

            await this.sendGameEmbed(interaction, gameData);
            return { gameKey: gameId, gameData };
        } catch (error) {
            Logger.error('Failed to start Balatro game', error.message);
            await interaction.reply({ content: '❌ Failed to start Balatro game!', flags: MessageFlags.Ephemeral });
            return null;
        }
    }

    createDeck() {
        const deck = [];
        for (const suit of this.suits) {
            for (const rank of this.ranks) {
                deck.push({ suit, rank });
            }
        }
        return this.shuffleDeck(deck);
    }

    shuffleDeck(deck) {
        const shuffled = [...deck];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    dealHand() {
        const hand = [];
        const deck = this.createDeck();
        for (let i = 0; i < 8; i++) {
            hand.push(deck.pop());
        }
        return hand;
    }

    async sendGameEmbed(interaction, gameData) {
        const embed = this.createGameEmbed(gameData);
        const components = this.createGameComponents(gameData);

        const followUp = await interaction.followUp({
            embeds: [embed],
            components
        });

        gameData.messageId = followUp.id;
        await this.saveGame(gameData);
    }

    createGameEmbed(gameData) {
        const blindInfo = this.getBlindInfo(gameData.ante, gameData.blindData.type);
        
        let description = `**Ante ${gameData.ante}** - ${gameData.blindData.type.toUpperCase()} BLIND\n`;
        description += `💰 Chips: ${gameData.chips} / ${blindInfo.requirement}\n`;
        description += `🃏 Hands: ${gameData.handsRemaining} | 🗑️ Discards: ${gameData.discardsRemaining}\n\n`;
        
        description += '**Your Hand:**\n';
        gameData.currentHand.forEach((card, index) => {
            const selected = gameData.selectedCards.includes(index) ? '**' : '';
            description += `${selected}${card.rank}${card.suit}${selected} `;
        });

        if (gameData.selectedCards.length > 0) {
            description += `\n\n**Selected:** ${gameData.selectedCards.length} cards`;
            const handType = this.evaluateHand(gameData.selectedCards.map(i => gameData.currentHand[i]));
            if (handType.name !== 'High Card' || gameData.selectedCards.length >= 5) {
                description += ` (${handType.name})`;
            }
        }

        return new EmbedBuilder()
            .setTitle('🃏 Balatro')
            .setDescription(description)
            .setColor(0x8B4513)
            .setFooter({ text: `Game ID: ${gameData.id.split('_')[2]}` });
    }

    createGameComponents(gameData) {
        const components = [];
        
        // Card selection buttons (2 rows of 4)
        const cardRow1 = new ActionRowBuilder();
        const cardRow2 = new ActionRowBuilder();
        
        gameData.currentHand.forEach((card, index) => {
            const button = new ButtonBuilder()
                .setCustomId(`bal_card_${index}`)
                .setLabel(`${card.rank}${card.suit}`)
                .setStyle(gameData.selectedCards.includes(index) ? ButtonStyle.Primary : ButtonStyle.Secondary);
            
            if (index < 4) {
                cardRow1.addComponents(button);
            } else {
                cardRow2.addComponents(button);
            }
        });

        components.push(cardRow1, cardRow2);

        // Action buttons
        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('bal_play')
                .setLabel('Play Hand')
                .setStyle(ButtonStyle.Success)
                .setDisabled(gameData.selectedCards.length === 0),
            new ButtonBuilder()
                .setCustomId('bal_discard')
                .setLabel('Discard')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(gameData.selectedCards.length === 0 || gameData.discardsRemaining === 0),
            new ButtonBuilder()
                .setCustomId('bal_shop')
                .setLabel('Shop')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(gameData.phase !== 'shop'),
            new ButtonBuilder()
                .setCustomId('bal_quit')
                .setLabel('Quit')
                .setStyle(ButtonStyle.Secondary)
        );

        components.push(actionRow);
        return components;
    }

    async handleInteraction(interaction, gameData, gameKey, gameManager) {
        if (!interaction.customId.startsWith('bal_')) return false;

        let game = gameData || this.findGameByUser(interaction.user.id);
        if (!game) {
            // Try loading from database
            const dbGames = await this.loadUserGames(interaction.user.id);
            if (dbGames.length > 0) {
                game = dbGames[0];
                this.activeGames.set(game.id, game);
            }
        }
        
        if (!game) {
            await interaction.reply({ content: '❌ No active Balatro game found!', flags: MessageFlags.Ephemeral });
            return true;
        }

        // Only allow the game creator to interact
        if (game.userId !== interaction.user.id) {
            await interaction.reply({ content: '❌ This is not your game!', flags: MessageFlags.Ephemeral });
            return true;
        }

        try {
            if (interaction.customId.startsWith('bal_card_')) {
                await this.handleCardSelection(interaction, game);
            } else if (interaction.customId === 'bal_play') {
                await this.handlePlayHand(interaction, game);
            } else if (interaction.customId === 'bal_discard') {
                await this.handleDiscard(interaction, game);
            } else if (interaction.customId === 'bal_shop') {
                await this.handleShop(interaction, game);
            } else if (interaction.customId === 'bal_quit') {
                await this.handleQuit(interaction, game, gameManager);
            }
            return true;
        } catch (error) {
            Logger.error('Balatro interaction error', error.message);
            await interaction.reply({ content: '❌ Game error occurred!', flags: MessageFlags.Ephemeral });
            return true;
        }
    }

    async handleCardSelection(interaction, game) {
        const cardIndex = parseInt(interaction.customId.split('_')[2]);
        
        if (game.selectedCards.includes(cardIndex)) {
            game.selectedCards = game.selectedCards.filter(i => i !== cardIndex);
        } else if (game.selectedCards.length < 5) {
            game.selectedCards.push(cardIndex);
        }

        await this.updateGameEmbed(interaction, game);
    }

    async handlePlayHand(interaction, game) {
        if (game.selectedCards.length === 0) {
            await interaction.reply({ content: '❌ Select cards first!', flags: MessageFlags.Ephemeral });
            return;
        }

        const selectedCards = game.selectedCards.map(i => game.currentHand[i]);
        const handResult = this.evaluateHand(selectedCards);
        const score = this.calculateScore(handResult, game.jokers);
        
        const blindInfo = this.getBlindInfo(game.ante, game.blindData.type);
        game.chips += score;
        const success = game.chips >= blindInfo.requirement;

        if (success) {
            await this.advanceBlind(game);
            await interaction.reply({ 
                content: `✅ ${handResult.name}! +${score} chips! Beat the blind with ${game.chips} total!`, 
                flags: MessageFlags.Ephemeral
            });
        } else {
            game.handsRemaining--;
            await interaction.reply({ 
                content: `${handResult.name} - +${score} chips (${game.chips}/${blindInfo.requirement})`, 
                flags: MessageFlags.Ephemeral
            });
        }

        if (game.handsRemaining <= 0 && !success) {
            await this.gameOver(interaction, game);
            return;
        }

        // Remove played cards and deal new ones
        game.selectedCards.sort((a, b) => b - a); // Sort descending to avoid index issues
        game.selectedCards.forEach(index => {
            game.currentHand.splice(index, 1);
        });
        
        // Deal new cards to fill hand back to 8
        while (game.currentHand.length < 8 && game.deck.length > 0) {
            game.currentHand.push(game.deck.pop());
        }
        
        game.selectedCards = [];
        await this.updateGameEmbed(interaction, game);
    }

    async handleDiscard(interaction, game) {
        if (game.selectedCards.length === 0 || game.discardsRemaining <= 0) {
            await interaction.reply({ content: '❌ Cannot discard!', flags: MessageFlags.Ephemeral });
            return;
        }

        // Remove selected cards and deal new ones
        const newCards = [];
        for (let i = 0; i < game.selectedCards.length; i++) {
            newCards.push(game.deck.pop());
        }

        game.selectedCards.sort((a, b) => b - a);
        game.selectedCards.forEach(index => {
            game.currentHand[index] = newCards.pop();
        });

        game.discardsRemaining--;
        game.selectedCards = [];

        await interaction.reply({ content: '🗑️ Cards discarded!', flags: MessageFlags.Ephemeral });
        await this.updateGameEmbed(interaction, game);
    }

    async handleShop(interaction, game) {
        await interaction.reply({ content: '🛒 Shop coming soon!', flags: MessageFlags.Ephemeral });
    }

    async handleQuit(interaction, game, gameManager) {
        await this.deleteGame(game.id);
        gameManager.activeGames.delete(game.id);
        this.activeGames.delete(game.id);
        
        await interaction.reply({ content: '👋 Game ended!', flags: MessageFlags.Ephemeral });
        await interaction.message.edit({ components: [] });
    }

    evaluateHand(cards) {
        if (cards.length === 0) return { name: 'High Card', multiplier: 1, chips: 5 };
        
        const ranks = cards.map(c => c.rank);
        const suits = cards.map(c => c.suit);
        
        // Count ranks
        const rankCounts = {};
        ranks.forEach(rank => rankCounts[rank] = (rankCounts[rank] || 0) + 1);
        const counts = Object.values(rankCounts).sort((a, b) => b - a);
        
        // Check for flush
        const isFlush = suits.length >= 5 && new Set(suits).size === 1;
        
        // Check for straight
        const rankValues = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
        const sortedValues = ranks.map(r => rankValues[r]).sort((a, b) => a - b);
        const isStraight = sortedValues.length >= 5 && sortedValues.every((val, i) => i === 0 || val === sortedValues[i-1] + 1);
        
        if (isStraight && isFlush) return { name: 'Straight Flush', multiplier: 8, chips: 100 };
        if (counts[0] === 4) return { name: 'Four of a Kind', multiplier: 7, chips: 60 };
        if (counts[0] === 3 && counts[1] === 2) return { name: 'Full House', multiplier: 4, chips: 40 };
        if (isFlush) return { name: 'Flush', multiplier: 4, chips: 35 };
        if (isStraight) return { name: 'Straight', multiplier: 4, chips: 30 };
        if (counts[0] === 3) return { name: 'Three of a Kind', multiplier: 3, chips: 30 };
        if (counts[0] === 2 && counts[1] === 2) return { name: 'Two Pair', multiplier: 2, chips: 20 };
        if (counts[0] === 2) return { name: 'Pair', multiplier: 2, chips: 10 };
        
        return { name: 'High Card', multiplier: 1, chips: 5 };
    }

    calculateScore(handResult, jokers) {
        // In Balatro, scoring is (chips + bonus) × multiplier
        let chips = handResult.chips;
        let multiplier = handResult.multiplier;
        
        // Add card values to chips
        chips += 50; // Base bonus for playing cards
        
        // Apply joker effects here
        
        return Math.floor(chips * multiplier);
    }

    getBlindInfo(ante, blindType) {
        const blinds = this.blinds[ante] || this.blinds[3];
        return { requirement: blinds[blindType] || blinds.small };
    }

    async advanceBlind(game) {
        if (game.blindData.type === 'small') {
            game.blindData.type = 'big';
        } else if (game.blindData.type === 'big') {
            game.blindData.type = 'boss';
        } else {
            game.ante++;
            game.blindData.type = 'small';
            game.handsRemaining = 4;
            game.discardsRemaining = 3;
            game.phase = 'shop';
        }
        await this.saveGame(game);
    }

    async gameOver(interaction, game) {
        const embed = new EmbedBuilder()
            .setTitle('🃏 Game Over!')
            .setDescription(`Final Score: Ante ${game.ante}\nTotal Chips: ${game.chips}`)
            .setColor(0xFF0000);

        await interaction.message.edit({ embeds: [embed], components: [] });
        await this.deleteGame(game.id);
        this.activeGames.delete(game.id);
    }

    async updateGameEmbed(interaction, game) {
        const embed = this.createGameEmbed(game);
        const components = this.createGameComponents(game);
        
        try {
            await interaction.update({ embeds: [embed], components });
        } catch (error) {
            // If update fails, try editing the message directly
            await interaction.message.edit({ embeds: [embed], components });
        }
        await this.saveGame(game);
    }

    findGameByUser(userId) {
        for (const [key, game] of this.activeGames) {
            if (game.userId === userId) return game;
        }
        return null;
    }

    async saveGame(gameData) {
        const sql = `INSERT INTO balatro_games (id, user_id, ante, chips, hands_remaining, discards_remaining, current_hand, deck, jokers, blind_data) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE 
                     ante=VALUES(ante), chips=VALUES(chips), hands_remaining=VALUES(hands_remaining), 
                     discards_remaining=VALUES(discards_remaining), current_hand=VALUES(current_hand), 
                     deck=VALUES(deck), jokers=VALUES(jokers), blind_data=VALUES(blind_data)`;
        
        await database.query(sql, [
            gameData.id, gameData.userId, gameData.ante, gameData.chips,
            gameData.handsRemaining, gameData.discardsRemaining,
            JSON.stringify(gameData.currentHand), JSON.stringify(gameData.deck),
            JSON.stringify(gameData.jokers), JSON.stringify(gameData.blindData)
        ]);
    }

    async loadGame(gameId) {
        const sql = 'SELECT * FROM balatro_games WHERE id = ?';
        const rows = await database.query(sql, [gameId]);
        
        if (rows.length === 0) return null;
        
        const row = rows[0];
        return {
            id: row.id,
            userId: row.user_id,
            ante: row.ante,
            chips: row.chips,
            handsRemaining: row.hands_remaining,
            discardsRemaining: row.discards_remaining,
            currentHand: row.current_hand || [],
            deck: row.deck || [],
            jokers: row.jokers || [],
            blindData: row.blind_data || {},
            selectedCards: [],
            phase: 'playing'
        };
    }

    async loadUserGames(userId) {
        const sql = 'SELECT * FROM balatro_games WHERE user_id = ?';
        const rows = await database.query(sql, [userId]);
        
        return rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            ante: row.ante,
            chips: row.chips,
            handsRemaining: row.hands_remaining,
            discardsRemaining: row.discards_remaining,
            currentHand: row.current_hand || [],
            deck: row.deck || [],
            jokers: row.jokers || [],
            blindData: row.blind_data || {},
            selectedCards: [],
            phase: 'playing'
        }));
    }

    async loadAllActiveGames() {
        const sql = 'SELECT * FROM balatro_games';
        const rows = await database.query(sql);
        
        let loaded = 0;
        rows.forEach(row => {
            try {
                const game = {
                    id: row.id,
                    userId: row.user_id,
                    ante: row.ante,
                    chips: row.chips,
                    handsRemaining: row.hands_remaining,
                    discardsRemaining: row.discards_remaining,
                    currentHand: row.current_hand || [],
                    deck: row.deck || [],
                    jokers: row.jokers || [],
                    blindData: row.blind_data || {},
                    selectedCards: [],
                    phase: 'playing'
                };
                this.activeGames.set(game.id, game);
                loaded++;
            } catch (error) {
                Logger.error(`Failed to load Balatro game ${row.id}`, error.message);
            }
        });
        
        Logger.info(`Loaded ${loaded} active Balatro games`);
    }

    async deleteGame(gameId) {
        const sql = 'DELETE FROM balatro_games WHERE id = ?';
        await database.query(sql, [gameId]);
    }
}

module.exports = new Balatro();