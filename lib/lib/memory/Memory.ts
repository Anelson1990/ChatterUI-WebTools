import { eq } from 'drizzle-orm'

import { sqliteDB } from '@db/db'

export type MemoryType =
    | 'fact'
    | 'person'
    | 'project'
    | 'preference'
    | 'decision'
    | 'event'
    | 'note'
    | 'other'

export type MemoryRecord = {
    id: number
    content: string
    type: MemoryType
    importance: number
    chatId?: number | null
    createdAt: number
    updatedAt: number
}

export type MemorySearchResult =
    MemoryRecord & {
        score: number
    }

export type AddMemoryInput = {
    content: string
    type?: MemoryType
    importance?: number
    chatId?: number | null
}

export type MemoryLink = {
    memoryId: number
    relatedMemoryId: number
    relationship: string
}

let initialized = false

const initialize = async () => {
    if (initialized) return

    await sqliteDB.execAsync(`
        CREATE TABLE IF NOT EXISTS nexus_memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            content TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'note',
            importance INTEGER NOT NULL DEFAULT 50,
            chat_id INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS nexus_memories_type_idx
            ON nexus_memories(type);

        CREATE INDEX IF NOT EXISTS nexus_memories_chat_idx
            ON nexus_memories(chat_id);

        CREATE TABLE IF NOT EXISTS nexus_memory_links (
            memory_id INTEGER NOT NULL,
            related_memory_id INTEGER NOT NULL,
            relationship TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (memory_id, related_memory_id, relationship)
        );

        CREATE INDEX IF NOT EXISTS nexus_memory_links_memory_idx
            ON nexus_memory_links(memory_id);

        CREATE INDEX IF NOT EXISTS nexus_memory_links_related_idx
            ON nexus_memory_links(related_memory_id);
    `)

    initialized = true
}

const rowToMemory = (row: any): MemoryRecord => ({
    id: Number(row.id),
    content: String(row.content ?? ''),
    type: (row.type ?? 'note') as MemoryType,
    importance: Number(row.importance ?? 50),
    chatId:
        row.chat_id === null ||
        row.chat_id === undefined
            ? null
            : Number(row.chat_id),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
})

