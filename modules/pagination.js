const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class Pagination {
    static async create(message, title, items, itemsPerPage = 20) {
        const pages = [];
        for (let i = 0; i < items.length; i += itemsPerPage) {
            pages.push(items.slice(i, i + itemsPerPage));
        }

        if (pages.length === 0) {
            pages.push([]);
        }

        let currentPage = 0;

        const generateEmbed = (page) => {
            const commands = pages[page].join('\n') || 'No items';
            const embed = new EmbedBuilder()
                .setTitle(`🐄 ${title}`)
                .setDescription(`\`\`\`\n${commands}\n\`\`\``)
                .setColor(0x00AE86)
                .setFooter({ 
                    text: `Page ${page + 1} of ${pages.length} • ${items.length} total commands`,
                    iconURL: message.author.displayAvatarURL()
                })
                .setTimestamp();
            return embed;
        };

        const generateButtons = (page) => {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev')
                        .setLabel('◀')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('▶')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === pages.length - 1)
                );
        };

        if (pages.length === 1) {
            return message.reply({ embeds: [generateEmbed(0)] });
        }

        const response = await message.reply({
            embeds: [generateEmbed(currentPage)],
            components: [generateButtons(currentPage)]
        });

        const collector = response.createMessageComponentCollector({
            time: 60000
        });

        collector.on('collect', async (interaction) => {
            // Basic authorization check - only message author can use buttons
            if (interaction.user.id !== message.author.id) {
                await interaction.reply({ content: 'Only the command user can navigate pages.', flags: require('discord.js').MessageFlags.Ephemeral });
                return;
            }
            
            try {
                if (interaction.customId === 'prev' && currentPage > 0) {
                    currentPage--;
                } else if (interaction.customId === 'next' && currentPage < pages.length - 1) {
                    currentPage++;
                }

                await interaction.update({
                    embeds: [generateEmbed(currentPage)],
                    components: [generateButtons(currentPage)]
                });
            } catch (error) {
                console.error('Pagination interaction error:', error);
            }
        });

        collector.on('end', () => {
            response.edit({ components: [] }).catch(() => {});
        });
    }
}

module.exports = Pagination;