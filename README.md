# 🐄 Cowsay Discord Bot

A feature-rich Discord bot that generates ASCII art, plays games, provides AI-powered conversations, and tracks comprehensive statistics with Discord-native permissions.

## Features

### 💬 Chat & AI
- **AI Conversations**: `!ask <question>` or `!chat <question>`
- **Auto-reply**: Responds to "cowsay" mentions
- **Intent Detection**: Smart conversation continuation
- **Context Management**: Remembers conversation history

### 🎭 ASCII Art
- **Cowsay**: `!cowsay <text>` - Classic cow ASCII
- **Multiple Characters**: `!<character>say <text>` - 50+ ASCII characters
- **Character Browser**: `!characters` - View all available characters

### 🎮 Games & Currency
- **Roulette**: European roulette with animated wheel and multiple bet types
- **Blackjack**: Full multiplayer with betting system
- **Battleship**: Real-time naval combat (slash command)
- **Balatro**: Poker-based scoring game (slash command)
- **Pong**: Classic 2-player paddle game with AI opponent
- **Tic-Tac-Toe**: Challenge other players
- **Universal Coin System**: Database-backed currency with streak bonuses
- **Perfect Game Bonuses**: Extra rewards for exceptional performance
- **Transaction History**: Complete audit trail of all coin movements
- **Game Statistics**: Comprehensive outcome tracking with privacy controls

### 🛒 Shop & Inventory System
- **Premium Characters**: Unlock exclusive ASCII characters with coins
- **Boost Items**: Daily Boost (1000 coins), Streak Shield (1000 coins)
- **Inventory Management**: Complete ownership tracking with acquisition history
- **Gifting System**: Send items to other users with 10% fee
- **Wishlist System**: Public wishlists with integrated gifting
- **Button Interface**: Click-to-purchase with affordability indicators
- **Smart Display**: Shows active boosts, ownership status, and gift options
- **Transaction Integration**: All purchases and gifts logged with full audit trail

### 🛠️ Utilities & Security
- **Card Renderer**: ASCII playing cards with custom emojis
- **Enhanced Pagination**: Browse large lists with proper formatting and navigation
- **Security Framework**: Comprehensive input validation, SQL injection prevention, and authorization
- **Rate Limiting**: Prevents spam and abuse with built-in protection
- **Persistent Storage**: MySQL database with optimized queries and concurrent operations
- **Permission System**: Discord-native role-based access control with modular commands
- **Statistics Dashboard**: Personal and server analytics with privacy controls
- **Cryptographic Security**: Secure random generation and encrypted connections

## Quick Start

### Prerequisites
- Node.js 16+
- MySQL database
- Discord bot token
- LLM API key (Groq recommended) or local LLM setup

### Installation
```bash
git clone <repository>
cd Cowsay
npm install
```

### Configuration
Copy `.env.example` to `.env` and configure:

```env
# Discord Bot Token (REQUIRED)
DISCORD_TOKEN=your_bot_token_here

# LLM Configuration (REQUIRED)
# Supported providers: groq, openai, lmstudio, ollama
LLM_PROVIDER=groq
MODEL=llama3-70b-8192

# Provider-specific API Keys
# For Groq (recommended)
GROQ_API_KEY=your_groq_api_key_here

# For OpenAI
# OPENAI_API_KEY=your_openai_key_here

# For local models (lmstudio/ollama) - requires LLM_URL
# LLM_URL=http://localhost:1234/v1  # LM Studio
# LLM_URL=http://localhost:11434/v1 # Ollama

# Database Configuration (REQUIRED)
# Used for games, currency, statistics, permissions, and per-server config
DB_HOST=localhost
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=your_mysql_password_here
DB_NAME=cowsay

# Optional
INTENT_MODEL=llama3-8b-8192
DEBUG_LOGGING=true
```

### Bot Permissions
When inviting the bot, ensure these scopes:
- `bot`
- `applications.commands` (for slash commands)

Required permissions:
- Send Messages
- Use Slash Commands
- Embed Links
- Read Message History
- Use External Emojis

### Running
```bash
npm start
```

## Commands

### Chat Commands
- `!ask <question>` - Ask the AI anything
- `!chat <question>` - Start a conversation thread
- `!clear` - Clear conversation context

