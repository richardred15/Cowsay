const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const Logger = require("../logger");

class Pong {
    constructor() {
        this.activeGames = new Map();
        this.width = 30;
        this.height = 10;
    }

    async start(message) {
        const gameKey = `pong_${message.author.id}_${Date.now()}`;

        const gameData = {
            type: "pong",
            phase: "waiting",
            player1: {
                id: message.author.id,
                name: message.author.displayName,
                paddle: 4,
            },
            player2: null,
            ball: { x: 10, y: 5, dx: 1, dy: 1 },
            scores: { player1: 0, player2: 0 },
            messageId: null,
            gameInterval: null,
        };

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
            name: interaction.user.displayName,
            paddle: 4,
        };
        game.phase = "countdown";

        // Acknowledge the interaction immediately
        await interaction.deferUpdate();
        await this.startCountdown(interaction, game);
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
        } else if (game.player2 && game.player2.id === userId) {
            player = game.player2;
        } else {
            await interaction.reply({
                content: "❌ You are not in this game!",
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
                this.startGameLoop(interaction, game);
            }
        }, 1000);
    }

    startGameLoop(interaction, game) {
        game.gameInterval = setInterval(async () => {
            this.updateBall(game);

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

    updateBall(game) {
        if (game.phase !== "playing") return;

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

        if (game.phase === "waiting") {
            description = `**${game.player1.name}** is waiting for an opponent!\nClick "Join Game" to play!`;
        } else if (game.phase === "countdown") {
            description = statusMessage || "Get ready!";
        } else if (game.phase === "playing") {
            description = `**${game.player1.name}** vs **${game.player2.name}**`;
        } else if (game.phase === "ended") {
            const winner =
                game.scores.player1 >= 5
                    ? game.player1.name
                    : game.player2.name;
            description = `🎉 **${winner}** wins!`;
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
                value: `${game.player1.name}: ${game.scores.player1} | ${game.player2.name}: ${game.scores.player2}`,
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
}

module.exports = new Pong();
