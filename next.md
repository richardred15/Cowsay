Alright, time to add a new feature to our bot. Battleship! We'll need a game module for this, and a new command !battleship. Our battleship games will be served/managed externally and accessed over an API described in bot_client_api.md - THIS MEANS YOU ARE WRITING A CLIENT, DO NOT WRITE THE BATTLESHIP SERVER CODE. USE THE API AND ENDPOINTS DESCRIBED. THE BATTLESHIP SERVER IS ALREADY RUNNING.

The !battleship command should create a new game, send the player issuing the command the player1 link as an ephemeral message and then create an embed with our game's ascii response from the API and a button for player 2 to get their link as an ephemeral reply. The button should then go away and the embed should update the ascii from the API every time there is a game update. A win condition for display can be determined by who had the last "hit" updateType before gameover.

Make sure you review our existing code and summary.md before you proceed.

DO NOT EDIT ANY FILES, TELL ME YOUR GAMEPLAN AFTER YOU REVIEW THE PROJECT.