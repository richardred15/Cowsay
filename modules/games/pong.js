const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const BaseGame = require('./baseGame');
const gameRewards = require('./gameRewards');
const gameStats = require('../gameStats');
const Logger = require("../logger");

class Pong extends BaseGame {
    constructor() {
        super('pong');
        this.activeGames = new Map();
        this.width = 30;
        this.height = 10;
    }

    async start(message) {
        const gameKey = `pong_${message.author.id}_${Date.now()}`;

        const gameData = this.createBaseGameData(message.author, message.guild?.id, {
            phase: "waiting",
            player1: {
                id: message.author.id,
                name: this.sanitizePlayerName(message.author.displayName),
                paddle: 4,
            },
            player2: null,
            ball: {
                x: Math.floor(this.width / 2),
                y: Math.floor(this.height / 2),
                dx: 1,
                dy: 1
            },
            scores: { player1: 0, player2: 0 },
            messageId: null,
            gameInterval: null,
        });

        Logger.debug('Pong game started', { gameKey, playerId: message.author.id });

        this.activeGames.set(gameKey, gameData);

        const embed = this.createGameEmbed(gameData);
        const components = this.createGameComponents(gameData);

        const reply = await message.reply({ embeds: [embed], components });
        gameData.messageId = reply.id;

        return { gameKey, gameData };
    }

    async handleInteraction(interaction, gameData, gameKey, gameManager) {
        if (!interaction.customId.startsWith("pong_")) return false;

        const game = gameData || this.findGameByMessage(interaction.message.id);
        if (!game) {
            await interaction.reply({
                content: "❌ Game not found!",
                flags: require("discord.js").MessageFlags.Ephemeral,
            });
            return true;
        }

        try {
            if (interaction.customId === "pong_join") {
                await this.handleJoin(interaction, game);
            } else if (interaction.customId === "pong_ai") {
                await this.handleAI(interaction, game);
            } else if (interaction.customId === "pong_up") {
                await this.handlePaddleMove(interaction, game, -1);
            } else if (interaction.customId === "pong_down") {
                await this.handlePaddleMove(interaction, game, 1);
            }
            return true;
        } catch (error) {
            Logger.error("Pong interaction error", error.message);
            await interaction.reply({
                content: "❌ Game error occurred!",
                flags: require("discord.js").MessageFlags.Ephemeral,
            });
            return true;
        }
    }

    async handleJoin(interaction, game) {
        if (game.player2) {
            await interaction.reply({
                content: "❌ Game is full!",
                flags: require("discord.js").MessageFlags.Ephemeral,
            });
            return;
        }

        if (game.player1.id === interaction.user.id) {
            await interaction.reply({
                content: "❌ You are already in this game!",
                flags: require("discord.js").MessageFlags.Ephemeral,
            });
            return;
        }

        game.player2 = {
            id: interaction.user.id,
            name: this.sanitizePlayerName(interaction.user.displayName),
            paddle: 4,
        };
        game.phase = "countdown";

        // Acknowledge the interaction immediately
        await interaction.deferUpdate();
        await this.startCountdown(interaction, game);
    }

    async handleAI(interaction, game) {
        if (game.player2) {
            await interaction.reply({
                content: "❌ Game is full!",
                flags: require("discord.js").MessageFlags.Ephemeral,
            });
            return;
        }

        if (game.player1.id === interaction.user.id) {
            game.player2 = { id: "ai_player", name: "AI", paddle: 4, isAI: true };
            game.phase = "countdown";

            // Acknowledge the interaction immediately
            await interaction.deferUpdate();
            await this.startCountdown(interaction, game);
        } else {
            await interaction.reply({
                content: "❌ Only the game creator can start AI mode!",
                flags: require("discord.js").MessageFlags.Ephemeral,
            });
        }
    }

    async handlePaddleMove(interaction, game, direction) {
        if (game.phase !== "playing") {
            await interaction.reply({
                content: "❌ Game is not active!",
                flags: require("discord.js").MessageFlags.Ephemeral,
            });
            return;
        }

        const userId = interaction.user.id;
        let player = null;

        if (game.player1.id === userId) {
            player = game.player1;
        } else if (game.player2 && game.player2.id === userId && !game.player2.isAI) {
            player = game.player2;
        } else {
            await interaction.reply({
                content: "❌ You are not in this game or cannot control AI paddle!",
                flags: require("discord.js").MessageFlags.Ephemeral,
            });
            return;
        }

        // Move paddle (constrain to field bounds)
        player.paddle = Math.max(
            1,
            Math.min(this.height - 2, player.paddle + direction)
        );

        await this.updateGameEmbed(interaction, game);
    }

