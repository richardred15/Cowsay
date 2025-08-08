require("dotenv").config();
const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    MessageFlags,
} = require("discord.js");
const cowsay = require("cowsay");
const llmProvider = require("./modules/llmProvider");
const LLMService = require("./modules/llmService");
const SecurityUtils = require("./modules/security");
const Logger = require("./modules/logger");
const rateLimiter = require("./modules/rateLimiter");
const autoReply = require("./modules/autoReply");
const IntentDetector = require("./modules/intentDetector");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const cardRenderer = require("./modules/cardRenderer");

// Import all modules at the top to avoid lazy loading
const characterManager = require("./modules/characterManager");
const toolManager = require("./modules/toolManager");
const commandHandler = require("./modules/commandHandler");
const ChatHandler = require("./modules/chatHandler");
const MentionHandler = require("./modules/mentionHandler");
const AskHandler = require("./modules/askHandler");
const LeaderboardHandler = require("./modules/leaderboardHandler");
const memberCache = require("./modules/memberCache");
const tagManager = require("./modules/tagManager");
const contextBuilder = require("./modules/contextBuilder");
const contextManager = require("./modules/contextManager");
const responseCollapse = require("./modules/responseCollapse");
const gameManager = require("./modules/gameManager");
const currencyManager = require("./modules/currencyManager");
const rivalManager = require("./modules/rivalManager");
const discordPermissions = require("./modules/discordPermissions");
const gameStats = require("./modules/gameStats");
const shopManager = require("./modules/shopManager");
const Pagination = require("./modules/pagination");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

client.once("ready", async () => {
    Logger.info(`Bot logged in as ${client.user.tag}`);
    Logger.info(`Bot is in ${client.guilds.cache.size} guilds`);
    client.guilds.cache.forEach((guild) => {
        Logger.info(
            `Guild: ${guild.name} (${guild.id}) - ${guild.memberCount} members`
        );
    });

    client.user.setPresence({
        activities: [{ name: "with ASCII cows 🐄", type: 0 }],
        status: "online",
    });

    // Initialize database
    const database = require("./modules/database");
    await database.init();

    // Load active games from database
    const balatro = require("./modules/games/balatro");
    await balatro.loadAllActiveGames();

    // Set client reference for battleship game
    const battleship = require("./modules/games/battleship");
    battleship.setClient(client);

    // Register slash commands
    const commands = [
        new SlashCommandBuilder()
            .setName("battleship")
            .setDescription("Create a new battleship game"),
        new SlashCommandBuilder()
            .setName("balatro")
            .setDescription("Start a poker-based scoring game"),
    ];

    console.log(cardRenderer.renderBack());

    try {
        const data = await client.application.commands.set(commands);
        Logger.info(
            `Registered ${data.size} slash commands: ${data
                .map((cmd) => cmd.name)
                .join(", ")}`
        );
    } catch (error) {
        Logger.error("Failed to register slash commands", error.message);
    }

    // Clean up old data every hour
    setInterval(() => {
        try {
            tagManager.cleanupOldData();
            contextManager.cleanup();
            contextManager.cleanupAll();
            rateLimiter.cleanup();
        } catch (error) {
            Logger.error("Cleanup error", error.message);
        }
    }, 60 * 60 * 1000);
});

// Initialize handlers
const llmService = new LLMService(llmProvider);
const chatHandler = new ChatHandler(llmProvider);
const mentionHandler = new MentionHandler(llmProvider, commandHandler);
const askHandler = new AskHandler(llmProvider, commandHandler);
const leaderboardHandler = new LeaderboardHandler(llmProvider, toolManager);
const intentDetector = new IntentDetector();

