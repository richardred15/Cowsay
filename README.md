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
- **Blackjack**: Full multiplayer with betting system
- **Battleship**: Real-time naval combat (slash command)
- **Balatro**: Poker-based scoring game (slash command)
- **Pong**: Classic 2-player paddle game with AI opponent
- **Tic-Tac-Toe**: Challenge other players
- **Universal Coin System**: Database-backed currency with streak bonuses
- **Perfect Game Bonuses**: Extra rewards for exceptional performance
- **Transaction History**: Complete audit trail of all coin movements
- **Game Statistics**: Comprehensive outcome tracking with privacy controls

### 🛠️ Utilities
- **Card Renderer**: ASCII playing cards with custom emojis
- **Pagination**: Browse large lists efficiently
- **Rate Limiting**: Prevents spam and abuse
- **Persistent Storage**: MySQL database for game states
- **Permission System**: Discord-native role-based access control
- **Statistics Dashboard**: Personal and server analytics with privacy controls

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

### Currency
- `!cowsay balance` - Check your coins
- `!cowsay daily` - Claim daily bonus
- `!cowsay leaderboard` - Top coin holders
- `!cowsay transactions` - View transaction history

### Statistics
- `!cowsay stats` - View your personal game statistics
- `!cowsay serverstats` - View server game statistics (moderator+)
- `!cowsay optout` - Opt out of statistics tracking
- `!cowsay optin` - Opt back into statistics tracking

### Permissions
- `!cowsay permissions` - View current permission settings (admin+)
- `!cowsay setperm <role> <level>` - Map Discord role to permission level (admin+)

### Utilities
- `!characters` - Browse ASCII characters
- `!cowsay help` - Show all commands
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

### ⭕ Tic-Tac-Toe
- Challenge other players
- Interactive button-based gameplay
- Win detection and draw handling

## Coin Rewards System

### Base Rewards
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
- **Transaction History**: `!cowsay transactions` shows last 10 transactions

## Architecture

### Core Modules
- **LLM Integration**: Groq, OpenAI, or local model support
- **Game Manager**: Unified game system with interaction routing
- **Currency System**: Database-backed coin economy with streak bonuses and transaction logging
- **Context Management**: Conversation history and threading
- **Security**: Input validation and rate limiting
- **Statistics System**: Comprehensive game outcome tracking with privacy controls
- **Permission System**: Discord-native role-based access control
- **Rivals System**: Per-server rival bot configuration for dynamic AI behavior

### Database Schema (v7)
- **User Currency**: Balances, streaks, daily bonuses, and earnings tracking
- **Coin Transactions**: Complete audit trail of all coin movements
- **Balatro Games**: Persistent poker game states
- **Game Outcomes**: Comprehensive statistics for all games
- **Server Rivals**: Per-server rival bot configurations
- **Role Permissions**: Discord role to permission level mappings
- **User Preferences**: Privacy settings and opt-out controls

### File Structure
```
├── modules/
│   ├── games/              # Game implementations
│   ├── llmProvider.js      # AI model integration
│   ├── gameManager.js      # Game coordination
│   ├── database.js         # MySQL connection
│   ├── gameStats.js        # Statistics tracking
│   ├── discordPermissions.js # Permission system
│   ├── rivalManager.js     # Rival bot management
│   └── ...                 # Other utility modules
├── config.js               # Configuration management
├── index.js               # Main bot entry point
└── schema.json            # Database schema (v7)
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