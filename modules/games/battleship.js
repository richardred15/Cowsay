const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const battleshipClient = require('../battleshipClient');
const Logger = require('../logger');

class Battleship {
    constructor() {
        this.activeGames = new Map();
        this.client = null;
        battleshipClient.connect();
    }

    setClient(client) {
        this.client = client;
    }

    async start(interaction) {
        const gameKey = `battleship_${interaction.user.id}_${Date.now()}`;
        
        return new Promise((resolve) => {
            battleshipClient.createGame(async (apiMessage) => {
                if (apiMessage.type === 'game_created') {
                    const gameData = {
                        type: 'battleship',
                        gameId: apiMessage.gameId,
                        player1Link: apiMessage.player1Link,
                        player2Link: apiMessage.player2Link,
                        creator: interaction.user.id,
                        channelId: interaction.channel.id,
                        messageId: null,
                        player2Claimed: false,
                        lastHitPlayer: null,
                        startTime: Date.now(),
                        serverId: interaction.guild?.id
                    };

                    this.activeGames.set(gameKey, gameData);
                    
                    // Send player 1 link as ephemeral
                    await interaction.reply({
                        content: `🚢 **Your Player 1 link:** ${gameData.player1Link}`,
                        flags: MessageFlags.Ephemeral
                    });
                    
                    // Get initial ASCII and create embed
                    battleshipClient.getAscii(apiMessage.gameId, async (asciiMessage) => {
                        if (asciiMessage.type === 'ascii_response') {
                            await this.sendGameEmbed(interaction, gameData, asciiMessage.ascii);
                        }
                    });

                    // Subscribe to game updates
                    battleshipClient.subscribeGame(apiMessage.gameId, (updateMessage) => {
                        this.handleGameUpdate(gameData, updateMessage);
                    });
                    
                    resolve({ gameKey, gameData });
                } else if (apiMessage.type === 'error') {
                    await interaction.reply({ content: '❌ Failed to create battleship game: ' + apiMessage.message, flags: MessageFlags.Ephemeral });
                    resolve(null);
                }
            });
        });
    }

