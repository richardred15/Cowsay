# Cowsay Discord Bot - Project Summary

## Overview
A Discord bot that generates ASCII art cows with custom messages, featuring interactive games, currency system, and AI-powered chat capabilities.

## Development History

### Context System Unification
- Unified multiple context systems (channelContext, contextBuilder, memberCache, leaderboardHistory) into single contextManager
- Hierarchical structure: Server → Channel → Thread → Reply Chain
- Per-server leaderboard tracking with automatic cleanup

### Response Collapse System
- Implemented message batching to prevent spam responses
- 2-second window for collapsing multiple quick interactions
- Handles both single and batched message processing

### Intent Detection & Auto-Reply
- Fixed intent detection to respect auto-reply toggle settings
- Added dismissive phrase handling ("stop talking", "go away") with 30-second cooldowns
- Multiple detection modes: LLM, Embedding, Regex

### Game System Architecture
- Modular game system with pluggable game modules
- Support for both single-player and multiplayer modes
- Button-based interactions with proper state management

### Blackjack Game Implementation
- Complete blackjack game with lobby system and mode selection
- Threading system: lobbies in main channel, gameplay in dedicated threads
- Proper card mechanics, turn management, and visual feedback
- Individual betting system allowing different bet amounts per player
- Enhanced UI with spectator views and always-visible action buttons

### Currency System
- Internal currency system with 1000 starting coins
- Daily bonus system with cooldowns
- Per-server leaderboards with top player tracking
- Integration with blackjack betting and payouts (2x win, 2.5x blackjack, 1x push)

### Command Aliases
- Added `!blackjack` as alias for `!cowsay play blackjack`
- Supports both interactive setup and quick game modes

## Current File Structure

### Core Files
- `index.js` - Main bot file with command routing and event handling
- `modules/contextManager.js` - Unified context management system
- `modules/responseCollapse.js` - Message batching system
- `modules/gameManager.js` - Game system coordinator
- `modules/currencyManager.js` - Currency and leaderboard management

### Game Modules
- `modules/games/blackjack.js` - Complete blackjack implementation
- `modules/games/tictactoe.js` - Tic-tac-toe game module

### Support Modules
- `modules/commandHandler.js` - Help system and command validation
- `modules/intentDetector.js` - AI-powered intent detection
- `modules/autoReply.js` - Auto-reply configuration
- Various other modules for LLM, security, logging, etc.

## Key Commands

### Basic Commands
- `!cowsay <text>` - Generate ASCII cow
- `!ask <question>` - Ask AI questions
- `!chat <question>` - Start threaded conversation
- `!help` - Show all commands

### Game Commands
- `!cowsay games` - View available games
- `!cowsay play blackjack` - Interactive blackjack setup
- `!blackjack` - Alias for interactive setup
- `!blackjack <mode> <bet>` - Quick blackjack (single/player/dealer)
- `!cowsay join` - Join multiplayer lobbies

### Currency Commands
- `!cowsay balance` - Check coin balance
- `!cowsay daily` - Claim daily bonus
- `!cowsay leaderboard` - View top players

### Configuration
- `!toggleautoreply` - Toggle auto-reply to "cowsay" mentions
- `!toggleintent` - Cycle intent detection modes
- `!showconfig` - Display current settings

## Architecture Patterns

### Modular Design
- Each major feature in separate module
- Clear separation of concerns
- Pluggable game system for easy expansion

### State Management
- Unified context system with automatic cleanup
- Game state tracking with proper lifecycle management
- Currency persistence with JSON storage

### User Experience
- Response collapse prevents spam
- Threading keeps games separate from chat
- Always-visible UI elements with proper turn enforcement
- Comprehensive error handling and user feedback

### Performance Considerations
- Automatic cleanup of old data every hour
- Rate limiting for resource-intensive commands
- Efficient context caching and retrieval

## Current Status
- Fully functional blackjack game with all features implemented
- Stable currency system with proper balance tracking
- Robust context management preventing memory leaks
- Command alias system for improved user experience
- Ready for additional game modules or feature expansion