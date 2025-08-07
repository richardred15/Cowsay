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
const { EmbedBuilder } = require("discord.js");
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
            contextManager.cleanupOldData();
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
            await gameManager.handleButtonInteraction(interaction);
        } catch (error) {
            Logger.error("Game interaction error", error.message);
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
        return; // Skip other processing for bot messages
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

    if (message.content === "!cowsay join") {
        await gameManager.handleJoinCommand(message);
        return;
    }

    if (message.content === "!cowsay balance") {
        const balance = currencyManager.getBalance(message.author.id);
        message.reply(`🪙 You have **${balance}** coins!`);
        return;
    }

    if (message.content === "!cowsay daily") {
        const result = currencyManager.getDailyBonus(message.author.id);
        if (result.success) {
            message.reply(
                `🎁 Daily bonus claimed! +${result.amount} coins! New balance: **${result.newBalance}** coins 🪙`
            );
        } else {
            message.reply(`❌ ${result.message}`);
        }
        return;
    }

    if (message.content === "!cowsay leaderboard") {
        const leaderboard = currencyManager.getLeaderboard();
        if (leaderboard.length === 0) {
            message.reply("No players found! 🪙");
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("🏆 Coin Leaderboard")
            .setColor(0xffd700)
            .setDescription(
                leaderboard
                    .map((player, index) => {
                        const medal =
                            index === 0
                                ? "🥇"
                                : index === 1
                                ? "🥈"
                                : index === 2
                                ? "🥉"
                                : `${index + 1}.`;
                        return `${medal} <@${player.userId}>: **${player.balance}** coins`;
                    })
                    .join("\n")
            )
            .setFooter({ text: "Play blackjack to earn more coins!" });

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

        const balance = currencyManager.getBalance(message.author.id);
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
        const count = leaderboardHandler.clearAllPending();
        message.reply(
            `Cleared ${count} pending leaderboard(s) from all channels! 🧹`
        );
        return;
    }

    if (message.content === "!toggleautoreply") {
        const enabled = await autoReply.toggle();
        message.reply(
            `Auto-reply to "cowsay" mentions is now ${
                enabled ? "enabled" : "disabled"
            }! 🐄`
        );
        return;
    }

    if (message.content === "!toggleintent") {
        const mode = await intentDetector.toggle();
        const modeEmojis = { LLM: "🧠", EMBEDDING: "🔍", REGEX: "⚙️" };
        message.reply(
            `Intent detection is now using ${mode} mode! ${modeEmojis[mode]}`
        );
        return;
    }

    if (message.content === "!showconfig") {
        const autoReplyEnabled = autoReply.isEnabled();

        const embed = new EmbedBuilder()
            .setTitle("⚙️ Cowsay Configuration")
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
                        intentDetector.mode === "LLM"
                            ? "🧠 LLM Mode"
                            : intentDetector.mode === "EMBEDDING"
                            ? "🔍 Embedding Mode"
                            : "⚙️ Regex Mode"
                    }\nDetects conversation continuations`,
                    inline: true,
                }
            )
            .setFooter({ text: "Use toggle commands to change settings" })
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
                llmService.buildSystemMessage(commandHandler.getSystemPrompt()),
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
                llmService.buildSystemMessage(commandHandler.getSystemPrompt()),
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
            const cow = cowsay.say({ text });
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
    if (autoReply.shouldReply(message, client.user.id)) {
        // Always collapse auto-replies
        responseCollapse.shouldCollapse(message, client.user.id);
        return;
    }

    // Intent detection - check if message seems directed at Cowsay (only if auto-reply is enabled)
    if (
        autoReply.isEnabled() &&
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
                const result = characterManager.generateAscii(char, text);
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
                    commandHandler.getSystemPrompt()
                );
                await llmService.sendResponse(msg, answer);
            } else if (autoReply.shouldReply(msg, client.user.id)) {
                const context = await contextBuilder.buildContext(
                    msg,
                    false,
                    true,
                    false
                );
                const messages = [
                    llmService.buildSystemMessage(
                        commandHandler.getSystemPrompt() +
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
                        commandHandler.getSystemPrompt()
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
                    commandHandler.getSystemPrompt() +
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