const add = async (
    input: AddMemoryInput
): Promise<MemoryRecord> => {
    await initialize()

    const content = input.content.trim()

    if (!content) {
        throw new Error(
            'Cannot store an empty memory.'
        )
    }

    const now = Date.now()

    const type =
        input.type ?? 'note'

    const importance = Math.max(
        0,
        Math.min(
            100,
            Math.round(
                input.importance ?? 50
            )
        )
    )

    await sqliteDB.runAsync(
        `
        INSERT INTO nexus_memories
            (
                content,
                type,
                importance,
                chat_id,
                created_at,
                updated_at
            )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            content,
            type,
            importance,
            input.chatId ?? null,
            now,
            now,
        ]
    )

    const result =
        await sqliteDB.getFirstAsync(
            `
            SELECT *
            FROM nexus_memories
            WHERE id = last_insert_rowid()
            `
        )

    if (!result) {
        throw new Error(
            'Failed to create memory.'
        )
    }

    return rowToMemory(result)
}

const get = async (
    id: number
): Promise<MemoryRecord | null> => {
    await initialize()

    const result =
        await sqliteDB.getFirstAsync(
            `
            SELECT *
            FROM nexus_memories
            WHERE id = ?
            `,
            [id]
        )

    return result
        ? rowToMemory(result)
        : null
}

const update = async (
    id: number,
    changes: Partial<
        Pick<
            AddMemoryInput,
            'content' |
            'type' |
            'importance' |
            'chatId'
        >
    >
): Promise<MemoryRecord | null> => {
    await initialize()

    const existing =
        await get(id)

    if (!existing) return null

    const content =
        changes.content !== undefined
            ? changes.content.trim()
            : existing.content

    if (!content) {
        throw new Error(
            'Memory content cannot be empty.'
        )
    }

    const type =
        changes.type ??
        existing.type

    const importance =
        changes.importance !== undefined
            ? Math.max(
                  0,
                  Math.min(
                      100,
                      Math.round(
                          changes.importance
                      )
                  )
              )
            : existing.importance

    const chatId =
        changes.chatId !== undefined
            ? changes.chatId
            : existing.chatId

    await sqliteDB.runAsync(
        `
        UPDATE nexus_memories
        SET
            content = ?,
            type = ?,
            importance = ?,
            chat_id = ?,
            updated_at = ?
        WHERE id = ?
        `,
        [
            content,
            type,
            importance,
            chatId ?? null,
            Date.now(),
            id,
        ]
    )

    return get(id)
}

const remove = async (
    id: number
): Promise<boolean> => {
    await initialize()

    await sqliteDB.runAsync(
        `
        DELETE FROM nexus_memory_links
        WHERE memory_id = ?
           OR related_memory_id = ?
        `,
        [id, id]
    )

    const result =
        await sqliteDB.runAsync(
            `
            DELETE FROM nexus_memories
            WHERE id = ?
            `,
            [id]
        )

    return result.changes > 0
}

const search = async (
    query: string,
    limit = 8
): Promise<MemorySearchResult[]> => {
    await initialize()

    const cleanQuery =
        query.trim()

    if (!cleanQuery) return []

    const words = cleanQuery
        .split(/\s+/)
        .map((word) =>
            word
                .replace(
                    /[%_]/g,
                    ''
                )
                .trim()
        )
        .filter(
            (word) =>
                word.length >= 3
        )
        .slice(0, 12)

    if (words.length === 0) {
        return []
    }

    const rows =
        await sqliteDB.getAllAsync(
            `
            SELECT *
            FROM nexus_memories
            ORDER BY updated_at DESC
            LIMIT 200
            `
        )

    const results =
        rows
            .map(rowToMemory)
            .map((memory) => {
                const haystack =
                    memory.content.toLowerCase()

                let matches = 0

                for (const word of words) {
                    if (
                        haystack.includes(
                            word.toLowerCase()
                        )
                    ) {
                        matches++
                    }
                }

                const score =
                    matches * 10 +
                    memory.importance * 0.05

                return {
                    ...memory,
                    score,
                }
            })
            .filter(
                (memory) =>
                    memory.score > 0
            )
            .sort(
                (a, b) =>
                    b.score - a.score
            )
            .slice(0, limit)

    return results
}

const link = async (
    memoryId: number,
    relatedMemoryId: number,
    relationship: string
): Promise<void> => {
    await initialize()

    if (
        memoryId === relatedMemoryId
    ) {
        return
    }

    const cleanRelationship =
        relationship.trim()

    if (!cleanRelationship) {
        throw new Error(
            'Memory relationship cannot be empty.'
        )
    }

    await sqliteDB.runAsync(
        `
        INSERT OR IGNORE INTO nexus_memory_links
            (
                memory_id,
                related_memory_id,
                relationship,
                created_at
            )
        VALUES (?, ?, ?, ?)
        `,
        [
            memoryId,
            relatedMemoryId,
            cleanRelationship,
            Date.now(),
        ]
    )
}

const getLinks = async (
    memoryId: number
): Promise<MemoryLink[]> => {
    await initialize()

    const rows =
        await sqliteDB.getAllAsync(
            `
            SELECT
                memory_id,
                related_memory_id,
                relationship
            FROM nexus_memory_links
            WHERE memory_id = ?
               OR related_memory_id = ?
            `,
            [
                memoryId,
                memoryId,
            ]
        )

    return rows.map(
        (row: any) => ({
            memoryId:
                Number(row.memory_id),
            relatedMemoryId:
                Number(
                    row.related_memory_id
                ),
            relationship:
                String(
                    row.relationship
                ),
        })
    )
}

export const Memory = {
    initialize,
    add,
    get,
    update,
    remove,
    forget: remove,
    search,
    link,
    getLinks,
          }
