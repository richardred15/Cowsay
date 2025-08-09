# Cowsay Discord Bot - Technical Summary

## Project Overview
Enterprise-grade Discord bot built with Node.js and Discord.js v14. Primary functions: ASCII art generation, AI chat, games with comprehensive currency system, inventory management, gifting system, and Discord-native permissions. Features modular architecture with built-in security framework. Uses MySQL for persistence, supports multiple LLM providers.

## Developer Profile
- **Coding Style**: Prefers minimal, efficient implementations
- **Architecture Preference**: Modular, security-first design
- **Quality Focus**: Clean code, proper error handling, comprehensive documentation
- **Security Awareness**: Detail-oriented about vulnerabilities and proper fixes
- **Performance Priority**: Database optimization, memory leak prevention important

## Core Architecture

### Entry Point: index.js
- Discord client initialization with required intents
- Event handlers for messageCreate and interactionCreate
- Slash command registration (/battleship, /balatro)
- Database initialization on startup
- Response collapse system for batched AI responses
- Cleanup intervals for old data

### Key Modules

#### Security Framework (NEW)
- **security.js**: Comprehensive input validation, SQL injection prevention, authorization
- **secureLogger.js**: Log injection prevention with input sanitization
- **cryptoRandom.js**: Cryptographically secure random number generation
- **modules/commands/baseCommand.js**: Secure command foundation with built-in validation

#### Modular Command System (NEW)
- **modules/commands/baseCommand.js**: Base class with security and permission checking
- **modules/commands/adminCommand.js**: Admin commands with pagination support
- **modules/commands/balanceCommand.js**: Currency commands with secure logging
- **Command Architecture**: Extracted from monolithic index.js for scalability

#### Inventory & Gifting System (NEW)
- **inventoryManager.js**: Complete ownership tracking with acquisition history
- **giftManager.js**: Gifting system with 10% fee, validation, and transaction logging
- **Wishlist System**: Public wishlists with integrated gifting functionality
- **Database Schema v10**: New tables for inventory, gifts, and wishlists

#### LLM Integration
- **llmProvider.js**: Abstraction layer for AI providers (Groq, OpenAI, local)
- **llmService.js**: Message formatting and response generation
- **intentDetector.js**: Detects when messages are directed at bot (LLM/Embedding/Regex modes)
- **contextBuilder.js**: Builds conversation context from message history
- **contextManager.js**: Manages channel/thread conversation contexts

