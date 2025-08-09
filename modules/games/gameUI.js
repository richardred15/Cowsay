const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require("discord.js");
const currencyManager = require("../currencyManager");

class GameUI {
    constructor() {
        this.betRequests = new Map(); // Store callback/payload by request ID
    }

    generateRequestId() {
        return Math.random().toString(36).substring(2, 10);
    }

    async requestBetAmount(interaction, callback, payload = {}, options = {}) {
        const requestId = this.generateRequestId();
        const balance = await currencyManager.getBalance(interaction.user.id);
        const amounts = options.amounts || [10, 25, 50, 100, 250];
        const minBet = options.minBet || amounts[0];
        const useOriginalMessage = options.updateOriginal || false;

        // Store callback and payload
        this.betRequests.set(requestId, { callback, payload, minBet });

        if (balance < minBet) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Insufficient Funds")
                .setDescription(`You need at least **${minBet}** coins to play.\nYour balance: **${balance}** coins`)
                .setColor(0xff0000);
            
            if (useOriginalMessage) {
                return await interaction.update({ embeds: [embed], components: [] });
            } else {
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎰 ${options.title || "Place Your Bet"}`)
            .setDescription(`Your balance: **${balance}** coins\n${options.description || "Choose your bet amount:"}`)
            .setColor(0x00ae86);

        const row1 = new ActionRowBuilder();
        const row2 = new ActionRowBuilder();

        // Add preset amounts
        for (let i = 0; i < Math.min(3, amounts.length); i++) {
            const amount = amounts[i];
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`gameUI_bet_${requestId}_${amount}`)
                    .setLabel(`🪙 ${amount} coins`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(balance < amount)
            );
        }

        for (let i = 3; i < amounts.length; i++) {
            const amount = amounts[i];
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId(`gameUI_bet_${requestId}_${amount}`)
                    .setLabel(`🪙 ${amount} coins`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(balance < amount)
            );
        }

        row2.addComponents(
            new ButtonBuilder()
                .setCustomId(`gameUI_custom_${requestId}`)
                .setLabel("💰 Custom")
                .setStyle(ButtonStyle.Secondary)
        );

        if (useOriginalMessage) {
            await interaction.update({ embeds: [embed], components: [row1, row2] });
        } else {
            await interaction.reply({ embeds: [embed], components: [row1, row2], flags: MessageFlags.Ephemeral });
            this.betRequests.get(requestId).originalInteraction = interaction;
        }
    }

    async handleGameUIInteraction(interaction) {
        const customId = interaction.customId;
        
        // Handle preset bet amounts
        if (customId.startsWith('gameUI_bet_')) {
            const parts = customId.split('_');
            const requestId = parts[2];
            const amount = parseInt(parts[3]);
            
            const request = this.betRequests.get(requestId);
            if (!request) return false;
            
            // Delete the bet selection message
            try {
                if (request.originalInteraction) {
                    await request.originalInteraction.deleteReply();
                }
            } catch (error) {
                // Message already deleted or expired
            }
            
            this.betRequests.delete(requestId);
            return await request.callback(interaction, amount, request.payload);
        }
        
        // Handle custom bet button
        if (customId.startsWith('gameUI_custom_')) {
            const requestId = customId.split('_')[2];
            const request = this.betRequests.get(requestId);
            if (!request) return false;
            
            const balance = await currencyManager.getBalance(interaction.user.id);
            const modalId = `gameUI_modal_${requestId}`;
            
            const modal = new ModalBuilder()
                .setCustomId(modalId)
                .setTitle("Custom Bet Amount");
                
            const betInput = new TextInputBuilder()
                .setCustomId("bet_amount")
                .setLabel("Enter bet amount (coins)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(`${request.minBet} - ${balance}`)
                .setRequired(true)
                .setMaxLength(10);

            modal.addComponents(new ActionRowBuilder().addComponents(betInput));
            await interaction.showModal(modal);
            return true;
        }
        
        // Handle custom bet modal submission
        if (customId.startsWith('gameUI_modal_')) {
            if (!interaction.isModalSubmit()) return false;
            
            const requestId = customId.split('_')[2];
            const request = this.betRequests.get(requestId);
            if (!request) return false;
            
            const betAmountInput = interaction.fields.getTextInputValue("bet_amount");
            const balance = await currencyManager.getBalance(interaction.user.id);
            const betAmount = parseInt(betAmountInput);

            if (isNaN(betAmount)) {
                await interaction.reply({ content: "❌ Please enter a valid number!", flags: MessageFlags.Ephemeral });
                return true;
            }

            if (betAmount < request.minBet) {
                await interaction.reply({ content: `❌ Minimum bet is ${request.minBet} coins!`, flags: MessageFlags.Ephemeral });
                return true;
            }

            if (betAmount > balance) {
                await interaction.reply({ content: `❌ You only have ${balance} coins!`, flags: MessageFlags.Ephemeral });
                return true;
            }
            
            // Delete the bet selection message
            try {
                if (request.originalInteraction) {
                    await request.originalInteraction.deleteReply();
                }
            } catch (error) {
                // Message already deleted or expired
            }
            
            this.betRequests.delete(requestId);
            return await request.callback(interaction, betAmount, request.payload);
        }
        
        return false;
    }

    createGameEmbed(gameType, title, gameData, customFields = []) {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(this.getGameColor(gameData.phase));

        for (const field of customFields) {
            embed.addFields(field);
        }

        return embed;
    }

    getGameColor(phase) {
        switch (phase) {
            case "waiting":
                return 0x00ae86;
            case "playing":
                return 0x00ae86;
            case "ended":
                return 0xffd700;
            case "error":
                return 0xff0000;
            default:
                return 0x00ae86;
        }
    }

    formatCoinReward(reward) {
        if (!reward) return "";

        let text = `🪙 +${reward.awarded} coins`;
        if (reward.firstWinBonus) text += " (First win bonus!)";
        if (reward.streak > 1) text += ` (${reward.streak} win streak!)`;

        return text;
    }

    async autoDeleteEphemeral(interaction, delay = 12000) {
        setTimeout(async () => {
            try {
                await interaction.deleteReply();
            } catch (error) {
                // Message already deleted or interaction expired
            }
        }, delay);
    }
}

module.exports = new GameUI();