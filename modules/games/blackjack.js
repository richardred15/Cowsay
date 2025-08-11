const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");
const BaseGame = require("./baseGame");
const gameUI = require("./gameUI");
const gameRewards = require("./gameRewards");
const gameStats = require("../gameStats");
const currencyManager = require("../currencyManager");

class Blackjack extends BaseGame {
    constructor() {
        super("blackjack");
        this.lobbies = new Map(); // channelId -> lobby data
    }

    async start(message) {
        const embed = new EmbedBuilder()
            .setTitle("🃏 Blackjack - Choose Mode")
            .setDescription("Select how you want to play:")
            .setColor(0x00ae86);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("bj_single")
                .setLabel("Single Player vs AI")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("bj_multi_player")
                .setLabel("Multiplayer (I'm Player)")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("bj_multi_dealer")
                .setLabel("Multiplayer (I'm Dealer)")
                .setStyle(ButtonStyle.Secondary)
        );

        const reply = await message.reply({
            embeds: [embed],
            components: [buttons],
        });
        return {
            gameKey: `bj_setup_${message.author.id}`,
            gameData: {
                type: "blackjack",
                phase: "setup",
                creator: message.author.id,
                originalMessage: reply,
            },
        };
    }

    async handleInteraction(interaction, gameData, gameKey, gameManager) {
        if (!interaction.customId.startsWith("bj_")) return false;

        const userId = interaction.user.id;

        if (interaction.customId === "bj_single") {
            if (gameData.creator !== userId) {
                await interaction.reply({
                    content: "Only the game creator can select the mode!",
                    ephemeral: true,
                });
                return true;
            }

            return await gameUI.requestBetAmount(
                interaction,
                this.handleSinglePlayerBet.bind(this),
                { gameKey, gameManager },
                {
                    title: "Single Player Blackjack",
                    description: "Choose your bet amount:",
                    amounts: [10, 25, 50, 100],
                    minBet: 10,
                    updateOriginal: true,
                }
            );
        }

        if (
            interaction.customId === "bj_multi_player" ||
            interaction.customId === "bj_multi_dealer"
        ) {
            if (gameData.creator !== userId) {
                await interaction.reply({
                    content: "Only the game creator can select the mode!",
                    ephemeral: true,
                });
                return true;
            }

            //interaction.update({});
            const embed = new EmbedBuilder()
                .setTitle("🃏 Player making selections")
                .setDescription("The game creator is creating.")
                .setColor(0xff00ff);

            //await interaction.update({ embeds: [embed], components: [] });

            const isDealer = interaction.customId === "bj_multi_dealer";

            return await gameUI.requestBetAmount(
                interaction,
                this.handleMultiplayerBet.bind(this),
                { gameKey, gameManager, isDealer },
                {
                    title: "Multiplayer Blackjack",
                    description: "Choose your bet amount:",
                    amounts: [10, 25, 50, 100],
                    minBet: 10,
                    updateOriginal: false,
                }
            );
        }

        if (interaction.customId === "bj_join") {
            const channelId = interaction.channel.id;
            const lobby = this.lobbies.get(channelId);

            if (lobby && lobby.creator === userId) {
                await interaction.reply({
                    content:
                        "You can't join your own game! Use 'Start Game' to begin.",
                    ephemeral: true,
                });
                return true;
            }

            return await this.joinLobby(interaction);
        }

        if (interaction.customId === "bj_cancel") {
            return await this.cancelLobby(interaction);
        }

        if (interaction.customId === "bj_start") {
            return await this.startGameEarly(interaction, gameManager);
        }

        if (interaction.customId === "bj_cancel_setup") {
            const setupKey = `bj_setup_${interaction.user.id}`;
            gameManager.deleteGame(setupKey);

            await interaction.update({
                content: "Game setup cancelled.",
                embeds: [],
                components: [],
            });
            return true;
        }

        if (interaction.customId.startsWith("bj_game_")) {
            if (interaction.customId === "bj_game_view") {
                return await this.handleViewHand(
                    interaction,
                    gameData,
                    gameKey,
                    gameManager
                );
            }
            return await this.handleGameAction(
                interaction,
                gameData,
                gameKey,
                gameManager
            );
        }

        return false;
    }

    async handleSinglePlayerBet(interaction, betAmount, payload) {
        const { gameKey, gameManager } = payload;
        const setupGameData = gameManager.activeGames.get(gameKey);

        return await this.startSinglePlayer(
            interaction,
            gameManager,
            betAmount,
            setupGameData
        );
    }

    async handleMultiplayerBet(interaction, betAmount, payload) {
        const { gameKey, gameManager, isDealer } = payload;

        // Store the bet and dealer info in the game data for later use
        const setupGameData = gameManager.activeGames.get(gameKey);
        if (setupGameData) {
            setupGameData.pendingBet = betAmount;
            setupGameData.isDealer = isDealer;
        }

        return await gameUI.requestWaitTime(
            interaction,
            this.handleWaitTimeSelected.bind(this),
            { gameKey, gameManager, isDealer, betAmount },
            {
                title: "Blackjack - Wait Time",
                description:
                    "How long should we wait for other players to join?",
                times: [30, 60, 120],
                labels: ["30 seconds", "60 seconds", "2 minutes"],
                updateOriginal: false,
            }
        );
    }

    async handleWaitTimeSelected(interaction, waitTime, payload) {
        const { gameKey, gameManager, isDealer, betAmount } = payload;
        const setupGameData = gameManager.activeGames.get(gameKey);

        if (!setupGameData) {
            await interaction.reply({
                content: "Setup data not found!",
                ephemeral: true,
            });
            return true;
        }

        return await this.createLobby(
            interaction,
            waitTime,
            isDealer,
            betAmount,
            gameManager
        );
    }

    async startSinglePlayer(
        interaction,
        gameManager,
        betAmount,
        setupGameData
    ) {
        try {
            const setupKey = `bj_setup_${interaction.user.id}`;
            const gameKey = `blackjack_${interaction.user.id}`;

            const canAfford = await currencyManager.subtractBalance(
                interaction.user.id,
                betAmount
            );
            if (!canAfford) {
                await interaction.update({
                    content: "You don't have enough coins for this bet!",
                    embeds: [],
                    components: [],
                });
                return true;
            }

            gameManager.deleteGame(setupKey);

            const gameData = this.createGameData(
                [
                    {
                        id: interaction.user.id,
                        name: interaction.user.displayName,
                        hand: [],
                        score: 0,
                        bust: false,
                        stand: false,
                    },
                ],
                true,
                null,
                interaction.guild?.id
            );

            gameData.betAmount = betAmount;
            gameData.bets = { [interaction.user.id]: betAmount };

            gameManager.activeGames.set(gameKey, gameData);
            this.dealInitialCards(gameData);

            const embed = this.createGameEmbed(gameData);
            const buttons = this.createGameButtons(
                gameData,
                interaction.user.id
            );

            // Update the original message if it exists
            if (setupGameData && setupGameData.originalMessage) {
                try {
                    await setupGameData.originalMessage.edit({
                        embeds: [embed],
                        components: buttons,
                    });
                } catch (error) {
                    await interaction.reply({
                        embeds: [embed],
                        components: buttons,
                    });
                }
            } else {
                await interaction.reply({
                    embeds: [embed],
                    components: buttons,
                });
            }

            if (gameData.gameOver) {
                if (setupGameData && setupGameData.originalMessage) {
                    await this.announceWinner(
                        setupGameData.originalMessage,
                        gameData
                    );
                } else {
                    await this.announceWinner(interaction, gameData);
                }
                gameManager.deleteGame(gameKey);
            }

            return true;
        } catch (error) {
            const secureLogger = require("../secureLogger");
            secureLogger.error("Error in startSinglePlayer", {
                error: error.message,
                userId: interaction.user.id,
            });
            await interaction.update({
                content: "An error occurred starting the game.",
                embeds: [],
                components: [],
            });
            return true;
        }
    }

    async createLobby(interaction, waitTime, isDealer, betAmount, gameManager) {
        const channelId = interaction.channel.id;
        const setupKey = `bj_setup_${interaction.user.id}`;
        const setupGameData = gameManager.activeGames.get(setupKey);

        if (this.lobbies.has(channelId)) {
            if (interaction.deferred) {
                await interaction.editReply({
                    content:
                        "There's already a blackjack lobby in this channel!",
                });
            } else {
                await interaction.reply({
                    content:
                        "There's already a blackjack lobby in this channel!",
                    flags: MessageFlags.Ephemeral,
                });
            }
            return true;
        }

        // Check if creator can afford the bet
        try {
            const canAfford = await currencyManager.subtractBalance(
                interaction.user.id,
                betAmount
            );
            if (!canAfford) {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: "You don't have enough coins for this bet!",
                    });
                } else {
                    await interaction.reply({
                        content: "You don't have enough coins for this bet!",
                        flags: MessageFlags.Ephemeral,
                    });
                }
                return true;
            }
        } catch (error) {
            const secureLogger = require("../secureLogger");
            secureLogger.error("Error checking balance for lobby bet", {
                error: error.message,
                userId: interaction.user.id,
            });
            if (interaction.deferred) {
                await interaction.editReply({
                    content: "Error processing your bet. Please try again.",
                });
            } else {
                await interaction.reply({
                    content: "Error processing your bet. Please try again.",
                    flags: MessageFlags.Ephemeral,
                });
            }
            return true;
        }

        const lobby = {
            channelId,
            creator: interaction.user.id,
            isDealer,
            players: [
                {
                    id: interaction.user.id,
                    name: interaction.user.displayName,
                    balance: await currencyManager.getBalance(
                        interaction.user.id
                    ),
                    bet: betAmount,
                },
            ],
            waitTime,
            startTime: Date.now(),
            maxPlayers: 6,
            bets: { [interaction.user.id]: betAmount },
        };

        this.lobbies.set(channelId, lobby);

        const embed = this.createLobbyEmbed(lobby);
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("bj_join")
                .setLabel("Join Game")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("bj_start")
                .setLabel("Start Game")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("bj_cancel")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Danger)
        );

        // Clean up setup game data
        if (setupGameData) {
            gameManager.deleteGame(setupKey);
        }

        let lobbyMessage;
        if (setupGameData && setupGameData.originalMessage) {
            try {
                lobbyMessage = await setupGameData.originalMessage.edit({
                    embeds: [embed],
                    components: [buttons],
                });
                lobby.lobbyMessage = lobbyMessage;
            } catch (error) {
                lobbyMessage = await interaction.channel.send({
                    embeds: [embed],
                    components: [buttons],
                });
                lobby.lobbyMessage = lobbyMessage;
            }
        } else {
            lobbyMessage = await interaction.channel.send({
                embeds: [embed],
                components: [buttons],
            });
            lobby.lobbyMessage = lobbyMessage;
        }

        // Start countdown timer
        lobby.countdownInterval = setInterval(async () => {
            const currentLobby = this.lobbies.get(channelId);
            if (!currentLobby) {
                clearInterval(lobby.countdownInterval);
                return;
            }

            const timeLeft = Math.max(
                0,
                waitTime -
                    Math.floor((Date.now() - currentLobby.startTime) / 1000)
            );

            if (timeLeft <= 0) {
                clearInterval(lobby.countdownInterval);
                // Check if dealer lobby has enough players
                if (currentLobby.isDealer && currentLobby.players.length < 2) {
                    // Cancel lobby and refund all bets
                    for (const [playerId, betAmount] of Object.entries(
                        currentLobby.bets
                    )) {
                        await currencyManager.addBalance(playerId, betAmount);
                    }
                    this.lobbies.delete(channelId);

                    const cancelEmbed = new EmbedBuilder()
                        .setTitle("🃏 Blackjack Lobby Cancelled")
                        .setDescription(
                            "Not enough players joined. Your bet has been refunded."
                        )
                        .setColor(0xff0000);

                    try {
                        await lobby.lobbyMessage.edit({
                            embeds: [cancelEmbed],
                            components: [],
                        });
                    } catch (error) {
                        console.log("Could not update cancelled lobby message");
                    }
                    return;
                }
                await this.startMultiplayerGame(
                    interaction.channel,
                    gameManager
                );

                // Send ephemeral game state to current player after auto-start
                const gameKey = `channelBlackjack_${channelId}`;
                const gameData = gameManager.activeGames.get(gameKey);
                if (gameData && !gameData.gameOver && gameData.currentPlayer) {
                    // We need to create a fake interaction for the current player
                    // Since we don't have an interaction context here, we'll skip this
                    // The player will get their hand when they first interact
                }
                return;
            }

            const updatedEmbed = this.createLobbyEmbed(currentLobby);
            const updatedButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("bj_join")
                    .setLabel("Join Game")
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(
                        currentLobby.players.length >= currentLobby.maxPlayers
                    ),
                new ButtonBuilder()
                    .setCustomId("bj_start")
                    .setLabel("Start Game")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("bj_cancel")
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Danger)
            );

            try {
                await lobby.lobbyMessage.edit({
                    embeds: [updatedEmbed],
                    components: [updatedButtons],
                });
            } catch (error) {
                clearInterval(lobby.countdownInterval);
            }
        }, 1000);

        return true;
    }

    async joinLobby(interaction) {
        const channelId = interaction.channel.id;
        const lobby = this.lobbies.get(channelId);

        if (!lobby) {
            await interaction.reply({
                content: "No active lobby found!",
                ephemeral: true,
            });
            return true;
        }

        if (lobby.players.some((p) => p.id === interaction.user.id)) {
            await interaction.reply({
                content: "You're already in this game!",
                ephemeral: true,
            });
            return true;
        }

        if (lobby.players.length >= lobby.maxPlayers) {
            await interaction.reply({
                content: "Game is full!",
                ephemeral: true,
            });
            return true;
        }

        return await gameUI.requestBetAmount(
            interaction,
            this.handleJoinBetPlaced.bind(this),
            { lobby },
            {
                title: "Join Blackjack Game",
                description: "Choose your bet amount to join:",
                amounts: [10, 25, 50, 100],
                minBet: 10,
                updateOriginal: false,
            }
        );
    }

    async handleJoinBetPlaced(interaction, betAmount, payload) {
        const { lobby } = payload;
        const channelId = interaction.channel.id;
        const currentLobby = this.lobbies.get(channelId);

        if (!currentLobby) {
            await interaction.reply({
                content: "Lobby no longer exists!",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        try {
            const canAfford = await currencyManager.subtractBalance(
                interaction.user.id,
                betAmount
            );
            if (!canAfford) {
                await interaction.reply({
                    content: "You don't have enough coins for this bet!",
                    flags: MessageFlags.Ephemeral,
                });
                return true;
            }
        } catch (error) {
            const secureLogger = require("../secureLogger");
            secureLogger.error("Error checking balance for join bet", {
                error: error.message,
                userId: interaction.user.id,
            });
            await interaction.reply({
                content: "Error processing your bet. Please try again.",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        currentLobby.players.push({
            id: interaction.user.id,
            name: interaction.user.displayName,
            balance: await currencyManager.getBalance(interaction.user.id),
            bet: betAmount,
        });
        currentLobby.bets[interaction.user.id] = betAmount;

        await interaction.reply({
            content: `✅ Joined game with ${betAmount} coins bet!`,
            flags: MessageFlags.Ephemeral,
        });

        // Auto-delete after 12 seconds
        gameUI.autoDeleteEphemeral(interaction, 12000);
        return true;
    }

    async cancelLobby(interaction) {
        const channelId = interaction.channel.id;
        const lobby = this.lobbies.get(channelId);

        if (!lobby) {
            await interaction.reply({
                content: "No active lobby found!",
                ephemeral: true,
            });
            return true;
        }

        if (lobby.creator !== interaction.user.id) {
            const reply = await interaction.reply({
                content: "Only the lobby creator can cancel!",
                ephemeral: true,
            });
            setTimeout(async () => {
                try {
                    await interaction.deleteReply();
                } catch (error) {
                    // Message already deleted or expired
                }
            }, 5000);
            return true;
        }

        if (lobby.countdownInterval) {
            clearInterval(lobby.countdownInterval);
        }

        this.lobbies.delete(channelId);

        const embed = new EmbedBuilder()
            .setTitle("🃏 Blackjack Lobby Cancelled")
            .setDescription("The lobby has been cancelled by the creator.")
            .setColor(0xff0000);

        await interaction.update({ embeds: [embed], components: [] });
        return true;
    }

    async startMultiplayerGame(channel, gameManager) {
        const channelId = channel.id;
        const lobby = this.lobbies.get(channelId);
        if (!lobby) return;

        // Clean up any setup games for lobby players
        for (const player of lobby.players) {
            const setupKey = `bj_setup_${player.id}`;
            gameManager.deleteGame(setupKey);
        }

        const gameKey = `channelBlackjack_${channelId}`;
        const players = lobby.players.map((p) => ({
            id: p.id,
            name: p.name,
            hand: [],
            score: 0,
            bust: false,
            stand: false,
        }));

        const gameData = this.createGameData(
            players,
            false,
            lobby.isDealer ? lobby.creator : null,
            channel.guild?.id
        );
        gameData.bets = lobby.bets;
        gameData.channelId = channel.id;
        gameManager.activeGames.set(gameKey, gameData);
        this.lobbies.delete(channelId);

        this.dealInitialCards(gameData);

        const embed = this.createGameEmbed(gameData);

        // Find and update the lobby message with game table and View Hand button
        try {
            const messages = await channel.messages.fetch({ limit: 10 });
            const lobbyMessage = messages.find(
                (m) =>
                    m.author.bot && m.embeds[0]?.title === "🃏 Blackjack Lobby"
            );
            if (lobbyMessage) {
                const viewHandButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("bj_game_view")
                        .setLabel("View Hand")
                        .setStyle(ButtonStyle.Secondary)
                );

                await lobbyMessage.edit({
                    embeds: [embed],
                    components: [viewHandButton],
                });
                gameData.gameMessageId = lobbyMessage.id;
            }
        } catch (error) {
            console.log("Could not update lobby message");
        }

        // Note: Initial game state will be sent when first player interacts

        // Check if game ended immediately (all blackjacks)
        if (gameData.gameOver) {
            await this.announceWinner(channel, gameData);
            gameManager.deleteGame(gameKey);
        }
    }

    createGameData(players, isSinglePlayer, dealerId = null, serverId = null) {
        return {
            type: "blackjack",
            phase: "playing",
            players,
            dealer: { hand: [], score: 0, bust: false },
            deck: this.createDeck(),
            isSinglePlayer,
            dealerId,
            gameOver: false,
            startTime: Date.now(),
            serverId,
            ephemeralInteractions: {}, // Store ephemeral interactions by userId
        };
    }

    createDeck() {
        if (!this.baseDeck) {
            const suits = ["♠", "♥", "♦", "♣"];
            const ranks = [
                "A",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                "10",
                "J",
                "Q",
                "K",
            ];
            this.baseDeck = [];

            for (const suit of suits) {
                for (const rank of ranks) {
                    this.baseDeck.push({
                        rank,
                        suit,
                        value: this.getCardValue(rank),
                    });
                }
            }
        }

        return this.shuffleDeck([...this.baseDeck]);
    }

    shuffleDeck(deck) {
        const CryptoRandom = require("../cryptoRandom");
        return CryptoRandom.shuffle(deck);
    }

    getCardValue(rank) {
        if (rank === "A") return 11;
        if (["J", "Q", "K"].includes(rank)) return 10;
        return parseInt(rank);
    }

    dealInitialCards(gameData) {
        // Deal 2 cards to each player
        for (const player of gameData.players) {
            player.hand.push(gameData.deck.pop(), gameData.deck.pop());
            player.score = this.calculateScore(player.hand);

            // Check for blackjack (21 with 2 cards)
            if (player.score === 21) {
                player.blackjack = true;
                player.stand = true;
            }
        }

        // Deal 2 cards to dealer (1 hidden in display)
        gameData.dealer.hand.push(gameData.deck.pop(), gameData.deck.pop());
        gameData.dealer.score = this.calculateScore(gameData.dealer.hand);

        // Check if all players have blackjack or are done
        const allPlayersDone = gameData.players.every(
            (p) => p.blackjack || p.bust || p.stand
        );
        if (allPlayersDone) {
            gameData.phase = "dealer";
            this.playDealer(gameData);
        }
    }

    calculateScore(hand) {
        let score = 0;
        let aces = 0;

        for (const card of hand) {
            if (card.rank === "A") {
                aces++;
                score += 11;
            } else {
                score += card.value;
            }
        }

        while (score > 21 && aces > 0) {
            score -= 10;
            aces--;
        }

        return score;
    }

    createLobbyEmbed(lobby) {
        const timeLeft = Math.max(
            0,
            lobby.waitTime - Math.floor((Date.now() - lobby.startTime) / 1000)
        );
        const playerList = lobby.players
            .map(
                (p) =>
                    `${this.sanitizePlayerName(p.name)}: ${parseInt(
                        p.bet
                    )} coins 🪙`
            )
            .join("\n");

        return new EmbedBuilder()
            .setTitle("🃏 Blackjack Lobby")
            .setDescription(
                "Players can bet different amounts! Waiting for players to join..."
            )
            .addFields(
                {
                    name: "Players & Bets",
                    value: `${playerList}\n(${lobby.players.length}/${lobby.maxPlayers})`,
                    inline: true,
                },
                { name: "Time Left", value: `${timeLeft}s`, inline: true },
                {
                    name: "Mode",
                    value: lobby.isDealer ? "Player Dealer" : "AI Dealer",
                    inline: true,
                }
            )
            .setColor(0x00ae86);
    }

    createGameEmbed(gameData) {
        // Show all hands only in single player or when game is over
        const showAllHands =
            gameData.isSinglePlayer ||
            gameData.gameOver ||
            gameData.phase === "dealer";

        const playerHands = gameData.players
            .map((p) => {
                if (showAllHands) {
                    // Show full hand
                    return `**${this.sanitizePlayerName(
                        p.name
                    )}**: ${this.formatHand(p.hand)} (${parseInt(p.score)})${
                        p.blackjack ? " 🎉" : ""
                    }${p.bust ? " 💥" : ""}${p.stand ? " ✋" : ""}`;
                } else {
                    // Hide hand, show only status
                    const cardCount = p.hand.length;
                    const status = p.blackjack
                        ? " 🎉"
                        : p.bust
                        ? " 💥"
                        : p.stand
                        ? " ✋"
                        : "";
                    return `**${this.sanitizePlayerName(p.name)}**: [${parseInt(
                        cardCount
                    )} cards]${status}`;
                }
            })
            .join("\n");

        const dealerHand =
            gameData.phase === "dealer" || gameData.gameOver
                ? this.formatHand(gameData.dealer.hand)
                : `${this.formatCard(gameData.dealer.hand[0])} 🂠`;

        const dealerScore =
            gameData.phase === "dealer" || gameData.gameOver
                ? ` (${gameData.dealer.score})`
                : "";

        return new EmbedBuilder()
            .setTitle("🃏 Blackjack")
            .addFields(
                {
                    name: "Dealer",
                    value: `${dealerHand}${dealerScore}`,
                    inline: false,
                },
                { name: "Players", value: playerHands, inline: false }
            )
            .setColor(0x00ae86);
    }

    formatHand(hand) {
        return hand.map((card) => this.formatCard(card)).join(" ");
    }

    formatCard(card) {
        return `${card.rank}${card.suit}`;
    }

    createGameButtons(gameData, playerId) {
        if (gameData.gameOver || gameData.phase === "dealer") return [];
        if (!gameData.players || !Array.isArray(gameData.players)) return [];

        const player = gameData.players.find((p) => p.id === playerId);
        if (!player) return [];

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("bj_game_hit")
                .setLabel("Hit")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("bj_game_stand")
                .setLabel("Stand")
                .setStyle(ButtonStyle.Secondary)
        );

        // Add "View Hand" button for multiplayer games
        if (!gameData.isSinglePlayer) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId("bj_game_view")
                    .setLabel("View Hand")
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        if (player.hand.length === 2 && !player.bust && !player.stand) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId("bj_game_double")
                    .setLabel("Double Down")
                    .setStyle(ButtonStyle.Success)
            );
        }

        return [buttons];
    }

    async handleGameAction(interaction, gameData, gameKey, gameManager) {
        const action = interaction.customId.split("_")[2];
        const userId = interaction.user.id;

        // Get fresh game data from manager to avoid stale references
        const freshGameData = gameManager.activeGames.get(gameKey);
        // Always use reply for game actions - simpler and more reliable
        const replyMethod = "reply";

        if (!freshGameData) {
            await interaction[replyMethod]({
                content: "Game not found!",
                ephemeral: true,
            });
            return true;
        }

        if (!freshGameData.players || !Array.isArray(freshGameData.players)) {
            await interaction[replyMethod]({
                content: "Game data corrupted!",
                ephemeral: true,
            });
            return true;
        }

        const player = freshGameData.players.find((p) => p.id === userId);

        if (!player) {
            await interaction[replyMethod]({
                content: "You're not in this game!",
                ephemeral: true,
            });
            return true;
        }

        if (player.bust || player.stand) {
            await interaction[replyMethod]({
                content: "You've already finished your hand!",
                ephemeral: true,
            });
            return true;
        }

        if (action === "hit" || action === "double") {
            player.hand.push(freshGameData.deck.pop());
            player.score = this.calculateScore(player.hand);

            if (player.score > 21) {
                player.bust = true;
            }

            if (action === "double") {
                player.stand = true;
                // Double the bet
                if (freshGameData.bets && freshGameData.bets[userId]) {
                    const additionalBet = freshGameData.bets[userId];
                    const canDouble = await currencyManager.subtractBalance(
                        userId,
                        additionalBet
                    );
                    if (canDouble) {
                        freshGameData.bets[userId] *= 2;
                    } else {
                        await interaction[replyMethod]({
                            content: "Not enough coins to double down!",
                            ephemeral: true,
                        });
                        return true;
                    }
                }
            }
        }

        if (action === "stand") {
            player.stand = true;
        }

        // Check if all players are done
        const allPlayersDone = freshGameData.players.every(
            (p) => p.bust || p.stand || p.blackjack
        );
        if (allPlayersDone) {
            freshGameData.phase = "dealer";
            this.playDealer(freshGameData);
        }

        // Update the game data in the manager
        gameManager.activeGames.set(gameKey, freshGameData);

        const embed = this.createGameEmbed(freshGameData);
        const buttons = this.createGameButtons(freshGameData, userId);

        // Handle multiplayer vs single player updates differently
        if (freshGameData.isSinglePlayer) {
            // Single player - update normally with buttons
            await interaction.update({ embeds: [embed], components: buttons });
        } else {
            // Multiplayer - update player's ephemeral hand if they have one
            await this.updatePlayerHand(userId, freshGameData, gameManager);

            // If player is done (bust/stand), clean up their ephemeral interaction
            if (player.bust || player.stand) {
                this.cleanupEphemeralTimeouts(userId, freshGameData);
                const ephemeralData =
                    freshGameData.ephemeralInteractions[userId];
                if (ephemeralData) {
                    try {
                        await ephemeralData.interaction.deleteReply();
                    } catch (error) {
                        // Already deleted or expired
                    }
                    delete freshGameData.ephemeralInteractions[userId];
                }
            }

            // Update main channel with View Hand button
            try {
                const mainChannel = await interaction.client.channels.fetch(
                    freshGameData.channelId
                );
                const mainMessage = await mainChannel.messages.fetch(
                    freshGameData.gameMessageId
                );

                const viewHandButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("bj_game_view")
                        .setLabel("View Hand")
                        .setStyle(ButtonStyle.Secondary)
                );

                await mainMessage.edit({
                    embeds: [embed],
                    components: [viewHandButton],
                });
            } catch (error) {
                console.log("Could not update main channel message");
            }
        }

        if (freshGameData.gameOver) {
            if (freshGameData.isSinglePlayer) {
                await this.announceWinner(interaction, freshGameData);
            } else {
                await this.announceWinner(interaction.channel, freshGameData);
            }
            gameManager.deleteGame(gameKey);
        }

        return true;
    }

    playDealer(gameData) {
        // Dealer hits on 16, stands on 17
        while (gameData.dealer.score < 17) {
            gameData.dealer.hand.push(gameData.deck.pop());
            gameData.dealer.score = this.calculateScore(gameData.dealer.hand);
        }

        if (gameData.dealer.score > 21) {
            gameData.dealer.bust = true;
        }

        gameData.gameOver = true;
    }

    async announceWinner(interactionOrChannelOrMessage, gameData) {
        // Clean up all ephemeral timeouts when game ends
        Object.keys(gameData.ephemeralInteractions).forEach((userId) => {
            this.cleanupEphemeralTimeouts(userId, gameData);
        });
        gameData.ephemeralInteractions = {};

        const isChannel =
            interactionOrChannelOrMessage.type !== undefined &&
            !interactionOrChannelOrMessage.user; // Check if it's a channel object
        const isMessage =
            interactionOrChannelOrMessage.edit !== undefined &&
            interactionOrChannelOrMessage.channel !== undefined; // Check if it's a message object
        const winners = [];
        const losers = [];
        const pushes = [];

        // Process payouts and determine results
        for (const player of gameData.players) {
            const betAmount = gameData.bets ? gameData.bets[player.id] : 0;
            let payout = 0;
            let resultText = "";

            if (player.blackjack) {
                // Blackjack pays 2.5x (bet back + 1.5x bet)
                payout = Math.floor(betAmount * 2.5);
                await currencyManager.addBalance(player.id, payout);
                const profit = payout - betAmount;
                const newBalance = await currencyManager.getBalance(player.id);
                resultText = `${player.name} (Blackjack! 🎉) +${profit} coins (${newBalance} total)`;
                winners.push(resultText);
            } else if (!player.bust) {
                if (
                    gameData.dealer.bust ||
                    player.score > gameData.dealer.score
                ) {
                    // Win pays 2x (bet back + bet amount)
                    payout = betAmount * 2;
                    await currencyManager.addBalance(player.id, payout);
                    const profit = payout - betAmount;
                    const newBalance = await currencyManager.getBalance(
                        player.id
                    );
                    resultText = `${player.name} (${player.score}) +${profit} coins (${newBalance} total)`;
                    winners.push(resultText);
                } else if (player.score === gameData.dealer.score) {
                    // Push returns bet
                    payout = betAmount;
                    await currencyManager.addBalance(player.id, payout);
                    const newBalance = await currencyManager.getBalance(
                        player.id
                    );
                    resultText = `${player.name} (Push - ${player.score}) ±0 coins (${newBalance} total)`;
                    pushes.push(resultText);
                } else {
                    // Loss - no payout (already deducted)
                    const newBalance = await currencyManager.getBalance(
                        player.id
                    );
                    resultText = `${player.name} (${player.score}) -${betAmount} coins (${newBalance} total)`;
                    losers.push(resultText);
                }
            } else {
                // Bust - no payout (already deducted)
                const newBalance = await currencyManager.getBalance(player.id);
                resultText = `${player.name} (Bust - ${player.score}) -${betAmount} coins (${newBalance} total)`;
                losers.push(resultText);
            }
        }

        // Create final game state with all hands revealed
        const finalGameEmbed = this.createGameEmbed(gameData);

        let resultText = "";
        if (winners.length > 0) {
            resultText += `🏆 **Winners:**\n${winners.join("\n")}\n\n`;
        }
        if (pushes.length > 0) {
            resultText += `🤝 **Pushes:**\n${pushes.join("\n")}\n\n`;
        }
        if (losers.length > 0) {
            resultText += `💥 **Losers:**\n${losers.join("\n")}\n\n`;
        }
        resultText += `🏠 **Dealer:** ${gameData.dealer.score}${
            gameData.dealer.bust ? " (Bust)" : ""
        }`;

        // Record game outcomes
        this.recordGameOutcome(gameData, winners, losers, pushes);

        // Add results to the final game embed
        finalGameEmbed.addFields({
            name: "🎊 Game Results 🪙",
            value: resultText,
            inline: false,
        });
        finalGameEmbed.setColor(0xffd700);

        // Update the game board with final results
        if (isChannel) {
            // Multiplayer game - update main channel message
            try {
                const mainMessage =
                    await interactionOrChannelOrMessage.messages.fetch(
                        gameData.gameMessageId
                    );
                await mainMessage.edit({
                    embeds: [finalGameEmbed],
                    components: [],
                });
            } catch (error) {
                console.log("Could not update main channel with final results");
            }
        } else if (isMessage) {
            // Single player game with message object - update the message
            try {
                await interactionOrChannelOrMessage.edit({
                    embeds: [finalGameEmbed],
                    components: [],
                });
            } catch (error) {
                console.log(
                    "Could not update single player message with final results"
                );
            }
        } else {
            // Single player game with interaction - update the interaction
            try {
                await interactionOrChannelOrMessage.editReply({
                    embeds: [finalGameEmbed],
                    components: [],
                });
            } catch (error) {
                console.log(
                    "Could not update single player game with final results"
                );
            }
        }
    }

    cleanupEphemeralTimeouts(userId, gameData) {
        const ephemeralData = gameData.ephemeralInteractions[userId];
        if (ephemeralData) {
            if (ephemeralData.warningTimeout) {
                clearTimeout(ephemeralData.warningTimeout);
                ephemeralData.warningTimeout = null;
            }
            if (ephemeralData.expiryTimeout) {
                clearTimeout(ephemeralData.expiryTimeout);
                ephemeralData.expiryTimeout = null;
            }
        }
    }

    async sendWarningMessage(interaction, gameKey, userId, gameManager) {
        const gameData = gameManager.activeGames.get(gameKey);
        if (!gameData || !gameData.ephemeralInteractions[userId]) return;

        try {
            await interaction.editReply({
                content:
                    "⏰ Please make your move soon or your hand view will expire!",
                embeds: [],
                components: [],
            });
            gameData.ephemeralInteractions[userId].warned = true;
        } catch (error) {
            // Interaction already expired, clean up
            this.cleanupEphemeralTimeouts(userId, gameData);
            delete gameData.ephemeralInteractions[userId];
        }
    }

    async sendExpiryMessage(interaction, gameKey, userId, gameManager) {
        const gameData = gameManager.activeGames.get(gameKey);
        if (!gameData || !gameData.ephemeralInteractions[userId]) return;

        try {
            await interaction.editReply({
                content:
                    "🕐 Your hand view has expired! Click 'View Hand' again to see your cards.",
                embeds: [],
                components: [],
            });
        } catch (error) {
            // Interaction already expired
        } finally {
            // Always clean up after expiry
            this.cleanupEphemeralTimeouts(userId, gameData);
            delete gameData.ephemeralInteractions[userId];
        }
    }

    async updatePlayerHand(userId, gameData, gameManager) {
        const ephemeralData = gameData.ephemeralInteractions[userId];
        if (!ephemeralData || !ephemeralData.interaction) return;

        const player = gameData.players.find((p) => p.id === userId);
        if (!player) return;

        // Create updated hand embed
        const dealerHand =
            gameData.phase === "dealer" || gameData.gameOver
                ? this.formatHand(gameData.dealer.hand)
                : `${this.formatCard(gameData.dealer.hand[0])} 🂠`;
        const dealerScore =
            gameData.phase === "dealer" || gameData.gameOver
                ? ` (${gameData.dealer.score})`
                : "";

        const otherPlayers = gameData.players
            .filter((p) => p.id !== userId)
            .map(
                (p) =>
                    `${p.name}: [${p.hand.length} cards]${
                        p.blackjack ? " 🎉" : ""
                    }${p.bust ? " 💥" : ""}${p.stand ? " ✋" : ""}`
            )
            .join("\n");

        const embed = new EmbedBuilder()
            .setTitle("🃏 Your Hand - Blackjack")
            .setDescription(
                `**Your Cards:** ${this.formatHand(player.hand)} (${
                    player.score
                })${player.blackjack ? " 🎉" : ""}${player.bust ? " 💥" : ""}${
                    player.stand ? " ✋" : ""
                }`
            )
            .addFields(
                {
                    name: "Dealer",
                    value: `${dealerHand}${dealerScore}`,
                    inline: false,
                },
                {
                    name: "Other Players",
                    value: otherPlayers || "None",
                    inline: false,
                }
            )
            .setColor(0x00ae86);

        let components = [];
        if (!player.bust && !player.stand && !gameData.gameOver) {
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("bj_game_hit")
                    .setLabel("Hit")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("bj_game_stand")
                    .setLabel("Stand")
                    .setStyle(ButtonStyle.Secondary)
            );

            if (player.hand.length === 2) {
                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId("bj_game_double")
                        .setLabel("Double Down")
                        .setStyle(ButtonStyle.Success)
                );
            }
            components = [buttons];
        }

        try {
            await ephemeralData.interaction.editReply({
                embeds: [embed],
                components,
            });
        } catch (error) {
            // Interaction expired, clean up
            this.cleanupEphemeralTimeouts(userId, gameData);
            delete gameData.ephemeralInteractions[userId];
        }
    }

    async sendEphemeralGameState(interaction, gameData, gameKey, gameManager) {
        const userId = interaction.user.id;
        const player = gameData.players.find((p) => p.id === userId);
        if (!player) return;

        // Clean up any existing ephemeral interaction for this user
        if (gameData.ephemeralInteractions[userId]) {
            this.cleanupEphemeralTimeouts(userId, gameData);
            try {
                await gameData.ephemeralInteractions[
                    userId
                ].interaction.deleteReply();
            } catch (error) {
                // Already deleted or expired
            }
        }

        // Create game board summary
        const dealerHand =
            gameData.phase === "dealer" || gameData.gameOver
                ? this.formatHand(gameData.dealer.hand)
                : `${this.formatCard(gameData.dealer.hand[0])} 🂠`;
        const dealerScore =
            gameData.phase === "dealer" || gameData.gameOver
                ? ` (${gameData.dealer.score})`
                : "";

        const otherPlayers = gameData.players
            .filter((p) => p.id !== userId)
            .map(
                (p) =>
                    `${p.name}: [${p.hand.length} cards]${
                        p.blackjack ? " 🎉" : ""
                    }${p.bust ? " 💥" : ""}${p.stand ? " ✋" : ""}`
            )
            .join("\n");

        const embed = new EmbedBuilder()
            .setTitle("🃏 Your Hand - Blackjack")
            .setDescription(
                `**Your Cards:** ${this.formatHand(player.hand)} (${
                    player.score
                })${player.blackjack ? " 🎉" : ""}${player.bust ? " 💥" : ""}${
                    player.stand ? " ✋" : ""
                }`
            )
            .addFields(
                {
                    name: "Dealer",
                    value: `${dealerHand}${dealerScore}`,
                    inline: false,
                },
                {
                    name: "Other Players",
                    value: otherPlayers || "None",
                    inline: false,
                }
            )
            .setColor(0x00ae86);

        // Show action buttons for active players
        let components = [];
        if (!player.bust && !player.stand && !gameData.gameOver) {
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("bj_game_hit")
                    .setLabel("Hit")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("bj_game_stand")
                    .setLabel("Stand")
                    .setStyle(ButtonStyle.Secondary)
            );

            if (player.hand.length === 2) {
                buttons.addComponents(
                    new ButtonBuilder()
                        .setCustomId("bj_game_double")
                        .setLabel("Double Down")
                        .setStyle(ButtonStyle.Success)
                );
            }
            components = [buttons];
        }

        try {
            await interaction.reply({
                embeds: [embed],
                components,
                ephemeral: true,
            });

            // Store the interaction with timeout management
            const ephemeralData = {
                interaction: interaction,
                createdAt: Date.now(),
                warningTimeout: null,
                expiryTimeout: null,
                gameKey: gameKey,
                warned: false,
            };

            // Set up 13-minute warning timeout
            ephemeralData.warningTimeout = setTimeout(() => {
                this.sendWarningMessage(
                    interaction,
                    gameKey,
                    userId,
                    gameManager
                );
                ephemeralData.warningTimeout = null;
            }, 13 * 60 * 1000);

            // Set up 14-minute expiry timeout
            ephemeralData.expiryTimeout = setTimeout(() => {
                this.sendExpiryMessage(
                    interaction,
                    gameKey,
                    userId,
                    gameManager
                );
                ephemeralData.expiryTimeout = null;
            }, 14 * 60 * 1000);

            gameData.ephemeralInteractions[userId] = ephemeralData;
        } catch (error) {
            console.log(
                `Could not send ephemeral game state: ${error.message}`
            );
        }
    }

    async handleViewHand(interaction, gameData, gameKey, gameManager) {
        const userId = interaction.user.id;
        const freshGameData = gameManager.activeGames.get(gameKey);

        if (!freshGameData || !freshGameData.players) {
            await interaction.reply({
                content: "Game not found!",
                ephemeral: true,
            });
            return true;
        }

        const player = freshGameData.players.find((p) => p.id === userId);
        if (!player) {
            await interaction.reply({
                content: "You're not in this game!",
                ephemeral: true,
            });
            return true;
        }

        await this.sendEphemeralGameState(
            interaction,
            freshGameData,
            gameKey,
            gameManager
        );
        return true;
    }

    async sendPrivateHandInfo(interaction, gameData, playerId) {
        const player = gameData.players.find((p) => p.id === playerId);
        if (!player) return;

        // Create game board summary
        const dealerHand =
            gameData.phase === "dealer" || gameData.gameOver
                ? this.formatHand(gameData.dealer.hand)
                : `${this.formatCard(gameData.dealer.hand[0])} 🂠`;
        const dealerScore =
            gameData.phase === "dealer" || gameData.gameOver
                ? ` (${gameData.dealer.score})`
                : "";

        const otherPlayers = gameData.players
            .filter((p) => p.id !== playerId)
            .map(
                (p) =>
                    `${p.name}: [${p.hand.length} cards]${
                        p.blackjack ? " 🎉" : ""
                    }${p.bust ? " 💥" : ""}${p.stand ? " ✋" : ""}`
            )
            .join("\n");

        const embed = new EmbedBuilder()
            .setTitle("🃏 Your Hand")
            .setDescription(
                `**Your Cards:** ${this.formatHand(player.hand)} (${
                    player.score
                })${player.blackjack ? " 🎉" : ""}${player.bust ? " 💥" : ""}${
                    player.stand ? " ✋" : ""
                }`
            )
            .addFields(
                {
                    name: "Dealer",
                    value: `${dealerHand}${dealerScore}`,
                    inline: false,
                },
                {
                    name: "Other Players",
                    value: otherPlayers || "None",
                    inline: false,
                }
            )
            .setColor(0x00ae86);

        try {
            await interaction.reply({
                embeds: [embed],
                ephemeral: true,
            });
        } catch (error) {
            console.log(
                `Could not send private hand info to ${player.name}: ${error.message}`
            );
        }
    }

    async startGameEarly(interaction, gameManager) {
        const channelId = interaction.channel.id;
        const lobby = this.lobbies.get(channelId);

        if (!lobby) {
            await interaction.reply({
                content: "No active lobby found!",
                ephemeral: true,
            });
            return true;
        }

        if (lobby.creator !== interaction.user.id) {
            const reply = await interaction.reply({
                content: "Only the lobby creator can start the game!",
                ephemeral: true,
            });
            setTimeout(async () => {
                try {
                    await interaction.deleteReply();
                } catch (error) {
                    // Message already deleted or expired
                }
            }, 5000);
            return true;
        }

        if (lobby.isDealer && lobby.players.length < 2) {
            await interaction.reply({
                content: "Need at least 2 players to start a dealer game!",
                ephemeral: true,
            });
            return true;
        }

        if (!lobby.isDealer && lobby.players.length < 1) {
            await interaction.reply({
                content: "Need at least 1 player to start!",
                ephemeral: true,
            });
            return true;
        }

        // Clear the countdown interval
        if (lobby.countdownInterval) {
            clearInterval(lobby.countdownInterval);
        }

        // Start the game immediately
        await this.startMultiplayerGame(interaction.channel, gameManager);

        // Send confirmation that game started
        /* await interaction.reply({
            content: "Game started! Click 'View Hand' to see your cards.",
            ephemeral: true,
        }); */

        return true;
    }

    recordGameOutcome(gameData, winners, losers, pushes) {
        const gameStats = require("../gameStats");

        // Record outcome for each player
        for (const player of gameData.players) {
            let winnerId = null;
            if (winners.some((w) => w.includes(player.name))) {
                winnerId = player.id;
            } else if (pushes.some((p) => p.includes(player.name))) {
                winnerId = "tie";
            } else {
                winnerId = "dealer";
            }

            const outcomeData = {
                server_id: gameData.serverId,
                game_type: "blackjack",
                player1_id: player.id,
                player1_name: player.name,
                player2_id: "ai_player",
                player2_name: "Dealer",
                winner_id: winnerId,
                game_duration: gameData.startTime
                    ? Math.floor((Date.now() - gameData.startTime) / 1000)
                    : null,
                final_score: {
                    player_hand: player.score,
                    dealer_hand: gameData.dealer.score,
                    bet_amount: gameData.bets ? gameData.bets[player.id] : 0,
                    blackjack: player.blackjack || false,
                },
                game_mode: gameData.isSinglePlayer ? "single" : "multiplayer",
            };

            gameStats.recordOutcome(outcomeData);
        }
    }
}

module.exports = new Blackjack();