#### Game System
- **gameManager.js**: Central game coordinator with memory leak prevention and cleanup
- **games/**: Individual game implementations with cryptographic security
  - **roulette.js**: European roulette with animated wheel, multiple bet types, dealer personality
  - **blackjack.js**: Full multiplayer with crypto-secure shuffling, betting, currency integration
  - **battleship.js**: Web-based real-time game with secure WebSocket (wss://)
  - **balatro.js**: Poker scoring game with MySQL persistence and parameterized queries
  - **pong.js**: 2-player ASCII paddle game with XSS protection
  - **tictactoe.js**: Basic 2-player grid game

#### Enhanced Utilities
- **characterManager.js**: Loads ASCII art characters from files
- **cardRenderer.js**: Generates ASCII playing cards with custom emojis
- **currencyManager.js**: Coin system with daily bonuses, leaderboards, SQL injection fixes
- **pagination.js**: Enhanced pagination with authorization checks and proper formatting
- **rateLimiter.js**: Prevents spam and abuse
- **gameStats.js**: Comprehensive game outcome tracking with privacy controls
- **discordPermissions.js**: Discord-native permission system with role mapping
- **rivalManager.js**: Per-server rival bot configuration and management

### Database Integration
- **database.js**: MySQL connection pool with optimization, schema management, migrations
- **schema.json**: Table definitions with versioning (current: v10)
- Auto-creates database and tables on startup
- Handles index creation with duplicate key error handling
- **Tables**: Balatro games, currency, server config, rivals, role permissions, game outcomes, user preferences, **user_inventory**, **gift_transactions**, **user_wishlists**
- **Statistics**: Comprehensive game outcome tracking with privacy controls
- **Security**: All queries use parameterized statements to prevent SQL injection
- **Performance**: Concurrent operations with Promise.all, optimized queries

## Game Implementations

### Roulette
- **Wheel Type**: European roulette (37 numbers: 0-36)
- **Bet Types**: Red/black, even/odd, low/high (1-18/19-36), straight numbers
- **Payouts**: 1:1 for outside bets, 35:1 for straight number bets
- **Animation**: 25-frame progressive slowdown with ASCII wheel display
- **UI Features**: Live betting display, countdown timer, dealer personality messages
- **Currency Integration**: Net result system - awards winnings regardless of profit/loss
- **Statistics**: Win/loss tracking, bet analysis, profit/loss calculations

### Blackjack
- **Phases**: Setup → Betting → Playing → Results
- **Modes**: Single player, multiplayer (AI dealer), multiplayer (player dealer)
- **Features**: Lobbies with countdown timers, betting system, currency integration
- **UI**: Interactive embeds with buttons for Hit/Stand/Double Down
- **Multiplayer**: Threads for game isolation, private hand info via ephemeral messages
- **Statistics**: Win/loss/push tracking, bet amounts, payout analysis

### Battleship
- **External Integration**: Uses richard.works API for game logic
- **Flow**: Create game → Get player links → Web-based ship placement → Discord updates
- **Features**: Real-time game state updates, private player links
- **WebSocket**: battleshipClient.js handles real-time communication
- **Statistics**: Win/loss tracking, turn counts, game duration

### Balatro
- **Persistence**: Full MySQL integration for game state
- **Mechanics**: Poker hand evaluation, blind progression, chip accumulation
- **Features**: Card selection via buttons, hand evaluation, ante progression
- **Database**: Loads active games on startup, saves state after each action
- **Statistics**: Ante progression tracking, final scores, completion rates

### Pong
- **Mechanics**: 30x10 ASCII field, ball physics, paddle collision
- **Controls**: Shared up/down buttons, player validation, AI support
- **Flow**: Waiting → Join/AI → Countdown → Playing → End
- **AI Logic**: Simple ball tracking with 1-pixel movement per update
- **Rendering**: ASCII art with boundaries, paddles, ball
- **Statistics**: Win/loss tracking, game duration, AI vs human performance

## Technical Details

### Discord.js Integration
- **Intents**: Guilds, GuildMessages, MessageContent, GuildMembers
- **Interactions**: Slash commands, button interactions, message commands
- **Embeds**: Extensive use for game UIs and help systems
- **Ephemeral Messages**: Uses MessageFlags.Ephemeral (deprecated ephemeral: true fixed)
- **Permissions**: Native Discord permission checking with role mapping support

### AI Features
- **Providers**: Groq (primary), OpenAI, local models via LM Studio/Ollama
- **Context**: Channel-based conversation memory with rival bot integration
- **Auto-reply**: Responds to "cowsay" mentions with per-server configuration
- **Intent Detection**: Multiple modes for conversation continuation
- **Threading**: Creates threads for extended conversations
- **Rivals System**: Dynamic AI behavior based on configured rival bots per server

### Error Handling
- **Graceful Degradation**: Games continue if database fails
- **Interaction Timeouts**: Proper deferUpdate() usage
- **Database Errors**: Handles connection failures, duplicate keys
- **Rate Limiting**: Per-user limits with cleanup

### Configuration
- **Environment Variables**: All settings via .env file
- **Per-Server Config**: Database-backed auto-reply and intent detection settings
- **Rivals System**: Per-server rival bot configuration with custom descriptions
- **Permissions System**: Discord-native role-based access control with custom mappings
- **Dynamic Config**: Runtime toggles affect individual servers
- **Validation**: Required vs optional settings with defaults

## File Structure
```
├── index.js                 # Main entry point (updated to use modular commands)
├── config.js               # Configuration management
├── schema.json             # Database schema (v10)
├── .env.example            # Environment template
├── IMPLEMENTATION_STATUS.md # Comprehensive project status
├── README.md               # Updated with all new features
├── modules/
│   ├── commands/           # NEW: Modular command system
│   │   ├── baseCommand.js  # Secure command foundation
│   │   ├── adminCommand.js # Admin commands with pagination
│   │   └── balanceCommand.js # Balance and currency commands
│   ├── games/              # Game implementations (security hardened)
│   ├── llmProvider.js      # AI integration
│   ├── database.js         # MySQL connection with optimization
│   ├── gameManager.js      # Game coordination with cleanup
│   ├── currencyManager.js  # Coin system (SQL injection fixed)
│   ├── inventoryManager.js # NEW: Inventory tracking
│   ├── giftManager.js      # NEW: Gifting system
│   ├── cardRenderer.js     # ASCII cards
│   ├── gameStats.js        # Statistics tracking
│   ├── discordPermissions.js # Permission system
│   ├── rivalManager.js     # Rival bot management
│   ├── security.js         # NEW: Security framework
│   ├── secureLogger.js     # NEW: Secure logging
│   ├── cryptoRandom.js     # NEW: Crypto-secure random
│   ├── pagination.js       # Enhanced pagination
│   └── ...                 # Other utility modules
```

## Dependencies
- **discord.js**: ^14.0.0 - Discord API wrapper
- **mysql2**: ^3.6.0 - MySQL database driver
- **groq-sdk**: ^0.3.0 - Groq AI integration
- **cowsay**: ^1.5.0 - ASCII art generation
- **dotenv**: ^16.0.0 - Environment variables
- **ws**: ^8.14.0 - WebSocket for Battleship

## Major Development Phases Completed

### Phase 5: Inventory & Gifting System (COMPLETE)
- **Database Migration**: v9 → v10 with new inventory, gift, and wishlist tables
- **Complete Ownership Tracking**: Items with acquisition method, date, and source
- **Gifting System**: Send items to other users with 10% fee and transaction logging
- **Wishlist System**: Public wishlists with integrated gifting functionality
- **Enhanced Shop Interface**: Gift buttons, dynamic pricing, ownership indicators

### Sprint 1 & 2: Critical Security Fixes (COMPLETE)
- **SQL Injection Prevention**: Fixed parameterized queries across all operations
- **Log Injection Protection**: Secure logging with input sanitization
- **XSS Prevention**: Sanitized user inputs in game embeds
- **Cryptographic Security**: Replaced insecure random with crypto-secure generation
- **Authorization Framework**: Comprehensive permission validation system
- **Performance Optimization**: Eliminated lazy loading, optimized database queries
- **Memory Leak Prevention**: Automatic cleanup for abandoned game sessions

### Phase 6: UI/UX Polish & Architecture (COMPLETE)
- **Modular Command System**: Extracted commands into BaseCommand architecture
- **Enhanced Pagination**: Fixed formatting issues, improved navigation
- **Admin Interface**: Paginated help system with proper markdown rendering
- **Command Migration**: Moved from monolithic to modular architecture

### Phase 7: Roulette Game Implementation (COMPLETE)
- **European Roulette**: Complete implementation with 37-number wheel
- **Advanced UI**: Animated spinning wheel, live betting display, dealer messages
- **Currency Integration**: Fixed critical bugs in first-win bonus and payout logic
- **Comprehensive Testing**: Unit, integration, and performance test suites
- **Bug Fixes**: Date comparison, streak logic, display calculations

## Future Enhancements

### Phase 8: Planned Features
- **Complete Index.js Refactor**: Move remaining commands to modular architecture
- **Enhanced Error Recovery**: Implement game state recovery mechanisms
- **Performance Monitoring**: Add metrics and monitoring for system health
- **New Games**: Rock-Paper-Scissors, Dice Roll, Coin Flip
- **Advanced Social Features**: Trading system, teams, guilds
- **Tournament System**: Organized competitions with brackets and prizes
- **Achievement System**: Unlockable badges based on statistics

## New Features Summary

### Statistics System
- **Comprehensive Tracking**: All games record outcomes, durations, scores
- **Privacy Controls**: User opt-out system with data deletion
- **Analytics Commands**: Personal stats, server stats, leaderboards
- **Permission Integration**: Server stats require moderator access

### Permission System
- **Discord-Native**: Uses Discord roles and permissions as foundation
- **Custom Mapping**: Servers can assign roles to permission levels
- **Hierarchical**: Owner > Admin > Moderator > Helper > User
- **Extensible**: Easy to add new permission requirements

### Rivals System
- **Per-Server Configuration**: Each server manages its own rival bots
- **Dynamic AI Behavior**: AI adapts based on configured rivals
- **Embed Parsing**: Extracts content from rival bot embeds for context
- **Admin Controls**: Add/remove/list rivals with custom descriptions

## Known Issues & Limitations
- Custom emojis don't work in code blocks (Discord limitation)
- Slash commands require applications.commands scope
- Database required for statistics and Balatro, optional for other games
- Rate limiting is memory-based (resets on restart)
- Battleship depends on external API availability
- Statistics tracking requires user consent (privacy-first approach)

## Development Patterns
- **Modular Design**: Each game is self-contained with statistics integration
- **Consistent Interfaces**: All games implement start(), handleInteraction(), and recordOutcome()
- **Error Boundaries**: Try-catch blocks with graceful fallbacks
- **Async/Await**: Modern JavaScript patterns throughout
- **Event-Driven**: Discord events drive all interactions
- **State Management**: In-memory for temporary, MySQL for persistent
- **Privacy by Design**: Built-in data protection and user control mechanisms
- **Permission Framework**: Extensible Discord-native access control

## Security Considerations (MAJOR OVERHAUL COMPLETED)
- **Comprehensive Security Framework**: 12+ critical vulnerabilities resolved
- **SQL Injection Prevention**: All queries use parameterized statements
- **Log Injection Prevention**: Secure logging with input sanitization
- **XSS Protection**: User display names sanitized in game embeds
- **Cryptographic Security**: Replaced Math.random() with crypto-secure generation
- **Authorization Framework**: Centralized permission validation
- **Secure Connections**: WebSocket upgraded from ws:// to wss://
- **Input Validation**: Comprehensive sanitization across all modules
- **Rate Limiting**: Built-in spam and abuse prevention
- **PII Handling**: Generic placeholders in examples
- **Credential Management**: Environment variables only
- **Permission Security**: Role-based access with Discord integration
- **Privacy Controls**: User opt-out system, data deletion, GDPR compliance
- **Statistics Privacy**: Anonymized tracking with user consent
- **Memory Leak Prevention**: Automatic cleanup for abandoned sessions
- **Performance Security**: Eliminated lazy loading, optimized queries