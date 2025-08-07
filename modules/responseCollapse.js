class ResponseCollapse {
    constructor() {
        this.pendingResponses = new Map();
        this.collapseDelay = 3500;
        this.processor = null;
    }

    setProcessor(processorFn) {
        this.processor = processorFn;
    }

    shouldCollapse(message, clientUserId) {
        const channelId = message.channel.id;

        if (!this.pendingResponses.has(channelId)) {
            this.pendingResponses.set(channelId, {
                messages: [],
                timeout: null,
            });
        }

        const pending = this.pendingResponses.get(channelId);

        // If this is the first message, start the timer
        if (pending.messages.length === 0) {
            console.log(
                `[COLLAPSE] Starting batch timer for channel ${channelId}`
            );
            pending.timeout = setTimeout(() => {
                this.processPendingMessages(channelId);
            }, this.collapseDelay);
        }

        pending.messages.push({ message, timestamp: Date.now() });
        console.log(
            `[COLLAPSE] Added message to batch. Total: ${pending.messages.length} in channel ${channelId}`
        );
        return true; // Always collapse - batch everything
    }

    async processPendingMessages(channelId) {
        const pending = this.pendingResponses.get(channelId);
        if (!pending || pending.messages.length === 0) return;

        const messages = pending.messages.slice();
        this.pendingResponses.delete(channelId);

        console.log(
            `[COLLAPSE] Processing ${messages.length} batched messages for channel ${channelId}`
        );

        if (this.processor) {
            try {
                await this.processor(messages);
            } catch (error) {
                console.error('Error in response processor:', error);
            }
        }
    }
}

module.exports = new ResponseCollapse();
