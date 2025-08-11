const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");
const BaseGame = require("./baseGame");
const gameUI = require("./gameUI");
const currencyManager = require("../currencyManager");

class UnoExpress extends BaseGame {
    constructor() {
        super("unoexpress");
        this.colors = ["RED", "YELLOW", "BLUE", "GREEN"];
        this.colorEmojis = {
            RED: "🔴",
            YELLOW: "🟡",
            BLUE: "🔵",
            GREEN: "🟢",
            WILD: "⚫",
        };
        this.maxPlayers = 6;
        this.minPlayers = 2;
    }

    async start(message) {
        const gameKey = `unoexpress_${message.channel.id}`;
        const gameData = this.createBaseGameData(
            message.author,
            message.guild?.id,
            {
                phase: "waiting",
                channelId: message.channel.id,
                players: [
                    {
                        id: message.author.id,
                        name: this.sanitizePlayerName(
                            message.author.displayName
                        ),
                        hand: [],
                        hasUno: false,
                    },
                ],
                currentPlayer: 0,
                currentCard: null,
                currentColor: null,
                deck: [],
                direction: 1,
                gameStarted: false,
            }
        );

        const gameManager = require("../gameManager");
        gameManager.activeGames.set(gameKey, gameData);

        const embed = this.createLobbyEmbed(gameData);
        const buttons = this.createLobbyButtons();

        const reply = await message.reply({
            embeds: [embed],
            components: buttons,
        });
        gameData.messageId = reply.id;

        return { gameKey, gameData };
    }

    async handleInteraction(interaction, gameData, gameKey, gameManager) {
        if (!interaction.customId.startsWith("uno_")) return false;

        const action = interaction.customId.split("_")[1];
        const userId = interaction.user.id;

        if (action === "join") {
            return await this.handleJoin(interaction, gameData);
        }

        if (action === "start") {
            return await this.handleStartGame(
                interaction,
                gameData,
                gameManager
            );
        }

        if (action === "play") {
            const cardIndex = parseInt(interaction.customId.split("_")[2]);
            return await this.handlePlayCard(
                interaction,
                gameData,
                cardIndex,
                gameManager
            );
        }

        if (action === "draw") {
            return await this.handleDrawCard(
                interaction,
                gameData,
                gameManager
            );
        }

        if (action === "color") {
            const color = interaction.customId.split("_")[2];
            return await this.handleColorChoice(
                interaction,
                gameData,
                color,
                gameManager
            );
        }

        if (action === "hand") {
            return await this.showPlayerHand(interaction, gameData);
        }

        return false;
    }