### Fun Commands
- `!cowsay <text>` - Make the cow speak
- `!<character>say <text>` - Use other ASCII characters
- `!joke` - Random dad joke
- `!rimshot` - Ba-dum-tss!
- `!cowsay embed` - Test ASCII card display

### Rivals System
- `!cowsay rival add @user <description>` - Add a rival bot
- `!cowsay rival remove @user` - Remove a rival
- `!cowsay rival list` - Show all rivals
- `!cowsay help rivals` - Learn about rivals

### Games
- `!cowsay games` - View all available games
- `!cowsay play <game>` - Start a game
- `/battleship` - Battleship (slash command)
- `/balatro` - Balatro poker (slash command)
- `!blackjack <mode> <bet>` - Quick blackjack
- `!cowsay join` - Join multiplayer lobbies

### Currency, Shop & Inventory
- `!cowsay balance` - Check your coins and active boosts
- `!cowsay daily` - Claim daily bonus with boost multipliers
- `!cowsay leaderboard` - Top coin holders (paginated)
- `!cowsay transactions` - View transaction history (paginated)
- `!cowsay shop` - Browse premium items with gift options (button interface)
- `!cowsay inventory [category]` - View your owned items with acquisition history
- `!cowsay gift @user <item> [message]` - Send items to other users
- `!cowsay gifts sent/received` - View gift transaction history
- `!cowsay wishlist add/remove <item> [message]` - Manage your wishlist
- `!cowsay wishlist @user` - View another user's wishlist
- `!cowsay help coins` - Learn about earning coins
- `!cowsay help shop` - Learn about the shop and inventory system

### Statistics
- `!cowsay stats` - View your personal game statistics
- `!cowsay serverstats` - View server game statistics (moderator+)
- `!cowsay optout` - Opt out of statistics tracking
- `!cowsay optin` - Opt back into statistics tracking

### Permissions & Admin
- `!cowsay perms setrole <level> @role` - Map Discord role to permission level (admin+)
- `!cowsay perms listroles` - Show role mappings
- `!cowsay myperms` - Check your permission level
- `!cowsay admin help` - View all admin commands with pagination (admin+)
- `!cowsay admin addcoins @user <amount> [reason]` - Add coins (admin+)
- `!cowsay admin removecoins @user <amount> [reason]` - Remove coins (admin+)
- `!cowsay admin balance @user` - Check any user's balance (admin+)
- `!cowsay admin transactions` - View all transactions with enhanced filtering (admin+)

### Utilities
- `!characters` - Browse ASCII characters (paginated)
- `!cowsay help` - Show all commands (paginated by category)
- `!showconfig` - View bot configuration (per-server)
- `!toggleautoreply` - Toggle auto-reply (per-server, admin+)
- `!toggleintent` - Cycle intent detection modes (per-server, admin+)

## Game Details

### 🃏 Blackjack
- Single player vs AI or multiplayer
- Betting system with coin rewards
- Standard rules: Hit, Stand, Double Down
- Blackjack pays 2.5x, wins pay 2x

### 🚢 Battleship
- Real-time web-based gameplay
- Private player links for ship placement
- Turn-based combat with live updates

### 🃏 Balatro
- Poker-based scoring system
- Build hands to beat blind requirements
- Persistent game state across restarts
- Ante progression with increasing difficulty

### 🏓 Pong
- Classic 2-player paddle game or single-player vs AI
- 1 FPS strategic gameplay
- Shared controls via Discord buttons
- AI opponent with simple ball-tracking logic
- First to 5 points wins

### 🎰 Roulette
- European roulette wheel (0-36)
- Multiple bet types: red/black, even/odd, low/high, straight numbers
- Animated spinning wheel with progressive slowdown
- Live betting display with real-time updates
- Dealer personality messages and winner celebrations
- 60-second betting phase with countdown timer

### ⭕ Tic-Tac-Toe
- Challenge other players
- Interactive button-based gameplay
- Win detection and draw handling

## Coin Rewards System

### Base Rewards
- **Roulette**: Variable based on bets placed and winning numbers
- **Pong**: 50 coins (win), 10 coins (participation)
- **Tic-Tac-Toe**: 30 coins (win), 5 coins (participation)
- **Battleship**: 100 coins (win), 15 coins (participation)
- **Balatro**: 25-150 coins (progressive based on ante reached)
- **Blackjack**: 2x bet (win), 2.5x bet (blackjack), bet returned (push)