    async startCountdown(interaction, game) {
        let countdown = 3;

        const countdownInterval = setInterval(async () => {
            if (countdown > 0) {
                game.phase = "countdown";
                const embed = this.createGameEmbed(
                    game,
                    `Game starts in ${countdown}...`
                );
                const components = this.createGameComponents(game);

                try {
                    await interaction.editReply({
                        embeds: [embed],
                        components,
                    });
                } catch (error) {
                    clearInterval(countdownInterval);
                    return;
                }
                countdown--;
            } else {
                clearInterval(countdownInterval);
                game.phase = "playing";
                game.startTime = Date.now(); // Record game start time
                this.startGameLoop(interaction, game);
            }
        }, 1000);
    }

    startGameLoop(interaction, game) {
        game.gameInterval = setInterval(async () => {
            await this.updateBall(game);

            try {
                const embed = this.createGameEmbed(game);
                const components = this.createGameComponents(game);
                await interaction.editReply({ embeds: [embed], components });

                if (game.phase === "ended") {
                    clearInterval(game.gameInterval);
                    this.activeGames.delete(this.findGameKey(game));
                }
            } catch (error) {
                clearInterval(game.gameInterval);
                this.activeGames.delete(this.findGameKey(game));
            }
        }, 1000);
    }

    async updateBall(game) {
        if (game.phase !== "playing") return;

        // AI logic for player 2
        if (game.player2 && game.player2.isAI) {
            const targetY = game.ball.y;
            const currentY = game.player2.paddle;
            
            // Simple AI: move toward ball with some delay/error
            if (Math.abs(targetY - currentY) > 0) {
                if (targetY > currentY && currentY < this.height - 2) {
                    game.player2.paddle = Math.min(this.height - 2, currentY + 1);
                } else if (targetY < currentY && currentY > 1) {
                    game.player2.paddle = Math.max(1, currentY - 1);
                }
            }
        }

        // Move ball
        game.ball.x += game.ball.dx;
        game.ball.y += game.ball.dy;

        // Bounce off top/bottom walls
        if (game.ball.y <= 0 || game.ball.y >= this.height - 1) {
            game.ball.dy *= -1;
            game.ball.y = Math.max(0, Math.min(this.height - 1, game.ball.y));
        }

        // Check paddle collisions
        if (game.ball.x <= 1 && game.ball.dx < 0) {
            // Left paddle (player 1)
            if (Math.abs(game.ball.y - game.player1.paddle) <= 1) {
                game.ball.dx *= -1;
                game.ball.x = 2;
            }
        } else if (game.ball.x >= this.width - 2 && game.ball.dx > 0) {
            // Right paddle (player 2)
            if (
                game.player2 &&
                Math.abs(game.ball.y - game.player2.paddle) <= 1
            ) {
                game.ball.dx *= -1;
                game.ball.x = this.width - 3;
            }
        }

        // Check scoring
        if (game.ball.x < 0) {
            // Player 2 scores
            game.scores.player2++;
            this.resetBall(game);
        } else if (game.ball.x >= this.width) {
            // Player 1 scores
            game.scores.player1++;
            this.resetBall(game);
        }

        // Check win condition
        if (game.scores.player1 >= 5 || game.scores.player2 >= 5) {
            game.phase = "ended";
            
            // Award coins and record game outcome
            await this.awardCoins(game);
            this.recordGameOutcome(game);
        }
    }

    resetBall(game) {
        game.ball.x = Math.floor(this.width / 2);
        game.ball.y = Math.floor(this.height / 2);
        game.ball.dx = Math.random() > 0.5 ? 1 : -1;
        game.ball.dy = Math.random() > 0.5 ? 1 : -1;
    }