// Handle interactions (slash commands and buttons)
client.on("interactionCreate", async (interaction) => {
    if (interaction.isCommand()) {
        Logger.info("Command received", {
            command: interaction.commandName,
            user: interaction.user.username,
        });
        if (interaction.commandName === "battleship") {
            Logger.info("Battleship slash command received", {
                user: interaction.user.username,
            });
            const result = await gameManager.startGame(
                interaction,
                "battleship"
            );
            if (!result) {
                Logger.error("Failed to start battleship game");
                await interaction.reply({
                    content: "Failed to start battleship game!",
                    flags: MessageFlags.Ephemeral,
                });
            }
        } else if (interaction.commandName === "balatro") {
            Logger.info("Balatro slash command received", {
                user: interaction.user.username,
            });
            const result = await gameManager.startGame(interaction, "balatro");
            if (!result) {
                Logger.error("Failed to start balatro game");
                await interaction.reply({
                    content: "Failed to start balatro game!",
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
        return;
    }

    if (interaction.isButton()) {
        try {
            // Handle shop purchases
            if (interaction.customId.startsWith('shop_buy_')) {
                const itemId = interaction.customId.replace('shop_buy_', '');
                const result = await shopManager.purchaseItem(interaction.user.id, itemId);
                
                if (result.success) {
                    const embed = new EmbedBuilder()
                        .setTitle("🎉 Purchase Successful!")
                        .setColor(0x00ff00)
                        .setDescription(`${result.message}\n\n${result.item.category === 'character' ? `You can now use \`!${itemId}say <text>\` to use your new character!` : 'Your boost is now active!'}`);
                    
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } else {
                    await interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
                }
                return;
            }
            
            // Try game manager first, if it doesn't handle it, let it fall through
            const gameHandled = await gameManager.handleButtonInteraction(interaction);
            if (gameHandled) {
                return;
            }
            
            // If not handled by game manager, it might be pagination or other system buttons
            // These will be handled by their respective collectors, so we don't need to do anything
        } catch (error) {
            Logger.error("Button interaction error", error.message);
            if (!interaction.replied) {
                await interaction.reply({ content: "❌ An error occurred. Please try again.", ephemeral: true });
            }
        }
    }
});

client.on("messageCreate", async (message) => {
    // Debug: Log all messages to see if event is firing
    Logger.debug("Message received", {
        author: message.author.username,
        content: message.content.substring(0, 50),
        isBot: message.author.bot,
    });

    // Add message to unified context cache (for all messages)
    contextManager.addMessage(message);

    // Debug: Log all bot messages to see what we're getting
    if (message.author.bot && message.author.id !== client.user.id) {
        Logger.info("External bot message received", {
            channel: message.channel.id,
            botName: message.author.username,
            botId: message.author.id,
            hasEmbeds: message.embeds.length > 0,
            contentPreview: message.content.substring(0, 100),
            embedTitle: message.embeds[0]?.title,
            embedDesc: message.embeds[0]?.description?.substring(0, 100),
        });
    }

    // Handle leaderboard bot responses (only for bot messages)
    if (message.author.bot && message.author.id !== client.user.id) {
        if (await leaderboardHandler.handleMessage(message)) {
            return;
        }
        // Check if this is a rival bot
        const isRival = await rivalManager.isRival(message.guild?.id, message.author.id);
        if (!isRival) {
            return;
        }
        
        // Parse rival bot embeds into plain text for context
        if (message.embeds.length > 0) {
            const embedText = message.embeds.map(embed => {
                let text = '';
                if (embed.title) text += embed.title + '\n';
                if (embed.description) text += embed.description + '\n';
                if (embed.fields) {
                    embed.fields.forEach(field => {
                        text += field.name + ': ' + field.value + '\n';
                    });
                }
                return text;
            }).join('\n');
            message.content = (message.content + '\n' + embedText).trim();
        }
        
        console.log('RIVAL MESSAGE STORED TO CONTEXT:', {
            author: message.author.username,
            content: message.content,
            hasEmbeds: message.embeds.length > 0,
            channel: message.channel.id
        });
        
        // Re-add the modified message to context with parsed embed content
        contextManager.addMessage(message);
        
        // Rival bot messages should trigger potential responses
        responseCollapse.shouldCollapse(message, client.user.id);
        return;
    }

    // Handle leaderboard commands (only for user messages)
    if (!message.author.bot) {
        await leaderboardHandler.handleMessage(message);
    }

    // Check rate limits for commands that use resources
    const isCommand =
        message.content.startsWith("!") || message.mentions.has(client.user);
    if (isCommand && !rateLimiter.checkLimits(message.author.id)) {
        message.reply(
            "⚠️ Rate limit exceeded. Please wait a moment before trying again."
        );
        return;
    }

    if (commandHandler.isHelpCommand(message.content)) {
        commandHandler.handleHelpCommand(message);
        return;
    }

    if (commandHandler.isClearCommand(message.content)) {
        commandHandler.handleClearCommand(message);
        return;
    }

    if (commandHandler.isCharactersCommand(message.content)) {
        await commandHandler.handleCharactersCommand(message);
        return;
    }

    if (message.content === "!cowsay games") {
        const embed = gameManager.createGamesEmbed();
        message.reply({ embeds: [embed] });
        return;
    }

    if (message.content === "!cowsay help blackjack") {
        const embed = gameManager.createBlackjackHelpEmbed();
        message.reply({ embeds: [embed] });
        return;
    }

    if (message.content === "!cowsay help rivals") {
        const embed = new EmbedBuilder()
            .setTitle('🔥 Rivals System Help')
            .setColor(0xff4444)
            .setDescription('Configure rivals for Cowsay to interact with! Rivals are other bots that Cowsay will investigate and try to discover commands for.')
            .addFields(
                {
                    name: '📝 Commands',
                    value: '`!cowsay rival add @user <description>` - Add a rival with custom description\n`!cowsay rival remove @user` - Remove a rival\n`!cowsay rival list` - Show all configured rivals',
                    inline: false
                },
                {
                    name: '🤖 How It Works',
                    value: 'When you add a rival, Cowsay will:\n• Monitor their messages and responses\n• Try to discover their commands\n• Ask users to help run commands\n• Be sassy and competitive with them',
                    inline: false
                },
                {
                    name: '⚙️ Per-Server',
                    value: 'Rivals are configured per server - each server has its own rival list that only affects that server.',
                    inline: false
                }
            )
            .setFooter({ text: 'Example: !cowsay rival add @bark terrible bot with mysterious commands' });
        
        message.reply({ embeds: [embed] });
        return;
    }

    if (message.content === "!cowsay help coins") {
        const embed = new EmbedBuilder()
            .setTitle('🪙 Coin System Help')
            .setColor(0xffd700)
            .setDescription('Earn coins by playing games and use them to purchase premium items!')
            .addFields(
                {
                    name: '🎮 Earning Coins',
                    value: '• **Pong**: 50 coins (win), 10 coins (participation), +25 bonus (shutout)\n• **Tic-Tac-Toe**: 30 coins (win), 5 coins (participation)\n• **Battleship**: 100 coins (win), 15 coins (participation)\n• **Balatro**: 25-150 coins (progressive), +50 bonus (ante 8+)\n• **Blackjack**: Variable based on betting',
                    inline: false
                },
                {
                    name: '⚡ Bonus Multipliers',
                    value: '• **Win Streaks**: +10% per consecutive win (max 50%)\n• **First Win of Day**: 2x multiplier on all rewards\n• **Perfect Games**: Extra bonus coins for exceptional play\n• **Daily Bonus**: Up to 100 coins (for players under 1000)',
                    inline: false
                },
                {
                    name: '📊 Commands',
                    value: '`!cowsay balance` - Check your current balance\n`!cowsay daily` - Claim daily bonus\n`!cowsay transactions` - View recent transactions\n`!cowsay leaderboard` - See top coin holders',
                    inline: false
                }
            )
            .setFooter({ text: 'Play games to earn coins and climb the leaderboard!' });
        
        message.reply({ embeds: [embed] });
        return;
    }

    if (message.content === "!cowsay help shop") {
        const embed = new EmbedBuilder()
            .setTitle('🛒 Shop System Help')
            .setColor(0x9b59b6)
            .setDescription('Purchase premium characters and boosts with your hard-earned coins!')
            .addFields(
                {
                    name: '🎭 Premium Characters',
                    value: '• **Dragon** (500 coins) - Fierce dragon ASCII art\n• **Tux Penguin** (300 coins) - Linux mascot penguin\n• **Darth Vader** (750 coins) - Dark side ASCII art\n• **Elephant** (400 coins) - Majestic elephant ASCII\n• **Ghostbusters** (600 coins) - Who you gonna call?',
                    inline: false
                },
                {
                    name: '⚡ Boosts (Coming Soon)',
                    value: '• **Daily Boost** (1000 coins) - Double daily bonus for 7 days\n• **Streak Shield** (1500 coins) - Protect win streak from one loss',
                    inline: false
                },
                {
                    name: '🛍️ How to Shop',
                    value: '1. Use `!cowsay shop` to browse items\n2. Click the buttons to purchase items\n3. Use your new characters with `!<character>say <text>`\n4. Buttons are disabled if you can\'t afford an item',
                    inline: false
                }
            )
            .setFooter({ text: 'Earn coins by playing games to unlock premium content!' });
        
        message.reply({ embeds: [embed] });
        return;
    }

    if (message.content === "!cowsay join") {
        await gameManager.handleJoinCommand(message);
        return;
    }

    if (message.content === "!cowsay balance") {
        console.log(`[BALANCE] Getting balance for user ${message.author.id}`);
        const balance = await currencyManager.getBalance(message.author.id);
        const boosts = await currencyManager.getBoostStatus(message.author.id);
        console.log(`[BALANCE] Retrieved balance: ${balance}`);
        
        let response = `🪙 You have **${balance}** coins!`;
        
        if (boosts.dailyBoost || boosts.streakShields > 0) {
            response += '\n\n**Active Boosts:**';
            if (boosts.dailyBoost) {
                const expires = new Date(boosts.dailyBoostExpires).toLocaleDateString();
                response += `\n⚡ Daily Boost (2x daily bonus until ${expires})`;
            }
            if (boosts.streakShields > 0) {
                response += `\n🛡️ Streak Shield (${boosts.streakShields} protection${boosts.streakShields > 1 ? 's' : ''})`;
            }
        }
        
        message.reply(response);
        return;
    }

    if (message.content === "!cowsay daily") {
        const result = await currencyManager.getDailyBonus(message.author.id);
        if (result.success) {
            const boostText = result.boosted ? ' (2x Daily Boost applied!)' : '';
            message.reply(
                `🎁 Daily bonus claimed! +${result.amount} coins${boostText} New balance: **${result.newBalance}** coins 🪙`
            );
        } else {
            message.reply(`❌ ${result.message}`);
        }
        return;
    }

    if (message.content === "!cowsay leaderboard") {
        const leaderboard = await currencyManager.getLeaderboard(50); // Get more entries
        if (leaderboard.length === 0) {
            message.reply("No players found! 🪙");
            return;
        }

        const entries = leaderboard.map((player, index) => {
            const medal =
                index === 0
                    ? "🥇"
                    : index === 1
                    ? "🥈"
                    : index === 2
                    ? "🥉"
                    : `${index + 1}.`;
            return `${medal} <@${player.userId}>: **${player.balance}** coins`;
        });

        if (entries.length <= 10) {
            const embed = new EmbedBuilder()
                .setTitle("🏆 Coin Leaderboard")
                .setColor(0xffd700)
                .setDescription(entries.join("\n"))
                .setFooter({ text: "Play games to earn more coins!" });
            message.reply({ embeds: [embed] });
        } else {
            await Pagination.create(message, "Coin Leaderboard", entries, 10);
        }
        return;
    }

    if (message.content === "!cowsay transactions") {
        const history = await currencyManager.getTransactionHistory(message.author.id, 25);
        if (history.length === 0) {
            message.reply("No transaction history found! 📊");
            return;
        }

        const entries = history.map((tx, index) => {
            const sign = tx.amount >= 0 ? "+" : "";
            const date = new Date(tx.created_at).toLocaleDateString();
            const emoji = tx.reason.includes('perfect') ? '🏆' : tx.reason.includes('win') ? '🎆' : tx.reason.includes('participation') ? '🎖️' : '🪙';
            return `${emoji} ${sign}${tx.amount} 🪙 - ${tx.reason}\n*${tx.balance_before} → ${tx.balance_after} (${date})*`;
        });

        if (entries.length <= 5) {
            const embed = new EmbedBuilder()
                .setTitle(`📊 ${message.author.displayName}'s Transaction History`)
                .setColor(0x00ae86)
                .setDescription(entries.join("\n\n"))
                .setFooter({ text: `Last ${entries.length} transactions` });
            message.reply({ embeds: [embed] });
        } else {
            await Pagination.create(message, `${message.author.displayName}'s Transactions`, entries, 5);
        }
        return;
    }

    if (message.content === "!cowsay shop") {
        try {
            const items = await shopManager.getShopItems();
            const userPurchases = await shopManager.getUserPurchases(message.author.id);
            const userBalance = await currencyManager.getBalance(message.author.id);
            const boosts = await currencyManager.getBoostStatus(message.author.id);
            
            if (!items || items.length === 0) {
                message.reply("Shop is currently empty! 🛒");
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle("🛒 Cowsay Shop")
                .setColor(0x9b59b6)
                .setDescription(`Purchase premium characters and boosts with your coins!\n🪙 **Your Balance: ${userBalance} coins**`);

            const categories = [...new Set(items.map(item => item.category))];
            
            for (const category of categories) {
                const categoryItems = items.filter(item => item.category === category);
                const itemList = categoryItems.map(item => {
                    let status;
                    if (category === 'character') {
                        const owned = userPurchases.includes(item.item_id);
                        status = owned ? "✅ Owned" : `💰 ${item.price} coins`;
                    } else if (category === 'boost') {
                        if (item.item_id === 'daily_boost') {
                            status = boosts.dailyBoost ? "⚡ Active" : `💰 ${item.price} coins`;
                        } else if (item.item_id === 'streak_shield') {
                            status = boosts.streakShields > 0 ? `🛡️ ${boosts.streakShields} owned` : `💰 ${item.price} coins`;
                        } else {
                            status = `💰 ${item.price} coins`;
                        }
                    } else {
                        status = `💰 ${item.price} coins`;
                    }
                    return `**${item.name}** - ${status}\n*${item.description}*`;
                }).join('\n\n');
                
                const categoryEmoji = category === 'character' ? '🎭' : category === 'boost' ? '⚡' : '🛍️';
                embed.addFields({
                    name: `${categoryEmoji} ${category.charAt(0).toUpperCase() + category.slice(1)}s`,
                    value: itemList,
                    inline: false
                });
            }

            // Create buttons for purchasable items
            const buttons = [];
            
            for (const item of items) {
                let canPurchase = userBalance >= item.price;
                
                // Special logic for different item types
                if (item.category === 'character' && userPurchases.includes(item.item_id)) {
                    continue; // Skip owned characters
                } else if (item.category === 'boost') {
                    if (item.item_id === 'daily_boost' && boosts.dailyBoost) {
                        continue; // Skip if daily boost is active
                    }
                    // Streak shields can always be purchased (stackable)
                }
                
                if (buttons.length < 25) { // Discord limit
                    buttons.push(
                        new ButtonBuilder()
                            .setCustomId(`shop_buy_${item.item_id}`)
                            .setLabel(`${item.name} (${item.price}🪙)`)
                            .setStyle(canPurchase ? ButtonStyle.Primary : ButtonStyle.Secondary)
                            .setDisabled(!canPurchase)
                    );
                }
            }

            const components = [];
            for (let i = 0; i < buttons.length; i += 5) {
                components.push(
                    new ActionRowBuilder().addComponents(buttons.slice(i, i + 5))
                );
            }

            embed.setFooter({ text: "Click buttons below to purchase items" });
            message.reply({ embeds: [embed], components });
        } catch (error) {
            console.log('Shop error:', error);
            message.reply("❌ Shop is currently unavailable. Please try again later.");
        }
        return;
    }

    if (message.content.startsWith("!cowsay buy ")) {
        message.reply("🛒 Use `!cowsay shop` and click the buttons to purchase items!");
        return;
    }

    // Catch-all protection for admin commands
    if (message.content.startsWith("!cowsay admin ")) {
        if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.ADMIN))) {
            message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.ADMIN));
            return;
        }
    }

    if (message.content.startsWith("!cowsay admin addcoins ")) {
        if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.ADMIN))) {
            message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.ADMIN));
            return;
        }
        
        const args = message.content.slice(23).trim().split(' ');
        const mention = message.mentions.users.first();
        const amount = parseInt(args[1]);
        
        if (!mention || !amount || amount <= 0) {
            message.reply('Usage: `!cowsay admin addcoins @user <amount> [reason]`');
            return;
        }
        
        const reason = args.slice(2).join(' ') || 'Admin grant';
        const result = await currencyManager.adminAddCoins(mention.id, amount, reason);
        
        if (result.success) {
            message.reply(`✅ Added **${amount}** coins to <@${mention.id}>. New balance: **${result.newBalance}** coins`);
        } else {
            message.reply(`❌ Failed to add coins: ${result.error}`);
        }
        return;
    }

    if (message.content.startsWith("!cowsay admin removecoins ")) {
        if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.ADMIN))) {
            message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.ADMIN));
            return;
        }
        
        const args = message.content.slice(26).trim().split(' ');
        const mention = message.mentions.users.first();
        const amount = parseInt(args[1]);
        
        if (!mention || !amount || amount <= 0) {
            message.reply('Usage: `!cowsay admin removecoins @user <amount> [reason]`');
            return;
        }
        
        const reason = args.slice(2).join(' ') || 'Admin removal';
        const result = await currencyManager.adminRemoveCoins(mention.id, amount, reason);
        
        if (result.success) {
            message.reply(`✅ Removed **${result.actualAmount}** coins from <@${mention.id}>. New balance: **${result.newBalance}** coins`);
        } else {
            message.reply(`❌ Failed to remove coins: ${result.error}`);
        }
        return;
    }

    if (message.content === "!cowsay admin transactions") {
        if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.ADMIN))) {
            message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.ADMIN));
            return;
        }
        
        const history = await currencyManager.getAllTransactions(20);
        if (history.length === 0) {
            message.reply("No transactions found! 📊");
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("🔍 All Transaction History (Admin)")
            .setColor(0xff4444)
            .setDescription(
                history
                    .map((tx, index) => {
                        const sign = tx.amount >= 0 ? "+" : "";
                        const date = new Date(tx.created_at).toLocaleDateString();
                        const emoji = tx.reason.includes('perfect') ? '🏆' : tx.reason.includes('win') ? '🎆' : tx.reason.includes('Admin') ? '🔧' : '🪙';
                        return `${emoji} <@${tx.user_id}> ${sign}${tx.amount} 🪙 - ${tx.reason}\n*${tx.balance_before} → ${tx.balance_after} (${date})*`;
                    })
                    .join("\n\n")
            )
            .setFooter({ text: "Last 20 transactions across all users" });

        message.reply({ embeds: [embed] });
        return;
    }

    if (message.content.startsWith("!cowsay admin balance ")) {
        if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.ADMIN))) {
            message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.ADMIN));
            return;
        }
        
        const mention = message.mentions.users.first();
        if (!mention) {
            message.reply('Usage: `!cowsay admin balance @user`');
            return;
        }
        
        const balance = await currencyManager.getBalance(mention.id);
        message.reply(`🪙 <@${mention.id}> has **${balance}** coins`);
        return;
    }

    if (message.content === "!cowsay admin help") {
        if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.ADMIN))) {
            message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.ADMIN));
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🔧 Admin Commands Help')
            .setColor(0xff4444)
            .setDescription('Administrative commands for managing the coin economy and server settings.')
            .addFields(
                {
                    name: '🪙 Coin Management',
                    value: '`!cowsay admin addcoins @user <amount> [reason]` - Add coins to a user\n`!cowsay admin removecoins @user <amount> [reason]` - Remove coins from a user\n`!cowsay admin balance @user` - Check any user\'s balance\n`!cowsay admin transactions` - View last 20 transactions (all users)',
                    inline: false
                },
                {
                    name: '🔥 Rivals Management',
                    value: '`!cowsay rival add @user <description>` - Add a rival bot\n`!cowsay rival remove @user` - Remove a rival\n`!cowsay rival list` - Show all rivals\n`!cowsay help rivals` - Learn about rivals system',
                    inline: false
                },
                {
                    name: '🔐 Permissions',
                    value: '`!cowsay perms setrole <level> @role` - Map role to permission level\n`!cowsay perms removerole @role` - Remove role mapping\n`!cowsay perms listroles` - Show role mappings\n`!cowsay perms check @user` - Check user permission level',
                    inline: false
                },
                {
                    name: '⚙️ Server Settings',
                    value: '`!toggleautoreply` - Toggle auto-reply to "cowsay" mentions\n`!toggleintent` - Cycle intent detection modes\n`!showconfig` - Show current server configuration\n`!clearleaderboard` - Clear leaderboard cache',
                    inline: false
                },
                {
                    name: '📊 Statistics',
                    value: '`!cowsay serverstats` - View server game statistics\n`!cowsay topplayers` - View server leaderboard\nNote: Users can opt out with `!cowsay optstats out`',
                    inline: false
                }
            )
            .setFooter({ text: 'All admin commands require Administrator permission or custom role mapping' });
        
        message.reply({ embeds: [embed] });
        return;
    }

    // Handle both !cowsay play blackjack and !blackjack commands
    const isBlackjackCommand =
        message.content.startsWith("!cowsay play blackjack ") ||
        message.content.startsWith("!blackjack ");
    if (isBlackjackCommand) {
        let args;
        if (message.content.startsWith("!cowsay play blackjack ")) {
            args = message.content.slice(23).trim().split(" ");
        } else {
            args = message.content.slice(11).trim().split(" ");
        }

        const mode = args[0]?.toLowerCase();
        const betAmount = parseInt(args[1]);

        if (!mode || !["single", "player", "dealer"].includes(mode)) {
            message.reply(
                "Usage: `!blackjack <single|player|dealer> <bet_amount>`\nExample: `!blackjack single 100`"
            );
            return;
        }

        if (!betAmount || betAmount < 10) {
            message.reply("Bet amount must be at least 10 coins!");
            return;
        }

        const balance = await currencyManager.getBalance(message.author.id);
        if (balance < betAmount) {
            message.reply(
                `You don't have enough coins! You have ${balance} coins but need ${betAmount}.`
            );
            return;
        }

        if (await gameManager.startBlackjackGame(message, mode, betAmount)) {
            return;
        } else {
            message.reply("Failed to start blackjack game!");
            return;
        }
    }

    // Handle !blackjack without arguments (interactive setup)
    if (message.content === "!blackjack") {
        if (await gameManager.startGame(message, "blackjack")) {
            return;
        } else {
            message.reply("Failed to start blackjack game!");
            return;
        }
    }

    if (message.content.startsWith("!cowsay play ")) {
        const args = message.content.slice(13).trim().split(" ");
        const gameName = args[0].toLowerCase();
        const opponent = message.mentions.users.first();
        
        // Handle pong ai command
        if (gameName === 'pong' && args[1] === 'ai') {
            const pong = require('./modules/games/pong');
            const result = await pong.start(message);
            if (result) {
                // Auto-start AI game
                const game = result.gameData;
                game.player2 = { id: "ai_player", name: "AI", paddle: 4, isAI: true };
                game.phase = "countdown";
                
                // Create fake interaction for countdown
                const fakeInteraction = {
                    editReply: async (options) => {
                        const msg = await message.channel.messages.fetch(game.messageId);
                        await msg.edit(options);
                    }
                };
                
                await pong.startCountdown(fakeInteraction, game);
            }
            return;
        }

        if (await gameManager.startGame(message, gameName, opponent)) {
            return;
        } else {
            message.reply(
                "Game not found! Use `!cowsay games` to see available games."
            );
            return;
        }
    }

    if (message.content === "!clearleaderboard") {
        if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.MODERATOR))) {
            message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.MODERATOR));
            return;
        }
        
        const count = leaderboardHandler.clearAllPending();
        message.reply(
            `Cleared ${count} pending leaderboard(s) from all channels! 🧹`
        );
        return;
    }

    if (message.content.startsWith("!cowsay rival ")) {
        const args = message.content.slice(14).trim().split(' ');
        const action = args[0]?.toLowerCase();
        
        if (action === 'add') {
            if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.ADMIN))) {
                message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.ADMIN));
                return;
            }
            
            const mention = message.mentions.users.first();
            if (!mention) {
                message.reply('Please mention a user to add as a rival! Usage: `!cowsay rival add @user description`');
                return;
            }
            
            if (mention.id === client.user.id) {
                message.reply('I cannot be my own rival! 😅');
                return;
            }
            
            const description = args.slice(1).join(' ').replace(`<@${mention.id}>`, '').trim();
            if (!description) {
                message.reply('Please provide a description for the rival! Usage: `!cowsay rival add @user description`');
                return;
            }
            
            const success = await rivalManager.addRival(message.guild?.id, mention.id, mention.username, description);
            if (success) {
                message.reply(`🔥 Added **${mention.username}** as a rival! ${description}`);
            } else {
                message.reply('❌ Failed to add rival. Please try again.');
            }
            return;
        }
        
        if (action === 'remove') {
            if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.ADMIN))) {
                message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.ADMIN));
                return;
            }
            
            const mention = message.mentions.users.first();
            if (!mention) {
                message.reply('Please mention a user to remove as a rival! Usage: `!cowsay rival remove @user`');
                return;
            }
            
            const success = await rivalManager.removeRival(message.guild?.id, mention.id);
            if (success) {
                message.reply(`✅ Removed **${mention.username}** as a rival.`);
            } else {
                message.reply('❌ That user is not a rival or removal failed.');
            }
            return;
        }
        
        if (action === 'list') {
            const rivals = await rivalManager.getRivals(message.guild?.id);
            if (rivals.length === 0) {
                message.reply('No rivals configured for this server.');
                return;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('🔥 Server Rivals')
                .setColor(0xff4444)
                .setDescription(rivals.map(r => `**${r.name}** - ${r.description}`).join('\n'))
                .setFooter({ text: `${rivals.length} rival(s) configured` });
            
            message.reply({ embeds: [embed] });
            return;
        }
        
        message.reply('Usage: `!cowsay rival add @user description`, `!cowsay rival remove @user`, or `!cowsay rival list`');
        return;
    }

    if (message.content.startsWith("!cowsay perms ")) {
        const args = message.content.slice(14).trim().split(' ');
        const action = args[0]?.toLowerCase();
        
        if (action === 'setrole') {
            if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.ADMIN))) {
                message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.ADMIN));
                return;
            }
            
            const permissionLevel = args[1]?.toLowerCase();
            const role = message.mentions.roles.first();
            
            if (!permissionLevel || !role) {
                message.reply('Usage: `!cowsay perms setrole <admin|moderator|helper> @role`');
                return;
            }
            
            if (!['admin', 'moderator', 'helper'].includes(permissionLevel)) {
                message.reply('Permission level must be: admin, moderator, or helper');
                return;
            }
            
            const success = await discordPermissions.setRoleMapping(message.guild?.id, role.id, permissionLevel);
            if (success) {
                message.reply(`✅ Set role **${role.name}** to **${permissionLevel}** level.`);
            } else {
                message.reply('❌ Failed to set role mapping. Please try again.');
            }
            return;
        }
        
        if (action === 'removerole') {
            if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.ADMIN))) {
                message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.ADMIN));
                return;
            }
            
            const role = message.mentions.roles.first();
            if (!role) {
                message.reply('Usage: `!cowsay perms removerole @role`');
                return;
            }
            
            const success = await discordPermissions.removeRoleMapping(message.guild?.id, role.id);
            if (success) {
                message.reply(`✅ Removed permission mapping for role **${role.name}**.`);
            } else {
                message.reply('❌ That role has no custom mapping or removal failed.');
            }
            return;
        }
        
        if (action === 'listroles') {
            const roleMappings = await discordPermissions.getRoleMappings(message.guild?.id);
            if (roleMappings.size === 0) {
                message.reply('No custom role mappings configured. Using Discord default permissions.');
                return;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('🔐 Role Permission Mappings')
                .setColor(0x5865f2)
                .setDescription('Custom role mappings for this server:')
                .setFooter({ text: 'Default: Owner=Admin, Administrator=Admin, Manage Server=Moderator, Manage Messages=Helper' });
            
            for (const [roleId, level] of roleMappings) {
                const role = message.guild.roles.cache.get(roleId);
                if (role) {
                    embed.addFields({
                        name: role.name,
                        value: `**${level}** level`,
                        inline: true
                    });
                }
            }
            
            message.reply({ embeds: [embed] });
            return;
        }
        
        if (action === 'check') {
            const mention = message.mentions.users.first();
            if (!mention) {
                message.reply('Usage: `!cowsay perms check @user`');
                return;
            }
            
            const targetMember = message.guild.members.cache.get(mention.id);
            if (!targetMember) {
                message.reply('User not found in this server.');
                return;
            }
            
            // Create fake message object for permission checking
            const fakeMessage = { member: targetMember, guild: message.guild };
            const userLevel = await discordPermissions.getUserPermissionLevel(fakeMessage);
            
            message.reply(`**${mention.username}** has **${userLevel}** permission level.`);
            return;
        }
        
        message.reply('Usage: `!cowsay perms setrole <level> @role`, `!cowsay perms removerole @role`, `!cowsay perms listroles`, or `!cowsay perms check @user`');
        return;
    }

    if (message.content === "!cowsay myperms") {
        const userLevel = await discordPermissions.getUserPermissionLevel(message);
        message.reply(`You have **${userLevel}** permission level in this server.`);
        return;
    }

    if (message.content === "!cowsay stats") {
        const stats = await gameStats.getPersonalStats(message.author.id);
        
        if (Object.keys(stats).length === 0) {
            message.reply('You haven\'t played any games yet! 🎮');
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 ${message.author.displayName}'s Game Statistics`)
            .setColor(0x00ae86)
            .setThumbnail(message.author.displayAvatarURL());
        
        for (const [gameType, data] of Object.entries(stats)) {
            const gameEmoji = { pong: '🏓', blackjack: '🃏', tictactoe: '⭕', battleship: '🚢', balatro: '🎰' };
            embed.addFields({
                name: `${gameEmoji[gameType] || '🎮'} ${gameType.charAt(0).toUpperCase() + gameType.slice(1)}`,
                value: `**${data.games_played}** games • **${data.wins}W-${data.losses}L-${data.ties}T** • **${data.win_rate}%** win rate`,
                inline: true
            });
        }
        
        embed.setFooter({ text: 'Use !cowsay stats @user to view someone else\'s stats' });
        message.reply({ embeds: [embed] });
        return;
    }

    if (message.content.startsWith("!cowsay stats ")) {
        const mention = message.mentions.users.first();
        if (!mention) {
            message.reply('Please mention a user! Usage: `!cowsay stats @user`');
            return;
        }
        
        const stats = await gameStats.getPersonalStats(mention.id);
        
        if (Object.keys(stats).length === 0) {
            message.reply(`${mention.displayName} hasn't played any games yet! 🎮`);
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 ${mention.displayName}'s Game Statistics`)
            .setColor(0x00ae86)
            .setThumbnail(mention.displayAvatarURL());
        
        for (const [gameType, data] of Object.entries(stats)) {
            const gameEmoji = { pong: '🏓', blackjack: '🃏', tictactoe: '⭕', battleship: '🚢', balatro: '🎰' };
            embed.addFields({
                name: `${gameEmoji[gameType] || '🎮'} ${gameType.charAt(0).toUpperCase() + gameType.slice(1)}`,
                value: `**${data.games_played}** games • **${data.wins}W-${data.losses}L-${data.ties}T** • **${data.win_rate}%** win rate`,
                inline: true
            });
        }
        
        message.reply({ embeds: [embed] });
        return;
    }

    if (message.content === "!cowsay serverstats") {
        if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.MODERATOR))) {
            message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.MODERATOR));
            return;
        }
        
        const stats = await gameStats.getServerStats(message.guild?.id);
        
        if (stats.length === 0) {
            message.reply('No games have been played on this server yet! 🎮');
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 ${message.guild.name} Server Statistics`)
            .setColor(0x5865f2)
            .setThumbnail(message.guild.iconURL());
        
        stats.forEach(game => {
            const gameEmoji = { pong: '🏓', blackjack: '🃏', tictactoe: '⭕', battleship: '🚢', balatro: '🎰' };
            embed.addFields({
                name: `${gameEmoji[game.game_type] || '🎮'} ${game.game_type.charAt(0).toUpperCase() + game.game_type.slice(1)}`,
                value: `**${game.total_games}** games played\n**${game.unique_players}** unique players${game.avg_duration ? `\n**${Math.round(game.avg_duration)}s** avg duration` : ''}`,
                inline: true
            });
        });
        
        message.reply({ embeds: [embed] });
        return;
    }

    if (message.content === "!cowsay topplayers") {
        const topPlayers = await gameStats.getTopPlayers(message.guild?.id);
        
        if (topPlayers.length === 0) {
            message.reply('No games have been played on this server yet! 🎮');
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`🏆 ${message.guild.name} Top Players`)
            .setColor(0xffd700)
            .setDescription(topPlayers.map((player, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                return `${medal} **${player.username}** - ${player.wins} wins (${player.win_rate}% win rate, ${player.total_games} games)`;
            }).join('\n'))
            .setFooter({ text: 'Based on total wins across all games' });
        
        message.reply({ embeds: [embed] });
        return;
    }

    if (message.content === "!cowsay optstats") {
        const args = message.content.split(' ');
        const action = args[2]?.toLowerCase();
        
        if (action === 'out') {
            const success = await gameStats.setOptOut(message.author.id, true);
            if (success) {
                message.reply('✅ You have opted out of game statistics tracking. Your existing stats have been deleted.');
            } else {
                message.reply('❌ Failed to opt out. Please try again.');
            }
            return;
        }
        
        if (action === 'in') {
            const success = await gameStats.setOptOut(message.author.id, false);
            if (success) {
                message.reply('✅ You have opted back into game statistics tracking.');
            } else {
                message.reply('❌ Failed to opt in. Please try again.');
            }
            return;
        }
        
        message.reply('Usage: `!cowsay optstats out` to opt out or `!cowsay optstats in` to opt back in.');
        return;
    }

    if (message.content === "!toggleautoreply") {
        if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.ADMIN))) {
            message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.ADMIN));
            return;
        }
        
        const enabled = await autoReply.toggle(message.guild?.id);
        message.reply(
            `Auto-reply to "cowsay" mentions is now ${
                enabled ? "enabled" : "disabled"
            } for this server! 🐄`
        );
        return;
    }

    if (message.content === "!toggleintent") {
        if (!(await discordPermissions.hasPermission(message, discordPermissions.PERMISSION_LEVELS.ADMIN))) {
            message.reply(discordPermissions.getPermissionError(discordPermissions.PERMISSION_LEVELS.ADMIN));
            return;
        }
        
        const mode = await intentDetector.toggle(message.guild?.id);
        const modeEmojis = { LLM: "🧠", EMBEDDING: "🔍", REGEX: "⚙️" };
        message.reply(
            `Intent detection is now using ${mode} mode for this server! ${modeEmojis[mode]}`
        );
        return;
    }

    if (message.content === "!showconfig") {
        const autoReplyEnabled = await autoReply.isEnabled(message.guild?.id);
        const intentMode = await intentDetector.getMode(message.guild?.id);
        const rivals = await rivalManager.getRivals(message.guild?.id);
        const roleMappings = await discordPermissions.getRoleMappings(message.guild?.id);
        const shopItems = await shopManager.getShopItems();

        const embed = new EmbedBuilder()
            .setTitle("⚙️ Cowsay Server Configuration")
            .setColor(0x00ae86)
            .addFields(
                {
                    name: "Auto-Reply",
                    value: `${
                        autoReplyEnabled ? "✅ Enabled" : "❌ Disabled"
                    }\nResponds to "cowsay" mentions`,
                    inline: true,
                },
                {
                    name: "Intent Detection",
                    value: `${
                        intentMode === "LLM"
                            ? "🧠 LLM Mode"
                            : intentMode === "EMBEDDING"
                            ? "🔍 Embedding Mode"
                            : "⚙️ Regex Mode"
                    }\nDetects conversation continuations`,
                    inline: true,
                },
                {
                    name: "Rivals System",
                    value: `${
                        rivals.length > 0 
                            ? `🔥 ${rivals.length} rival(s) configured`
                            : "❌ No rivals configured"
                    }\nCompetitive bot interactions`,
                    inline: true,
                },
                {
                    name: "Permission System",
                    value: `${
                        roleMappings.size > 0
                            ? `🔐 ${roleMappings.size} custom role mapping(s)`
                            : "🔐 Using Discord defaults"
                    }\nRole-based access control`,
                    inline: true,
                },
                {
                    name: "Shop System",
                    value: `🛒 ${shopItems.length} items available\nPremium characters & boosts`,
                    inline: true,
                },
                {
                    name: "Database Schema",
                    value: "📊 Version 8\nCurrency, shop, stats, permissions",
                    inline: true,
                }
            )
            .setFooter({ text: "Use toggle/admin commands to modify settings" })
            .setTimestamp();

        message.reply({ embeds: [embed] });
        return;
    }

    // Handle replies to bot messages in threads or !ask mode
    if (message.reference && message.reference.messageId) {
        try {
            const referencedMessage = await message.channel.messages.fetch(
                message.reference.messageId
            );
            if (referencedMessage.author.id === client.user.id) {
                // Always collapse replies to bot
                responseCollapse.shouldCollapse(message, client.user.id);
                return;
            }
        } catch (error) {
            Logger.error("Reply handling error", error.message);
        }
    }

    // Handle messages in chat threads (continue conversation)
    if (
        message.channel.isThread() &&
        message.channel.name.startsWith("Chat with")
    ) {
        try {
            const context = await contextBuilder.buildContext(
                message,
                false,
                false,
                true
            );
            const messages = [
                llmService.buildSystemMessage(await commandHandler.getSystemPrompt(message.guild?.id)),
                ...context,
                llmService.buildUserMessage(
                    message.author.displayName,
                    message.content
                ),
            ];

            const answer = await llmService.generateResponse(messages);
            await message.channel.send(answer);
            return;
        } catch (error) {
            Logger.error("Thread chat error", error.message);
            message.reply(
                "Sorry, I couldn't process your message in this thread. 🤖"
            );
            return;
        }
    }

    // Handle @Cowsay mentions
    if (message.mentions.has(client.user)) {
        // Always collapse mentions
        responseCollapse.shouldCollapse(message, client.user.id);
        return;
    }

    if (message.content.startsWith("!ask ")) {
        const question = message.content.slice(5).trim();
        if (!question) {
            message.reply(
                "Please provide a question! Usage: `!ask How do I center a div?`"
            );
            return;
        }
        await askHandler.handleAsk(message, question);
        return;
    }

    if (message.content.startsWith("!chat ")) {
        const question = message.content.slice(6).trim();
        if (!question) {
            message.reply(
                "Please provide a question! Usage: `!chat How do I center a div?`"
            );
            return;
        }

        try {
            // Create a thread for one-on-one chat
            const thread = await message.startThread({
                name: `Chat with ${message.author.displayName}`,
                autoArchiveDuration: 60, // Auto-archive after 1 hour of inactivity
                reason: "One-on-one chat session",
            });

            const context = await contextBuilder.buildContext(
                message,
                false,
                true,
                false
            );
            const messages = [
                llmService.buildSystemMessage(await commandHandler.getSystemPrompt(message.guild?.id)),
                ...context,
                llmService.buildUserMessage(
                    message.author.displayName,
                    question
                ),
            ];

            const answer = await llmService.generateResponse(messages);
            await thread.send(answer);
        } catch (error) {
            Logger.error("Chat thread error", error.message);
            message.reply(
                "Sorry, I couldn't start a chat thread right now. 🤖"
            );
        }
        return;
    }

    if (message.content === "!rimshot") {
        const rimshot = `    🥁 *BA-DUM-TSS* 🥁
    
       ♪ ♫ ♪ ♫ ♪
      /           \\
     |  O       O  |
     |      ^      |
     |   \\  -  /   |
      \\    ___    /
       \\___________/
        |  |   |  |
        |  |   |  |
       /   |   |   \\
      /    |___|    \\
     |________________|`;
        message.reply(`\`\`\`\n${rimshot}\n\`\`\``);
        return;
    }

    if (message.content === "!joke") {
        try {
            const response = await fetch("https://icanhazdadjoke.com/", {
                headers: { Accept: "application/json" },
            });
            const data = await response.json();
            const characters = characterManager.getCharacters();
            const randomChar =
                characters[Math.floor(Math.random() * characters.length)];
            const result = characterManager.generateAscii(
                randomChar,
                data.joke
            );
            message.reply(`\`\`\`\n${result}\n\`\`\``);
        } catch (error) {
            message.reply("Sorry, couldn't fetch a joke right now! 😅");
        }
        return;
    }

    if (message.content === "!cowsay embed") {
        const cards = [
            cardRenderer.getRandomCard(),
            cardRenderer.getRandomCard(),
            cardRenderer.getRandomCard(),
            cardRenderer.getRandomCard(),
            cardRenderer.getRandomCard(),
            cardRenderer.getRandomCard(),
            cardRenderer.getRandomCard(),
            cardRenderer.getRandomCard(),
        ];

        const asciiCards = cardRenderer.renderCards(cards);

        message.reply(
            `**🃏 ASCII Playing Cards**\n\`\`\`\n${asciiCards}\n\`\`\``
        );
        return;
    }

    if (message.content.startsWith("!cowsay")) {
        const text = message.content.slice(8).trim();
        const validation = SecurityUtils.validateInput(text, 500);

        if (!validation.valid) {
            message.reply(`Error: ${validation.error}`);
            return;
        }

        if (!text) {
            message.reply(
                "Please provide text for the cow to say! Usage: `!cowsay Hello World`"
            );
            return;
        }

        try {
            Logger.info("Cowsay command used", {
                user: message.author.username,
            });
            const cow = await characterManager.generateAscii('cow', text, message.author.id);
            const escaped = cow.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
            const formatted = `\`\`\`\n${escaped}\n\`\`\``;
            if (formatted.length > 2000) {
                const maxContent = 2000 - 8;
                const truncated =
                    escaped.slice(0, maxContent - 20) +
                    "\n[... ASCII too long ...]";
                message.reply(`\`\`\`\n${truncated}\n\`\`\``);
            } else {
                message.reply(formatted);
            }
        } catch (error) {
            Logger.error("Cowsay generation error", error.message);
            message.reply(
                "Sorry, there was an error generating the cow message."
            );
        }
        return;
    }

    // Auto-reply to cowsay mentions (check before character commands)
    if (await autoReply.shouldReply(message, client.user.id)) {
        // Always collapse auto-replies
        responseCollapse.shouldCollapse(message, client.user.id);
        return;
    }

    // Intent detection - check if message seems directed at Cowsay (only if auto-reply is enabled)
    if (
        await autoReply.isEnabled(message.guild?.id) &&
        !message.mentions.has(client.user) &&
        message.author.id !== client.user.id &&
        !message.content.includes("-leaderboard") &&
        !message.content.startsWith("!")
    ) {
        try {
            const recentMessages = contextManager.getRecentMessages(
                message.channel.id,
                6
            );

            Logger.debug("Intent detection check", {
                hasRecentMessages: !!recentMessages,
                isArray: Array.isArray(recentMessages),
                messageCount: recentMessages.length,
                messageContent: message.content.substring(0, 50),
                lastMessageAuthor:
                    recentMessages[recentMessages.length - 1]?.author,
                mode: intentDetector.mode,
            });

            if (await intentDetector.detectIntent(message, recentMessages)) {
                Logger.info("Intent detected - handling as mention");

                // Always collapse intent detection
                responseCollapse.shouldCollapse(message, client.user.id);
                return;
            }
        } catch (error) {
            Logger.error("Intent detection error", error.message);
        }
    }

    // Handle all character commands
    for (const char of characterManager.getCharacters()) {
        const cleanName = char.replace(/[^a-zA-Z0-9]/g, "");
        const command = `!${cleanName}say`;
        if (message.content.startsWith(command)) {
            const text = message.content.slice(command.length).trim();
            if (!text) {
                message.reply(
                    `Please provide text! Usage: \`${command} Hello World\``
                );
                return;
            }

            const validation = SecurityUtils.validateInput(text, 500);
            if (!validation.valid) {
                message.reply(`Error: ${validation.error}`);
                return;
            }

            Logger.info(`${cleanName}say command used`, {
                user: message.author.username,
            });
            try {
                const result = await characterManager.generateAscii(char, text, message.author.id);
                
                // Check if it's a premium character message
                if (result.includes('🔒')) {
                    message.reply(result);
                    return;
                }
                
                const escaped = result
                    .replace(/\\/g, "\\\\")
                    .replace(/`/g, "\\`");
                const formatted = `\`\`\`\n${escaped}\n\`\`\``;
                if (formatted.length > 2000) {
                    const maxContent = 2000 - 8;
                    const truncated =
                        escaped.slice(0, maxContent - 20) +
                        "\n[... ASCII too long ...]";
                    message.reply(`\`\`\`\n${truncated}\n\`\`\``);
                } else {
                    message.reply(formatted);
                }
            } catch (error) {
                Logger.error(
                    `Character generation error for ${cleanName}`,
                    error.message
                );
                message.reply(
                    `Sorry, ${cleanName} character is not available.`
                );
            }
            return;
        }
    }
});