    async handleJoin(interaction, gameData) {
        const userId = interaction.user.id;

        if (gameData.gameStarted) {
            await interaction.reply({
                content: "Game already started!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        if (gameData.players.some((p) => p.id === userId)) {
            await interaction.reply({
                content: "You're already in this game!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        if (gameData.players.length >= this.maxPlayers) {
            await interaction.reply({
                content: "Game is full!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        gameData.players.push({
            id: userId,
            name: this.sanitizePlayerName(interaction.user.displayName),
            hand: [],
            hasUno: false,
        });

        const embed = this.createLobbyEmbed(gameData);
        await interaction.update({ embeds: [embed] });
        return true;
    }

    async handleStartGame(interaction, gameData, gameManager) {
        if (gameData.creator !== interaction.user.id) {
            await interaction.reply({
                content: "Only the game creator can start!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        if (gameData.players.length < this.minPlayers) {
            await interaction.reply({
                content: `Need at least ${this.minPlayers} players to start!`,
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        gameData.gameStarted = true;
        gameData.phase = "playing";
        this.initializeGame(gameData);

        const embed = this.createGameEmbed(gameData);
        const buttons = this.createGameButtons();

        await interaction.update({ embeds: [embed], components: buttons });

        // Players will view hands via "View Hand" button (ephemeral)

        return true;
    }

    async handlePlayCard(interaction, gameData, cardIndex, gameManager) {
        const userId = interaction.user.id;
        const currentPlayer = gameData.players[gameData.currentPlayer];

        if (currentPlayer.id !== userId) {
            await interaction.reply({
                content: "It's not your turn!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        const card = currentPlayer.hand[cardIndex];
        if (
            !card ||
            !this.canPlayCard(card, gameData.currentCard, gameData.currentColor)
        ) {
            await interaction.reply({
                content: "You can't play that card!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        // Remove card from hand
        currentPlayer.hand.splice(cardIndex, 1);
        gameData.currentCard = card;

        // Check for UNO
        if (currentPlayer.hand.length === 1) {
            currentPlayer.hasUno = true;
        }

        // Handle wild cards
        if (card.color === "WILD") {
            if (card.type === "WILD") {
                gameData.currentColor = null; // Will be set by color choice
                return await this.showColorChoice(
                    interaction,
                    gameData,
                    gameManager
                );
            } else if (card.type === "EXPRESS_WILD") {
                gameData.currentColor = null;
                this.nextTurn(gameData);
                // Next player draws 1
                const nextPlayer = gameData.players[gameData.currentPlayer];
                if (gameData.deck.length > 0) {
                    nextPlayer.hand.push(gameData.deck.pop());
                }
                return await this.showColorChoice(
                    interaction,
                    gameData,
                    gameManager
                );
            }
        } else {
            gameData.currentColor = card.color;

            // Handle special cards
            if (card.type === "SKIP") {
                this.nextTurn(gameData); // Skip next player
            }

            this.nextTurn(gameData);
        }

        // Check for win
        if (currentPlayer.hand.length === 0) {
            return await this.endGame(
                interaction,
                gameData,
                gameManager,
                currentPlayer
            );
        }

        await this.updateGameDisplay(interaction, gameData);
        return true;
    }

    async handleDrawCard(interaction, gameData, gameManager) {
        const userId = interaction.user.id;
        const currentPlayer = gameData.players[gameData.currentPlayer];

        if (currentPlayer.id !== userId) {
            await interaction.reply({
                content: "It's not your turn!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        if (gameData.deck.length === 0) {
            await interaction.reply({
                content: "Deck is empty!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        const drawnCard = gameData.deck.pop();
        currentPlayer.hand.push(drawnCard);
        currentPlayer.hasUno = false;

        this.nextTurn(gameData);

        // Update main board and give feedback
        const embed = this.createGameEmbed(gameData);
        const buttons = this.createGameButtons();

        const client = gameManager.client;
        if (client && gameData.messageId) {
            const channel = await client.channels.fetch(gameData.channelId);
            const message = await channel.messages.fetch(gameData.messageId);
            await message.edit({ embeds: [embed], components: buttons });
        }

        await interaction.reply({
            content: `🎴 Drew a card! Next turn: <@${
                gameData.players[gameData.currentPlayer].id
            }>`,
            flags: MessageFlags.Ephemeral,
        });

        return true;
    }

    async handleColorChoice(interaction, gameData, color, gameManager) {
        gameData.currentColor = color;
        await this.updateGameDisplay(interaction, gameData);
        return true;
    }

    async showColorChoice(interaction, gameData, gameManager) {
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("uno_color_RED")
                .setLabel("🔴 Red")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("uno_color_YELLOW")
                .setLabel("🟡 Yellow")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("uno_color_BLUE")
                .setLabel("🔵 Blue")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("uno_color_GREEN")
                .setLabel("🟢 Green")
                .setStyle(ButtonStyle.Success)
        );

        await interaction.reply({
            content: "Choose a color:",
            components: [buttons],
            flags: MessageFlags.Ephemeral,
        });
        return true;
    }

    async showPlayerHand(interaction, gameData) {
        const userId = interaction.user.id;
        const player = gameData.players.find((p) => p.id === userId);

        if (!player) {
            await interaction.reply({
                content: "You're not in this game!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        const embed = this.createHandEmbed(player, gameData);
        const buttons = this.createHandButtons(player, gameData);

        await interaction.reply({
            embeds: [embed],
            components: buttons,
            flags: MessageFlags.Ephemeral,
        });
        return true;
    }

    initializeGame(gameData) {
        gameData.deck = this.createDeck();

        // Deal 7 cards to each player
        for (const player of gameData.players) {
            for (let i = 0; i < 7; i++) {
                player.hand.push(gameData.deck.pop());
            }
        }

        // Set starting card
        do {
            gameData.currentCard = gameData.deck.pop();
        } while (gameData.currentCard.color === "WILD");

        gameData.currentColor = gameData.currentCard.color;
        gameData.currentPlayer = 0;
    }

    createDeck() {
        const deck = [];

        // Number cards (0-9) for each color
        for (const color of this.colors) {
            for (let num = 0; num <= 9; num++) {
                deck.push({ color, type: "NUMBER", value: num });
                if (num !== 0) deck.push({ color, type: "NUMBER", value: num }); // Two of each except 0
            }

            // Skip cards
            deck.push({ color, type: "SKIP" });
            deck.push({ color, type: "SKIP" });
        }

        // Wild cards
        for (let i = 0; i < 4; i++) {
            deck.push({ color: "WILD", type: "WILD" });
            deck.push({ color: "WILD", type: "EXPRESS_WILD" });
        }

        return this.shuffleDeck(deck);
    }

    shuffleDeck(deck) {
        const CryptoRandom = require("../cryptoRandom");
        return CryptoRandom.shuffle(deck);
    }

    canPlayCard(card, currentCard, currentColor) {
        if (card.color === "WILD") return true;
        if (card.color === currentColor) return true;
        if (card.type === currentCard.type && card.type !== "NUMBER")
            return true;
        if (
            card.type === "NUMBER" &&
            currentCard.type === "NUMBER" &&
            card.value === currentCard.value
        )
            return true;
        return false;
    }

    nextTurn(gameData) {
        gameData.currentPlayer =
            (gameData.currentPlayer +
                gameData.direction +
                gameData.players.length) %
            gameData.players.length;
    }

    formatCard(card) {
        const emoji = this.colorEmojis[card.color] || "⚫";
        if (card.type === "NUMBER")
            return `${emoji} ${card.color[0]}${card.value}`;
        if (card.type === "SKIP") return `${emoji} ${card.color[0]}⊘`;
        if (card.type === "WILD") return "⚫ W";
        if (card.type === "EXPRESS_WILD") return "🌈 EW";
        return `${emoji} ${card.type}`;
    }

    createLobbyEmbed(gameData) {
        const playerList = gameData.players
            .map((p) => `• ${p.name}`)
            .join("\n");

        return new EmbedBuilder()
            .setTitle("🎯 UNO Express - Lobby")
            .setDescription(
                `**Players (${gameData.players.length}/${this.maxPlayers}):**\n${playerList}\n\n` +
                    `Need ${this.minPlayers}-${this.maxPlayers} players to start.`
            )
            .setColor(0x00ae86);
    }

    createGameEmbed(gameData) {
        const currentPlayer = gameData.players[gameData.currentPlayer];
        const currentCardDisplay = this.formatCard(gameData.currentCard);
        const colorEmoji = this.colorEmojis[gameData.currentColor];

        const playerList = gameData.players
            .map((p, i) => {
                const indicator = i === gameData.currentPlayer ? "⏰" : "";
                const uno = p.hasUno ? "🚨 UNO!" : "";
                return `${this.colorEmojis[this.colors[i % 4]]} ${p.name}: ${
                    p.hand.length
                } cards ${indicator} ${uno}`.trim();
            })
            .join("\n");

        return new EmbedBuilder()
            .setTitle(`🎯 UNO Express - Turn: ${currentPlayer.name}`)
            .setDescription(
                `🃏 **Current Card:** ${currentCardDisplay}\n` +
                    `🎨 **Current Color:** ${colorEmoji} ${gameData.currentColor}\n\n` +
                    `👥 **Players:**\n${playerList}\n\n` +
                    `🎲 **Deck:** ${gameData.deck.length} cards remaining`
            )
            .setColor(0x00ae86);
    }

    createHandEmbed(player, gameData) {
        const handDisplay = player.hand
            .map((card) => this.formatCard(card))
            .join("  ");
        const playableCards = player.hand.filter((card) =>
            this.canPlayCard(card, gameData.currentCard, gameData.currentColor)
        );
        const playableDisplay = playableCards
            .map((card) => this.formatCard(card))
            .join("  ");

        return new EmbedBuilder()
            .setTitle("🃏 Your Hand")
            .setDescription(
                `**Cards:** ${handDisplay}\n\n` +
                    `**Playable:** ${playableDisplay || "None - must draw"}`
            )
            .setColor(0x00ae86);
    }

    createLobbyButtons() {
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("uno_join")
                    .setLabel("Join Game")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("uno_start")
                    .setLabel("Start Game")
                    .setStyle(ButtonStyle.Primary)
            ),
        ];
    }

    createGameButtons() {
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("uno_hand")
                    .setLabel("🃏 View Hand")
                    .setStyle(ButtonStyle.Secondary)
            ),
        ];
    }

    createHandButtons(player, gameData) {
        const buttons = [];
        const playableCards = [];

        player.hand.forEach((card, index) => {
            if (
                this.canPlayCard(
                    card,
                    gameData.currentCard,
                    gameData.currentColor
                )
            ) {
                playableCards.push({ card, index });
            }
        });

        // Create rows of up to 5 buttons each
        for (let i = 0; i < playableCards.length; i += 5) {
            const row = new ActionRowBuilder();
            for (let j = i; j < Math.min(i + 5, playableCards.length); j++) {
                const { card, index } = playableCards[j];
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`uno_play_${index}`)
                        .setLabel(this.formatCard(card))
                        .setStyle(ButtonStyle.Primary)
                );
            }
            buttons.push(row);
        }

        // Add draw button if no playable cards or as option
        if (buttons.length < 5) {
            const lastRow =
                buttons[buttons.length - 1] || new ActionRowBuilder();
            if (lastRow.components.length < 5) {
                lastRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId("uno_draw")
                        .setLabel("🎴 Draw Card")
                        .setStyle(ButtonStyle.Danger)
                );
            }
            if (buttons.length === 0) buttons.push(lastRow);
        }

        return buttons;
    }

    async updateGameDisplay(interaction, gameData) {
        try {
            const embed = this.createGameEmbed(gameData);
            const buttons = this.createGameButtons();

            // Update the main game message
            const gameManager = require("../gameManager");
            const client = gameManager.client;
            if (client && gameData.messageId) {
                const channel = await client.channels.fetch(gameData.channelId);
                const message = await channel.messages.fetch(
                    gameData.messageId
                );
                await message.edit({ embeds: [embed], components: buttons });
            }

            // Reply to the player's action
            await interaction.reply({
                content: "✅ Card played!",
                flags: MessageFlags.Ephemeral,
            });

            // Auto-delete the confirmation
            setTimeout(async () => {
                try {
                    await interaction.deleteReply();
                } catch (error) {
                    // Already deleted
                }
            }, 2000);
        } catch (error) {
            // Handle update errors
        }
    }

    async endGame(interaction, gameData, gameManager, winner) {
        gameData.phase = "ended";

        const embed = new EmbedBuilder()
            .setTitle("🎉 UNO Express - Game Over!")
            .setDescription(`**Winner:** ${winner.name}`)
            .setColor(0xffd700);

        await interaction.update({ embeds: [embed], components: [] });

        // Record game outcome
        this.recordGameOutcome(gameData, winner.id, {
            player1_id: winner.id,
            player1_name: winner.name,
            player2_id: "multiplayer",
            player2_name: "UNO Express",
            final_score: {
                winner: winner.name,
                total_players: gameData.players.length,
                cards_remaining: gameData.players.reduce(
                    (sum, p) => sum + p.hand.length,
                    0
                ),
            },
            game_mode: "multiplayer",
        });

        gameManager.deleteGame(`unoexpress_${gameData.channelId}`);
        return true;
    }
}

module.exports = new UnoExpress();