    createGameEmbed(game, statusMessage = "") {
        const field = this.renderField(game);

        let title = "🏓 Pong";
        let description = "";

        const player1Name = this.sanitizePlayerName(game.player1.name);
        const player2Name = game.player2 ? this.sanitizePlayerName(game.player2.name) : null;
        
        if (game.phase === "waiting") {
            description = `**${player1Name}** is waiting for an opponent!\nClick "Join Game" to play!`;
        } else if (game.phase === "countdown") {
            description = statusMessage || "Get ready!";
        } else if (game.phase === "playing") {
            description = `**${player1Name}** vs **${player2Name}**`;
        } else if (game.phase === "ended") {
            const winner =
                game.scores.player1 >= 5
                    ? player1Name
                    : player2Name;
            let coinInfo = "";
            if (game.winnerReward && winner !== "AI") {
                coinInfo = `\n🪙 +${game.winnerReward.awarded} coins`;
                if (game.winnerReward.firstWinBonus) coinInfo += " (First win bonus!)";
                if (game.winnerReward.streak > 1) coinInfo += ` (${game.winnerReward.streak} win streak!)`;
            }
            description = `🎉 **${winner}** wins!${coinInfo}`;
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .addFields({
                name: "Game Field",
                value: `\`\`\`\n${field}\n\`\`\``,
                inline: false,
            })
            .setColor(0x00ae86);

        if (game.player2) {
            embed.addFields({
                name: "Score",
                value: `${player1Name}: ${game.scores.player1} | ${player2Name}: ${game.scores.player2}`,
                inline: false,
            });
        }

        return embed;
    }

    renderField(game) {
        const field = [];

        // Create empty field
        for (let y = 0; y < this.height; y++) {
            field[y] = new Array(this.width).fill(" ");
        }

        // Draw boundaries
        for (let x = 0; x < this.width; x++) {
            field[0][x] = "#";
            field[this.height - 1][x] = "#";
        }

        // Draw paddles
        if (game.player1) {
            field[game.player1.paddle - 1][0] = "|";
            field[game.player1.paddle][0] = "|";
            field[game.player1.paddle + 1][0] = "|";
        }

        if (game.player2) {
            field[game.player2.paddle - 1][this.width - 1] = "|";
            field[game.player2.paddle][this.width - 1] = "|";
            field[game.player2.paddle + 1][this.width - 1] = "|";
        }

        // Draw ball
        if (game.phase === "playing" || game.phase === "ended") {
            const ballX = Math.floor(game.ball.x);
            const ballY = Math.floor(game.ball.y);
            if (
                ballX >= 0 &&
                ballX < this.width &&
                ballY >= 0 &&
                ballY < this.height
            ) {
                field[ballY][ballX] = "o";
            }
        }

        return field.map((row) => row.join("")).join("\n");
    }

    createGameComponents(game) {
        const components = [];

        if (game.phase === "waiting") {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("pong_join")
                    .setLabel("Join Game")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("pong_ai")
                    .setLabel("Play vs AI")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("pong_up")
                    .setLabel("↑ Up")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId("pong_down")
                    .setLabel("↓ Down")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );
            components.push(row);
        } else if (game.phase === "playing") {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("pong_up")
                    .setLabel("↑ Up")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("pong_down")
                    .setLabel("↓ Down")
                    .setStyle(ButtonStyle.Primary)
            );
            components.push(row);
        }

        return components;
    }

    async updateGameEmbed(interaction, game) {
        const embed = this.createGameEmbed(game);
        const components = this.createGameComponents(game);

        try {
            await interaction.update({ embeds: [embed], components });
        } catch (error) {
            await interaction.message.edit({ embeds: [embed], components });
        }
    }

    findGameByMessage(messageId) {
        for (const [key, game] of this.activeGames) {
            if (game.messageId === messageId) return game;
        }
        return null;
    }

    findGameKey(gameData) {
        for (const [key, game] of this.activeGames) {
            if (game === gameData) return key;
        }
        return null;
    }

    async awardCoins(game) {
        const winnerId = game.scores.player1 >= 5 ? game.player1.id : game.player2.id;
        const loserId = winnerId === game.player1.id ? game.player2.id : game.player1.id;
        const winnerScore = winnerId === game.player1.id ? game.scores.player1 : game.scores.player2;
        const loserScore = winnerId === game.player1.id ? game.scores.player2 : game.scores.player1;
        
        Logger.info('Pong game ended, awarding coins');
        
        // Check for perfect game (shutout 5-0)
        const isPerfectGame = winnerScore === 5 && loserScore === 0;
        const outcome = isPerfectGame ? 'perfect' : 'win';
        
        // Award coins to winner
        if (winnerId === game.player1.id) {
            const winReward = await gameRewards.awardGameReward(winnerId, this.gameType, outcome);
            game.winnerReward = winReward;
        } else if (!game.player2.isAI) {
            const winReward = await gameRewards.awardGameReward(winnerId, this.gameType, outcome);
            game.winnerReward = winReward;
        }
        
        // Award participation coins to loser and handle streak
        if (loserId === game.player1.id) {
            await gameRewards.awardGameReward(loserId, this.gameType, 'participation');
        } else if (!game.player2.isAI && loserId === game.player2.id) {
            await gameRewards.awardGameReward(loserId, this.gameType, 'participation');
        }
    }

    recordGameOutcome(game) {
        if (!game.player2) return; // Need both players
        
        const winner = game.scores.player1 >= 5 ? game.player1.id : game.player2.id;
        const players = [
            { id: game.player1.id, name: this.sanitizePlayerName(game.player1.name) },
            { id: game.player2.id, name: this.sanitizePlayerName(game.player2.name) }
        ];
        
        gameStats.recordGameOutcome(
            this.gameType,
            game,
            winner,
            players,
            {
                finalScore: {
                    player1_score: game.scores.player1,
                    player2_score: game.scores.player2
                },
                gameMode: game.player2.isAI ? 'vs_ai' : 'multiplayer'
            }
        );
    }
}

module.exports = new Pong();
