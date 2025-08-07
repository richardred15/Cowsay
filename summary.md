# Cowsay Discord Bot - Technical Summary

## Project Overview
Discord bot built with Node.js and Discord.js v14. Primary functions: ASCII art generation, AI chat, games with currency system. Uses MySQL for persistence, supports multiple LLM providers.

## Core Architecture

### Entry Point: index.js
- Discord client initialization with required intents
- Event handlers for messageCreate and interactionCreate
- Slash command registration (/battleship, /balatro)
- Database initialization on startup
- Response collapse system for batched AI responses
- Cleanup intervals for old data

### Key Modules

#### LLM Integration
- **llmProvider.js**: Abstraction layer for AI providers (Groq, OpenAI, local)
- **llmService.js**: Message formatting and response generation
- **intentDetector.js**: Detects when messages are directed at bot (LLM/Embedding/Regex modes)
- **contextBuilder.js**: Builds conversation context from message history
- **contextManager.js**: Manages channel/thread conversation contexts

#### Game System
- **gameManager.js**: Central game coordinator, routes interactions
- **games/**: Individual game implementations
  - **blackjack.js**: Full multiplayer with lobbies, betting, currency integration
  - **battleship.js**: Web-based real-time game with external API
  - **balatro.js**: Poker scoring game with MySQL persistence
  - **pong.js**: 2-player ASCII paddle game (1 FPS)
  - **tictactoe.js**: Basic 2-player grid game

#### Utilities
- **characterManager.js**: Loads ASCII art characters from files
- **cardRenderer.js**: Generates ASCII playing cards with custom emojis
- **currencyManager.js**: Coin system with daily bonuses, leaderboards
- **pagination.js**: Handles paginated embeds with navigation buttons
- **rateLimiter.js**: Prevents spam and abuse
- **security.js**: Input validation and sanitization
- **logger.js**: Structured logging with debug levels

### Database Integration
- **database.js**: MySQL connection pool, schema management, migrations
- **schema.json**: Table definitions with versioning (current: v3)
- Auto-creates database and tables on startup
- Handles index creation with duplicate key error handling
- Used for Balatro persistence, currency system, per-server config, rivals

## Game Implementations

### Blackjack
- **Phases**: Setup → Betting → Playing → Results
- **Modes**: Single player, multiplayer (AI dealer), multiplayer (player dealer)
- **Features**: Lobbies with countdown timers, betting system, currency integration
- **UI**: Interactive embeds with buttons for Hit/Stand/Double Down
- **Multiplayer**: Threads for game isolation, private hand info via ephemeral messages

### Battleship
- **External Integration**: Uses richard.works API for game logic
- **Flow**: Create game → Get player links → Web-based ship placement → Discord updates
- **Features**: Real-time game state updates, private player links
- **WebSocket**: battleshipClient.js handles real-time communication

### Balatro
- **Persistence**: Full MySQL integration for game state
- **Mechanics**: Poker hand evaluation, blind progression, chip accumulation
- **Features**: Card selection via buttons, hand evaluation, ante progression
- **Database**: Loads active games on startup, saves state after each action

### Pong
- **Mechanics**: 20x10 ASCII field, ball physics, paddle collision
- **Controls**: Shared up/down buttons, player validation
- **Flow**: Waiting → Join → Countdown → Playing → End
- **Rendering**: ASCII art with boundaries, paddles, ball

## Technical Details

### Discord.js Integration
- **Intents**: Guilds, GuildMessages, MessageContent, GuildMembers
- **Interactions**: Slash commands, button interactions, message commands
- **Embeds**: Extensive use for game UIs and help systems
- **Ephemeral Messages**: Uses MessageFlags.Ephemeral (deprecated ephemeral: true fixed)

### AI Features
- **Providers**: Groq (primary), OpenAI, local models via LM Studio/Ollama
- **Context**: Channel-based conversation memory
- **Auto-reply**: Responds to "cowsay" mentions
- **Intent Detection**: Multiple modes for conversation continuation
- **Threading**: Creates threads for extended conversations

### Error Handling
- **Graceful Degradation**: Games continue if database fails
- **Interaction Timeouts**: Proper deferUpdate() usage
- **Database Errors**: Handles connection failures, duplicate keys
- **Rate Limiting**: Per-user limits with cleanup

### Configuration
- **Environment Variables**: All settings via .env file
- **Per-Server Config**: Database-backed auto-reply and intent detection settings
- **Rivals System**: Per-server rival bot configuration with custom descriptions
- **Dynamic Config**: Runtime toggles affect individual servers
- **Validation**: Required vs optional settings with defaults

## File Structure
```
├── index.js                 # Main entry point
├── config.js               # Configuration management
├── schema.json             # Database schema
├── .env.example            # Environment template
├── modules/
│   ├── games/              # Game implementations
│   ├── llmProvider.js      # AI integration
│   ├── database.js         # MySQL connection
│   ├── gameManager.js      # Game coordination
│   ├── currencyManager.js  # Coin system
│   ├── cardRenderer.js     # ASCII cards
│   └── ...                 # Utility modules
```

## Dependencies
- **discord.js**: ^14.0.0 - Discord API wrapper
- **mysql2**: ^3.6.0 - MySQL database driver
- **groq-sdk**: ^0.3.0 - Groq AI integration
- **cowsay**: ^1.5.0 - ASCII art generation
- **dotenv**: ^16.0.0 - Environment variables
- **ws**: ^8.14.0 - WebSocket for Battleship

## Known Issues & Limitations
- Custom emojis don't work in code blocks (Discord limitation)
- Slash commands require applications.commands scope
- Database required for Balatro, optional for other games
- Rate limiting is memory-based (resets on restart)
- Battleship depends on external API availability

## Development Patterns
- **Modular Design**: Each game is self-contained
- **Consistent Interfaces**: All games implement start() and handleInteraction()
- **Error Boundaries**: Try-catch blocks with graceful fallbacks
- **Async/Await**: Modern JavaScript patterns throughout
- **Event-Driven**: Discord events drive all interactions
- **State Management**: In-memory for temporary, MySQL for persistent

## Security Considerations
- **Input Validation**: All user input sanitized
- **Rate Limiting**: Prevents spam and abuse
- **SQL Injection**: Parameterized queries only
- **PII Handling**: Generic placeholders in examples
- **Credential Management**: Environment variables only