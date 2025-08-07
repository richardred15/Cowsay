# Battleship Bot WebSocket API

## Connection
- Endpoint: `ws://localhost/projects/BattleShip/api/bot`
- Localhost only - external connections denied

## Bot → Server Messages

### Create Game
```json
{
  "type": "create_game"
}
```

### Get ASCII Board
```json
{
  "type": "get_ascii",
  "gameId": "abc123"
}
```

### Subscribe to Game Updates
```json
{
  "type": "subscribe_game",
  "gameId": "abc123"
}
```

## Server → Bot Messages

### Game Created
```json
{
  "type": "game_created",
  "gameId": "abc123",
  "player1Link": "https://richard.works/projects/BattleShip/?game=abc123&token=secure_token_1",
  "player2Link": "https://richard.works/projects/BattleShip/?game=abc123&token=secure_token_2"
}
```

### ASCII Response
```json
{
  "type": "ascii_response",
  "gameId": "abc123",
  "ascii": "**Player 1 Grid:**\n```\n...\n```",
  "phase": "battle"
}
```

### Game Update (when subscribed)
```json
{
  "type": "game_update",
  "gameId": "abc123",
  "updateType": "attack|ship_placed|battle_start|game_reset",
  "data": { "x": 5, "y": 3, "hit": true, "phase": "battle" }
}
```

### Subscription Confirmed
```json
{
  "type": "subscribed",
  "gameId": "abc123"
}
```

### Error Response
```json
{
  "type": "error",
  "message": "Game not found"
}
```

## Security
- Unique 64-character hex tokens per player
- Tokens required for bot-created games
- Localhost-only WebSocket access
- Non-guessable game links

## Game Phases
- `waiting_for_players` - Bot-created game waiting for both players
- `waiting_for_player` - Regular private game waiting for second player
- `setup` - Players placing ships
- `battle` - Game in progress
- `gameover` - Game finished

## Update Types
- `attack` - Player made an attack
- `ship_placed` - Player placed ships
- `battle_start` - Both players ready, battle begins
- `game_reset` - Players voted to play again