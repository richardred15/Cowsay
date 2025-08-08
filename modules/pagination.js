const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class Pagination {
    static getCollectorTimeout() {
        return 60000; // 1 minute - configurable
    }

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
            const pageItems = pages[page].join('\n') || 'No items';
            const embed = new EmbedBuilder()
                .setTitle(`🐄 ${title}`)
                .setDescription(pageItems)
                .setColor(0x00AE86)
                .setFooter({ 
                    text: `Page ${page + 1} of ${pages.length} • ${items.length} total items`,
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
            time: this.getCollectorTimeout()
        });

        collector.on('collect', async (interaction) => {
            // Enhanced authorization check
            const SecurityUtils = require('./security');
            const authorized = await SecurityUtils.validateAuthorization(interaction, 'user');
            if (!authorized || interaction.user.id !== message.author.id) {
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
    
    static async createEmbedPagination(message, embeds, title = 'Pages') {
        if (!embeds || embeds.length === 0) {
            return message.reply('No content to display.');
        }
        
        let currentPage = 0;
        
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
                        .setDisabled(page === embeds.length - 1)
                );
        };
        
        // Update embed with page info
        const updateEmbed = (embed, page) => {
            const updatedEmbed = EmbedBuilder.from(embed);
            const currentFooter = embed.data.footer?.text || '';
            const pageInfo = `Page ${page + 1} of ${embeds.length}`;
            
            if (currentFooter) {
                updatedEmbed.setFooter({ 
                    text: `${currentFooter} • ${pageInfo}`,
                    iconURL: embed.data.footer?.icon_url
                });
            } else {
                updatedEmbed.setFooter({ text: pageInfo });
            }
            
            return updatedEmbed;
        };
        
        if (embeds.length === 1) {
            return message.reply({ embeds: [updateEmbed(embeds[0], 0)] });
        }
        
        const response = await message.reply({
            embeds: [updateEmbed(embeds[currentPage], currentPage)],
            components: [generateButtons(currentPage)]
        });
        
        const collector = response.createMessageComponentCollector({
            time: this.getCollectorTimeout()
        });
        
        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) {
                await interaction.reply({ 
                    content: 'Only the command user can navigate pages.', 
                    flags: require('discord.js').MessageFlags.Ephemeral 
                });
                return;
            }
            
            try {
                if (interaction.customId === 'prev' && currentPage > 0) {
                    currentPage--;
                } else if (interaction.customId === 'next' && currentPage < embeds.length - 1) {
                    currentPage++;
                }
                
                await interaction.update({
                    embeds: [updateEmbed(embeds[currentPage], currentPage)],
                    components: [generateButtons(currentPage)]
                });
            } catch (error) {
                console.error('Embed pagination interaction error:', error);
            }
        });
        
        collector.on('end', () => {
            response.edit({ components: [] }).catch(() => {});
        });
    }
}

module.exports = Pagination;