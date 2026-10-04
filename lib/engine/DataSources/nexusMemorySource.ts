import {
    searchMemories,
    type Memory,
} from '@lib/memory/Memory'

import { DataSource } from './types'

const MEMORY_SOURCE_NAME = 'nexus_memory'
const MAX_MEMORY_RESULTS = 5

const formatMemory = (memory: Memory): string => {
    return `[${memory.type}] ${memory.content}`
}

const createNexusMemoryDataSource = (): DataSource => ({
    name: MEMORY_SOURCE_NAME,

    // Memory is supplemental. It must never take priority
    // over the normal character/chat context.
    priority: 100,

    // Zero means opportunistic in the existing ContextBuilder.
    tokenBudget: 0,

    retrieve: async (
        params,
        messages,
        maxLength,
        currentLength,
    ) => {
        /*
         * Memory must NEVER be allowed to break normal inference.
         * Every operation is protected so a memory/database/tokenizer
         * problem simply results in no memory being injected.
         */

        try {
            if (
                !Array.isArray(messages) ||
                messages.length === 0
            ) {
                return []
            }

            const lastMessage =
                messages[messages.length - 1]

            if (
                !lastMessage ||
                lastMessage.role !== 'user'
            ) {
                return []
            }

            /*
             * Character cards and multimodal messages can potentially
             * provide content in a non-string format. Memory retrieval
             * only needs plain text.
             */
            const rawContent =
                typeof lastMessage.content === 'string'
                    ? lastMessage.content
                    : ''

            const query =
                rawContent.trim()

            if (!query) {
                return []
            }

            /*
             * Search the local memory database.
             *
             * If SQLite has any problem, silently skip memory rather
             * than allowing it to interrupt generation.
             */
            let memories: Memory[] = []

            try {
                memories =
                    searchMemories(
                        query,
                        MAX_MEMORY_RESULTS,
                    )
            } catch {
                return []
            }

            if (
                !Array.isArray(memories) ||
                memories.length === 0
            ) {
                return []
            }

            const content =
                memories
                    .map(formatMemory)
                    .filter(
                        (item) =>
                            item.trim().length > 0
                    )
                    .join('\n')

            if (!content.trim()) {
                return []
            }

            /*
             * Ask the existing tokenizer how much room the memory
             * insertion requires.
             *
             * If tokenization fails, skip memory.
             */
            let tokenLength = 0

            try {
                tokenLength =
                    await params.tokenizer(
                        content
                    )
            } catch {
                return []
            }

            if (
                !Number.isFinite(tokenLength) ||
                tokenLength <= 0
            ) {
                return []
            }

            /*
             * Never allow memory to consume the entire context.
             */
            if (
                !Number.isFinite(maxLength) ||
                !Number.isFinite(currentLength)
            ) {
                return []
            }

            if (
                currentLength + tokenLength >
                maxLength
            ) {
                return []
            }

            return [
                {
                    content,
                    source:
                        MEMORY_SOURCE_NAME,
                    tokenLength,

                    /*
                     * Inject memory alongside the existing system
                     * context without modifying the character card,
                     * chat messages, or model settings.
                     */
                    position: {
                        type: 'relative',
                        location: 'afterSystem',
                    },
                },
            ]
        } catch {
            /*
             * Absolute final safety net.
             *
             * A memory failure must NEVER become a chat-generation
             * failure.
             */
            return []
        }
    },
})

export default createNexusMemoryDataSource
