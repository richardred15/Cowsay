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
        this.waitTimeRequests = new Map(); // Store callback/payload by request ID
        this.customRequests = new Map(); // Store callback/payload by request ID
    }

    generateRequestId() {
        return Math.random().toString(36).substring(2, 10);
    }

    addRequestIdToComponents(components, requestId) {
        return components.map(row => {
            const newRow = new ActionRowBuilder();
            row.components.forEach(component => {
                const newComponent = ButtonBuilder.from(component)
                    .setCustomId(`gameUI_custom_${requestId}_${component.data.custom_id}`);
                newRow.addComponents(newComponent);
            });
            return newRow;
        });
    }

    async requestCustomAction(interaction, embed, components, callback, payload = {}, options = {}) {
        const requestId = this.generateRequestId();
        
        // Store callback and payload
        this.customRequests.set(requestId, { callback, payload });
        
        // Modify button custom IDs to include gameUI prefix and request ID
        const modifiedComponents = this.addRequestIdToComponents(components, requestId);
        
        if (options.updateOriginal) {
            await interaction.update({ embeds: [embed], components: modifiedComponents });
        } else {
            await interaction.reply({ embeds: [embed], components: modifiedComponents, flags: MessageFlags.Ephemeral });
            this.customRequests.get(requestId).originalInteraction = interaction;
        }
    }

    createBetButtons(amounts, balance, requestId) {
        const row1 = new ActionRowBuilder();
        const row2 = new ActionRowBuilder();

        // Add preset amounts
        for (let i = 0; i < Math.min(3, amounts.length); i++) {
            const amount = amounts[i];
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`bet_${amount}`)
                    .setLabel(`🪙 ${amount} coins`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(balance < amount)
            );
        }

        for (let i = 3; i < amounts.length; i++) {
            const amount = amounts[i];
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId(`bet_${amount}`)
                    .setLabel(`🪙 ${amount} coins`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(balance < amount)
            );
        }

        return [row1, row2];
    }

    async requestBetAmount(interaction, callback, payload = {}, options = {}) {
        const balance = await currencyManager.getBalance(interaction.user.id);
        const amounts = options.amounts || [10, 25, 50, 100, 250, 500];
        const minBet = options.minBet || amounts[0];

        if (balance < minBet) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Insufficient Funds")
                .setDescription(
                    `You need at least **${minBet}** coins to play.\nYour balance: **${balance}** coins`
                )
                .setColor(0xff0000);

            if (options.updateOriginal) {
                return await interaction.update({ embeds: [embed], components: [] });
            } else {
                return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎰 ${options.title || "Place Your Bet"}`)
            .setDescription(
                `Your balance: **${balance}** coins\n${options.description || "Choose your bet amount:"}`
            )
            .setColor(0x00ae86);

        const components = this.createBetButtons(amounts, balance);
        
        await this.requestCustomAction(interaction, embed, components, callback, { ...payload, minBet }, options);
    }

    createWaitTimeButtons(times, labels) {
        const buttons = new ActionRowBuilder();
        for (let i = 0; i < Math.min(times.length, 5); i++) {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`wait_${times[i]}`)
                    .setLabel(labels[i] || `${times[i]} seconds`)
                    .setStyle(i === times.length - 1 ? ButtonStyle.Secondary : ButtonStyle.Primary)
            );
        }
        return [buttons];
    }

    async requestWaitTime(interaction, callback, payload = {}, options = {}) {
        const times = options.times || [30, 60, 120];
        const labels = options.labels || ["30 seconds", "60 seconds", "2 minutes"];

        const embed = new EmbedBuilder()
            .setTitle(`⏰ ${options.title || "Wait Time Selection"}`)
            .setDescription(
                options.description || "How long should we wait for other players to join?"
            )
            .setColor(0x00ae86);

        const components = this.createWaitTimeButtons(times, labels);
        
        await this.requestCustomAction(interaction, embed, components, callback, payload, options);
    }

    async handleGameUIInteraction(interaction) {
        const customId = interaction.customId;

        // Handle custom actions
        if (customId.startsWith("gameUI_custom_")) {
            const parts = customId.split("_");
            const requestId = parts[2];
            const originalCustomId = parts.slice(3).join("_");

            const request = this.customRequests.get(requestId);
            if (!request) return false;

            // Delete the selection message
            try {
                if (request.originalInteraction) {
                    await request.originalInteraction.deleteReply();
                }
            } catch (error) {
                // Message already deleted or expired
            }

            this.customRequests.delete(requestId);
            
            // Parse value from original custom ID for bet/wait actions
            let value = originalCustomId;
            if (originalCustomId.startsWith("bet_")) {
                value = parseInt(originalCustomId.split("_")[1]);
            } else if (originalCustomId.startsWith("wait_")) {
                value = parseInt(originalCustomId.split("_")[1]);
            }
            
            return await request.callback(interaction, value, request.payload);
        }



        // Handle custom bet modal submission
        if (customId.startsWith("gameUI_modal_")) {
            if (!interaction.isModalSubmit()) return false;

            const requestId = customId.split("_")[2];
            const request = this.betRequests.get(requestId);
            if (!request) return false;

            const betAmountInput =
                interaction.fields.getTextInputValue("bet_amount");
            const balance = await currencyManager.getBalance(
                interaction.user.id
            );
            const betAmount = parseInt(betAmountInput);

            if (isNaN(betAmount)) {
                await interaction.reply({
                    content: "❌ Please enter a valid number!",
                    flags: MessageFlags.Ephemeral,
                });
                return true;
            }

            if (betAmount < request.minBet) {
                await interaction.reply({
                    content: `❌ Minimum bet is ${request.minBet} coins!`,
                    flags: MessageFlags.Ephemeral,
                });
                return true;
            }

            if (betAmount > balance) {
                await interaction.reply({
                    content: `❌ You only have ${balance} coins!`,
                    flags: MessageFlags.Ephemeral,
                });
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
            return await request.callback(
                interaction,
                betAmount,
                request.payload
            );
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
                if (interaction.replied || interaction.deferred) {
                    await interaction.deleteReply();
                }
            } catch (error) {
                // Message already deleted or interaction expired
            }
        }, delay);
    }
}

module.exports = new GameUI();
