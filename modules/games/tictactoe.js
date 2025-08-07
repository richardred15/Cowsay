const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class TicTacToe {
    async start(message, opponent = null) {
        const userId = message.author.id;
        const gameKey = opponent ? `${userId}_${opponent.id}` : userId;
        
        const gameData = {
            type: "tictactoe",
            board: Array(9).fill(null),
            currentPlayer: "X",
            gameOver: false,
            winner: null,
            isMultiplayer: !!opponent,
            player1: { id: userId, name: message.author.displayName, symbol: "X" },
            player2: opponent ? { id: opponent.id, name: opponent.displayName, symbol: "O" } : { name: "Cowsay", symbol: "O" }
        };

        const embed = this.createEmbed(gameData);
        const buttons = this.createButtons(gameData);

        await message.reply({ embeds: [embed], components: buttons });
        return { gameKey, gameData };
    }

    async handleInteraction(interaction, gameData, gameKey, gameManager) {
        if (!interaction.customId.startsWith("ttt_")) return false;

        const userId = interaction.user.id;
        const isPlayer1 = userId === gameData.player1.id;
        const isPlayer2 = userId === gameData.player2.id;
        const currentSymbol = gameData.currentPlayer;
        
        if ((currentSymbol === "X" && !isPlayer1) || (currentSymbol === "O" && !isPlayer2)) {
            await interaction.reply({ content: "It's not your turn!", ephemeral: true });
            return true;
        }

        const position = parseInt(interaction.customId.split("_")[1]);
        gameData.board[position] = currentSymbol;
        gameData.currentPlayer = currentSymbol === "X" ? "O" : "X";

        this.checkGameEnd(gameData);

        if (!gameData.gameOver && !gameData.isMultiplayer) {
            this.makeBotMove(gameData);
            this.checkGameEnd(gameData);
        }

        const embed = this.createEmbed(gameData);
        const buttons = this.createButtons(gameData);

        await interaction.update({ embeds: [embed], components: buttons });

        if (gameData.gameOver) {
            gameManager.activeGames.delete(gameKey);
        }

        return true;
    }

    createEmbed(gameData) {
        const { board, currentPlayer, gameOver, winner, player1, player2 } = gameData;

        let boardDisplay = "\n";
        for (let i = 0; i < 9; i += 3) {
            const row = ` ${this.getCellDisplay(board[i])} | ${this.getCellDisplay(board[i + 1])} | ${this.getCellDisplay(board[i + 2])} `;
            boardDisplay += row + "\n";
            if (i < 6) boardDisplay += "---|---|---\n";
        }
        boardDisplay += "\n";

        let status = "";
        if (gameOver) {
            if (winner === "X") status = `🎉 ${player1.name} wins!`;
            else if (winner === "O") status = player2.name === "Cowsay" ? "🐄 Cowsay wins! Moo!" : `🎉 ${player2.name} wins!`;
            else status = "🤝 It's a tie!";
        } else {
            const currentPlayerName = currentPlayer === "X" ? player1.name : player2.name;
            status = `🔴 ${currentPlayerName}'s turn (${currentPlayer})`;
        }

        return new EmbedBuilder()
            .setTitle("🎮 Tic-Tac-Toe")
            .setDescription(`\`\`\`\n${boardDisplay}\`\`\``)
            .addFields(
                { name: "Players", value: `${player1.name} (X) vs ${player2.name} (O)`, inline: true },
                { name: "Game Status", value: status, inline: true }
            )
            .setColor(gameOver ? (winner === "X" ? 0x00ff00 : winner === "O" ? 0xff0000 : 0xffff00) : 0x00ae86);
    }

    getCellDisplay(cell) {
        if (cell === "X") return "X";
        if (cell === "O") return "O";
        return " ";
    }

    createButtons(gameData) {
        const rows = [];
        for (let i = 0; i < 9; i += 3) {
            const row = new ActionRowBuilder();
            for (let j = 0; j < 3; j++) {
                const pos = i + j;
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ttt_${pos}`)
                        .setLabel(gameData.board[pos] || (pos + 1).toString())
                        .setStyle(gameData.board[pos] ? ButtonStyle.Secondary : ButtonStyle.Primary)
                        .setDisabled(gameData.board[pos] !== null || gameData.gameOver)
                );
            }
            rows.push(row);
        }
        return rows;
    }

    makeBotMove(gameData) {
        const { board } = gameData;
        let move = this.findWinningMove(board, "O");
        if (move !== -1) {
            board[move] = "O";
            gameData.currentPlayer = "X";
            return;
        }
        
        move = this.findWinningMove(board, "X");
        if (move !== -1) {
            board[move] = "O";
            gameData.currentPlayer = "X";
            return;
        }
        
        if (board[4] === null) {
            board[4] = "O";
            gameData.currentPlayer = "X";
            return;
        }
        
        const available = board.map((cell, i) => cell === null ? i : null).filter(i => i !== null);
        if (available.length > 0) {
            board[available[Math.floor(Math.random() * available.length)]] = "O";
            gameData.currentPlayer = "X";
        }
    }

    findWinningMove(board, player) {
        const lines = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
        for (const line of lines) {
            const [a, b, c] = line;
            if (board[a] === player && board[b] === player && board[c] === null) return c;
            if (board[a] === player && board[c] === player && board[b] === null) return b;
            if (board[b] === player && board[c] === player && board[a] === null) return a;
        }
        return -1;
    }

    checkGameEnd(gameData) {
        const { board } = gameData;
        const lines = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
        
        for (const line of lines) {
            const [a, b, c] = line;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                gameData.gameOver = true;
                gameData.winner = board[a];
                return;
            }
        }
        
        if (board.every(cell => cell !== null)) {
            gameData.gameOver = true;
            gameData.winner = null;
        }
    }
}

module.exports = new TicTacToe();