// Set up response collapse processor
responseCollapse.setProcessor(async (collapsedMessages) => {
    if (collapsedMessages.length === 0) return;

    const firstMessage = collapsedMessages[0].message;

    try {
        if (collapsedMessages.length === 1) {
            console.log(`[COLLAPSE] Processing single message`);
            // Single message - handle normally
            const msg = firstMessage;
            if (msg.reference?.messageId) {
                const referencedMessage = await msg.channel.messages.fetch(
                    msg.reference.messageId
                );
                const answer = await chatHandler.handleReply(
                    msg,
                    referencedMessage,
                    await commandHandler.getSystemPrompt(msg.guild?.id)
                );
                await llmService.sendResponse(msg, answer);
            } else if (await autoReply.shouldReply(msg, client.user.id)) {
                const context = await contextBuilder.buildContext(
                    msg,
                    false,
                    true,
                    false
                );
                const messages = [
                    llmService.buildSystemMessage(
                        await commandHandler.getSystemPrompt(msg.guild?.id) +
                            " Someone mentioned 'cowsay' in their message. Respond naturally as if they called your attention."
                    ),
                    ...context,
                    llmService.buildUserMessage(
                        msg.author.displayName,
                        msg.content
                    ),
                ];
                const answer = await llmService.generateResponse(messages);
                await llmService.sendResponse(msg, answer);
            } else {
                // Handle mention with potential reply context
                const context = await contextBuilder.buildContext(
                    msg,
                    true,
                    true,
                    msg.channel.isThread()
                );
                let replyContext = [];

                if (msg.reference && msg.reference.messageId) {
                    try {
                        const referencedMessage =
                            await msg.channel.messages.fetch(
                                msg.reference.messageId
                            );
                        const referencedDisplayName =
                            referencedMessage.member?.displayName ||
                            referencedMessage.author.username;
                        replyContext.push({
                            role: "system",
                            content: `User is replying to this message: "${referencedDisplayName}: ${referencedMessage.content}"`,
                        });
                    } catch (error) {
                        Logger.error(
                            "Failed to fetch referenced message in collapse",
                            error.message
                        );
                    }
                }

                const content = msg.content
                    .replace(`<@${client.user.id}>`, "")
                    .trim();
                const messages = [
                    llmService.buildSystemMessage(
                        await commandHandler.getSystemPrompt(msg.guild?.id)
                    ),
                    ...context,
                    ...replyContext,
                    llmService.buildUserMessage(
                        msg.author.displayName,
                        content || "mentioned you"
                    ),
                ];

                const answer = await llmService.generateResponse(messages);
                await llmService.sendResponse(msg, answer);
            }
        } else {
            console.log(
                `[COLLAPSE] Processing ${collapsedMessages.length} batched messages`
            );
            // Multiple messages - batch response
            const allContent = collapsedMessages
                .map(
                    (m) =>
                        `${m.message.author.displayName}: ${m.message.content}`
                )
                .join("\n");

            const context = await contextBuilder.buildContext(
                firstMessage,
                false,
                true,
                firstMessage.channel.isThread()
            );
            const messages = [
                llmService.buildSystemMessage(
                    await commandHandler.getSystemPrompt(firstMessage.guild?.id) +
                        " Multiple people are talking to you at once. Address all their messages in one response."
                ),
                ...context,
                { role: "user", content: allContent },
            ];

            const answer = await llmService.generateResponse(messages);
            await llmService.sendResponse(firstMessage, answer);
        }
    } catch (error) {
        Logger.error("Collapsed response error", error.message);
    }
});

client.login(process.env.DISCORD_TOKEN);