### Bonus Multipliers
- **Win Streaks**: +10% per consecutive win (max 50% bonus)
- **First Win of Day**: 2x multiplier on all rewards
- **Perfect Games**: 
  - Pong shutout (5-0): +25 bonus coins
  - Balatro ante 8+: +50 bonus coins
  - Battleship perfect: Coming soon

### Daily System
- **Daily Bonus**: Up to 100 coins for players under 1000 coins
- **Streak Tracking**: Consecutive wins tracked across all games
- **Transaction History**: `!cowsay transactions` shows paginated transaction history
- **Boost System**: Daily boost (2x daily bonus) and streak shield (loss protection)

## Architecture

### Core Modules
- **LLM Integration**: Groq, OpenAI, or local model support with secure connections
- **Game Manager**: Unified game system with interaction routing and memory leak prevention
- **Currency System**: Database-backed coin economy with streak bonuses and transaction logging
- **Inventory System**: Complete ownership tracking with acquisition history and gifting
- **Security Framework**: Comprehensive input validation, SQL injection prevention, and authorization
- **Modular Commands**: BaseCommand architecture with built-in security and permission checking
- **Context Management**: Conversation history and threading with secure logging
- **Statistics System**: Comprehensive game outcome tracking with privacy controls
- **Permission System**: Discord-native role-based access control with enhanced validation
- **Rivals System**: Per-server rival bot configuration for dynamic AI behavior

### Database Schema (v10)
- **User Currency**: Balances, streaks, daily bonuses, and earnings tracking
- **Coin Transactions**: Complete audit trail of all coin movements
- **Shop Items**: Premium characters and boosts with pricing
- **User Inventory**: Complete ownership tracking with acquisition method and dates
- **Gift Transactions**: Full audit trail of all gift exchanges with fees
- **User Wishlists**: Public wishlist system with optional messages
- **Balatro Games**: Persistent poker game states
- **Game Outcomes**: Comprehensive statistics for all games
- **Server Rivals**: Per-server rival bot configurations
- **Role Permissions**: Discord role to permission level mappings
- **User Preferences**: Privacy settings and opt-out controls

### File Structure
```
├── modules/
│   ├── commands/           # Modular command system
│   │   ├── baseCommand.js  # Secure command foundation
│   │   ├── adminCommand.js # Admin commands with pagination
│   │   └── balanceCommand.js # Balance and currency commands
│   ├── games/              # Game implementations
│   ├── llmProvider.js      # AI model integration
│   ├── gameManager.js      # Game coordination with cleanup
│   ├── database.js         # MySQL connection with optimization
│   ├── gameStats.js        # Statistics tracking
│   ├── discordPermissions.js # Permission system
│   ├── rivalManager.js     # Rival bot management
│   ├── giftManager.js      # Gifting system with validation
│   ├── inventoryManager.js # Inventory tracking
│   ├── security.js         # Security framework
│   ├── secureLogger.js     # Secure logging with sanitization
│   ├── cryptoRandom.js     # Cryptographically secure random
│   ├── pagination.js       # Enhanced pagination system
│   └── ...                 # Other utility modules
├── config.js               # Configuration management
├── index.js               # Main bot entry point
└── schema.json            # Database schema (v10)
```

## Development

### Adding New Games
1. Create `modules/games/newgame.js`
2. Implement required methods: `start()`, `handleInteraction()`, `recordGameOutcome()`
3. Add to `gameManager.js` games list
4. Update help commands
5. Ensure statistics tracking is integrated

### Custom Characters
Add ASCII art files to the characters directory and they'll be automatically loaded as `!<name>say` commands.

### Permission Levels
- **Owner**: Full bot control (Discord server owner)
- **Admin**: Server configuration, rival management (Administrator permission)
- **Moderator**: View server statistics, moderate games (Manage Messages permission)
- **Helper**: Assist with basic moderation (custom role mapping)
- **User**: Standard game and chat access

### Privacy & GDPR Compliance
- Users can opt out of statistics tracking with `!cowsay optout`
- Opting out deletes all existing statistics data
- Statistics are only collected with user consent
- Data can be exported or deleted upon request

### Environment Variables
See `.env.example` for all available configuration options.

## License

MIT License - see LICENSE file for details.