    async sendGameEmbed(interaction, gameData, ascii) {
        const embed = new EmbedBuilder()
            .setTitle('🚢 Battleship Game')
            .setDescription(ascii)
            .setColor(0x0066cc)
            .setFooter({ text: `Game ID: ${gameData.gameId}` });

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`bs_get_p2_${gameData.gameId}`)
                .setLabel('Get Player 2 Link')
                .setStyle(ButtonStyle.Primary)
        );

        const followUp = await interaction.followUp({ 
            embeds: [embed], 
            components: gameData.player2Claimed ? [] : [buttons] 
        });
        
        gameData.messageId = followUp.id;
    }

    async handleInteraction(interaction, gameData, gameKey, gameManager) {
        if (!interaction.customId.startsWith('bs_')) return false;

        if (interaction.customId.startsWith('bs_get_p2_')) {
            const gameId = interaction.customId.split('_')[3];
            const game = Array.from(this.activeGames.values()).find(g => g.gameId === gameId);
            
            if (!game) {
                await interaction.reply({ content: '❌ Game not found!', flags: MessageFlags.Ephemeral });
                return true;
            }

            if (game.player2Claimed) {
                await interaction.reply({ content: '❌ Player 2 link already claimed!', flags: MessageFlags.Ephemeral });
                return true;
            }

            // Send player 2 link as ephemeral
            await interaction.reply({ 
                content: `🚢 **Player 2 Link:** ${game.player2Link}`, 
                flags: MessageFlags.Ephemeral
            });

            // Mark as claimed and record Player 2 Discord ID
            game.player2Claimed = true;
            game.player2Id = interaction.user.id;
            game.player2Name = interaction.user.displayName;
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            await interaction.message.edit({ embeds: [embed], components: [] });
            
            return true;
        }

        return false;
    }

    async handleGameUpdate(gameData, updateMessage) {
        try {
            if (updateMessage.type === 'game_update') {
                // Track last hit for winner determination
                if (updateMessage.updateType === 'attack' && updateMessage.data?.hit) {
                    gameData.lastHitPlayer = updateMessage.data.player || 'unknown';
                }

                // Get updated ASCII
                battleshipClient.getAscii(gameData.gameId, async (asciiMessage) => {
                    if (asciiMessage.type === 'ascii_response') {
                        await this.updateGameEmbed(gameData, asciiMessage.ascii, updateMessage);
                    }
                });
            } else if (updateMessage.type === 'ascii_response') {
                await this.updateGameEmbed(gameData, updateMessage.ascii, null);
            }
        } catch (error) {
            Logger.error('Battleship update error', error.message);
        }
    }

    async updateGameEmbed(gameData, ascii, updateMessage) {
        try {
            if (!this.client) {
                Logger.error('Discord client not available for battleship embed update');
                return;
            }
            
            const channel = await this.client.channels.fetch(gameData.channelId);
            const message = await channel.messages.fetch(gameData.messageId);

            let title = '🚢 Battleship Game';
            let color = 0x0066cc;

            // Check for game over
            if (updateMessage?.data?.phase === 'gameover') {
                title = '🏆 Battleship Game - GAME OVER!';
                color = 0x00ff00;
                
                // Determine winner based on last hit
                if (gameData.lastHitPlayer && gameData.lastHitPlayer !== 'unknown') {
                    title += ` Winner: Player ${gameData.lastHitPlayer}`;
                }
                
                // Award coins and record game outcome
                await this.awardCoins(gameData, updateMessage);
                this.recordGameOutcome(gameData, updateMessage);

                // Clean up
                battleshipClient.unsubscribe(gameData.gameId);
                // Find and remove from activeGames by gameId
                for (const [key, data] of this.activeGames) {
                    if (data.gameId === gameData.gameId) {
                        this.activeGames.delete(key);
                        break;
                    }
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(ascii)
                .setColor(color)
                .setFooter({ text: `Game ID: ${gameData.gameId}` });

            await message.edit({ embeds: [embed], components: gameData.player2Claimed || updateMessage?.data?.phase === 'gameover' ? [] : message.components });
        } catch (error) {
            Logger.error('Failed to update battleship embed', error.message);
        }
    }

    async awardCoins(gameData, updateMessage) {
        const currencyManager = require('../currencyManager');
        
        // Check for perfect game (no hits taken) - would need API support
        // For now, just award standard rewards
        const baseReward = 100;
        
        // Award coins to winner (100 for battleship win)
        if (gameData.lastHitPlayer === '1') {
            const winReward = await currencyManager.awardCoins(gameData.creator, baseReward, 'Battleship win');
            gameData.winnerReward = winReward;
            // Participation for Player 2
            if (gameData.player2Id) {
                await currencyManager.awardCoins(gameData.player2Id, 15, 'Battleship participation');
            }
        } else if (gameData.lastHitPlayer === '2' && gameData.player2Id) {
            const winReward = await currencyManager.awardCoins(gameData.player2Id, baseReward, 'Battleship win');
            gameData.winnerReward = winReward;
            // Participation for Player 1
            await currencyManager.awardCoins(gameData.creator, 15, 'Battleship participation');
        }
    }

    recordGameOutcome(gameData, updateMessage) {
        const gameStats = require('../gameStats');
        
        // For battleship, we don't have specific player info, so we'll use generic data
        const winnerId = gameData.lastHitPlayer === '1' ? 'player1' : gameData.lastHitPlayer === '2' ? 'player2' : 'unknown';
        
        const outcomeData = {
            server_id: gameData.serverId || 'unknown',
            game_type: 'battleship',
            player1_id: gameData.creator,
            player1_name: 'Player 1',
            player2_id: 'player2',
            player2_name: 'Player 2',
            winner_id: winnerId,
            game_duration: gameData.startTime ? Math.floor((Date.now() - gameData.startTime) / 1000) : null,
            final_score: {
                game_id: gameData.gameId,
                winner_player: gameData.lastHitPlayer
            },
            game_mode: 'multiplayer'
        };
        
        gameStats.recordOutcome(outcomeData);
    }
}

module.exports = new Battleship();