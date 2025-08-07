class CardRenderer {
    constructor() {
        //this.suits = {
        //    spades: "<:spades~1:1403085044897022114>",
        //    hearts: "<:hearts~1:1403085042309140501>",
        //    diamonds: "<:diamonds~1:1403085040124170323>",
        //    clubs: "<:clubs~1:1403085038010110033>",
        //};
        this.suits = {
            spades: "♠",
            hearts: "♥",
            diamonds: "♦",
            clubs: "♣",
        };
    }

    renderBack() {
        return [
            "┌─────────┐",
            "│░░░░░░░░░│",
            "│░░░░░░░░░│",
            "│░░░░░░░░░│",
            "│░░░░░░░░░│",
            "│░░░░░░░░░│",
            "│░░░░░░░░░│",
            "│░░░░░░░░░│",
            "└─────────┘",
        ].join("\n");
    }

    renderCard(rank, suit) {
        const suitEmoji = this.suits[suit.toLowerCase()] || suit;
        if (rank === "B") return this.renderBack();
        const displayRank = rank === "10" ? "10" : rank.padEnd(2);

        return [
            "┌─────────┐",
            `│${displayRank}       │`,
            "│         │",
            "│         │",
            `│    ${suitEmoji}    │`,
            "│         │",
            "│         │",
            `│       ${displayRank}│`,
            "└─────────┘",
        ].join("\n");
    }

    renderCards(cards) {
        if (cards.length === 0) return "";

        const cardLines = cards.map((card) =>
            this.renderCard(card.rank, card.suit).split("\n")
        );
        const result = [];

        for (let i = 0; i < 9; i++) {
            result.push(cardLines.map((lines) => lines[i]).join(""));
        }

        return result.join("\n");
    }

    getRandomCard() {
        const ranks = [
            "A",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10",
            "J",
            "Q",
            "K",
            "B",
        ];
        const suits = ["spades", "hearts", "diamonds", "clubs"];

        return {
            rank: ranks[Math.floor(Math.random() * ranks.length)],
            suit: suits[Math.floor(Math.random() * suits.length)],
        };
    }
}

module.exports = new CardRenderer();
