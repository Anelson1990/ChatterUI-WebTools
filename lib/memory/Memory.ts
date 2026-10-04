import { sqliteDB } from '@db/db'

export type MemoryType =
    | 'fact'
    | 'preference'
    | 'person'
    | 'project'
    | 'decision'
    | 'event'
    | 'note'
    | 'other'

export interface Memory {
    id: number
    content: string
    type: MemoryType
    importance: number
    created_at: number
    updated_at: number
}

export interface MemoryLink {
    id: number
    memory_id: number
    related_memory_id: number
    relationship: string
    created_at: number
}

const now = () => Date.now()

/*
 * Messages that contain almost no useful semantic information should
 * never trigger a memory lookup.
 *
 * This keeps ordinary conversational turns such as:
 * "hi"
 * "hey"
 * "hello"
 * "thanks"
 * from entering the memory retrieval path.
 */
const MEMORY_STOP_WORDS = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'but',
    'by',
    'can',
    'do',
    'for',
    'from',
    'get',
    'go',
    'has',
    'have',
    'he',
    'hello',
    'hey',
    'hi',
    'i',
    'if',
    'in',
    'is',
    'it',
    'just',
    'me',
    'my',
    'no',
    'of',
    'on',
    'or',
    'please',
    'she',
    'so',
    'that',
    'the',
    'thanks',
    'thank',
    'this',
    'to',
    'we',
    'what',
    'when',
    'where',
    'who',
    'why',
    'with',
    'yes',
    'you',
    'your',
])

const normalizeSearchTerms = (
    query: string
): string[] => {
    return query
        .toLowerCase()
        .replace(
            /[^\p{L}\p{N}\s'-]/gu,
            ' '
        )
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(
            (term) =>
                term.length >= 3 &&
                !MEMORY_STOP_WORDS.has(term)
        )
        .filter(
            (term, index, array) =>
                array.indexOf(term) === index
        )
        .slice(0, 12)
}

/*
 * Returns whether a message contains enough meaningful information
 * to justify a memory lookup.
 */
export const shouldSearchMemory = (
    query: string
): boolean => {
    const trimmed = query.trim()

    if (!trimmed) {
        return false
    }

    const terms =
        normalizeSearchTerms(trimmed)

    return terms.length > 0
}

export const initializeMemory = () => {
    sqliteDB.execSync(`
        CREATE TABLE IF NOT EXISTS nexus_memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'other',
            importance REAL NOT NULL DEFAULT 0.5,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_nexus_memories_type
        ON nexus_memories(type);

        CREATE INDEX IF NOT EXISTS idx_nexus_memories_updated
        ON nexus_memories(updated_at);

        CREATE TABLE IF NOT EXISTS nexus_memory_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            memory_id INTEGER NOT NULL,
            related_memory_id INTEGER NOT NULL,
            relationship TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_nexus_memory_links_memory
        ON nexus_memory_links(memory_id);

        CREATE INDEX IF NOT EXISTS idx_nexus_memory_links_related
        ON nexus_memory_links(related_memory_id);
    `)
}

export const addMemory = (
    content: string,
    type: MemoryType = 'other',
    importance = 0.5
): number => {
    initializeMemory()

    const cleanedContent =
        content.trim()

    if (!cleanedContent) {
        return 0
    }

    const timestamp = now()

    const safeImportance =
        Math.max(
            0,
            Math.min(
                1,
                Number.isFinite(
                    importance
                )
                    ? importance
                    : 0.5
            )
        )

    const result =
        sqliteDB.runSync(
            `INSERT INTO nexus_memories
                (
                    content,
                    type,
                    importance,
                    created_at,
                    updated_at
                )
             VALUES (?, ?, ?, ?, ?)`,
            cleanedContent,
            type,
            safeImportance,
            timestamp,
            timestamp
        )

    return result.lastInsertRowId
}

export const getMemory = (
    id: number
): Memory | null => {
    initializeMemory()

    const result =
        sqliteDB.getFirstSync<Memory>(
            `SELECT
                id,
                content,
                type,
                importance,
                created_at,
                updated_at
             FROM nexus_memories
             WHERE id = ?`,
            id
        )

    return result ?? null
}

export const updateMemory = (
    id: number,
    updates: {
        content?: string
        type?: MemoryType
        importance?: number
    }
): boolean => {
    initializeMemory()

    const existing =
        getMemory(id)

    if (!existing) {
        return false
    }

    const content =
        updates.content !== undefined
            ? updates.content.trim()
            : existing.content

    if (!content) {
        return false
    }

    const type =
        updates.type ??
        existing.type

    const importance =
        updates.importance !== undefined
            ? Math.max(
                  0,
                  Math.min(
                      1,
                      Number.isFinite(
                          updates.importance
                      )
                          ? updates.importance
                          : existing.importance
                  )
              )
            : existing.importance

    const result =
        sqliteDB.runSync(
            `UPDATE nexus_memories
             SET
                content = ?,
                type = ?,
                importance = ?,
                updated_at = ?
             WHERE id = ?`,
            content,
            type,
            importance,
            now(),
            id
        )

    return result.changes > 0
}

export const removeMemory = (
    id: number
): boolean => {
    initializeMemory()

    sqliteDB.runSync(
        `DELETE FROM nexus_memory_links
         WHERE memory_id = ?
            OR related_memory_id = ?`,
        id,
        id
    )

    const result =
        sqliteDB.runSync(
            `DELETE FROM nexus_memories
             WHERE id = ?`,
            id
        )

    return result.changes > 0
}

/*
 * Searches local memory using meaningful words from the user's
 * current message.
 *
 * The query is deliberately conservative:
 * - generic conversation does not trigger memory retrieval
 * - only up to 12 meaningful terms are searched
 * - results are ranked by importance and recency
 * - SQL errors are allowed to propagate to the DataSource safety
 *   boundary, where they are converted into "no memory"
 */
export const searchMemories = (
    query: string,
    limit = 10
): Memory[] => {
    initializeMemory()

    if (
        !shouldSearchMemory(query)
    ) {
        return []
    }

    const terms =
        normalizeSearchTerms(query)

    if (terms.length === 0) {
        return []
    }

    const safeLimit =
        Math.max(
            1,
            Math.min(
                20,
                Math.floor(
                    Number.isFinite(
                        limit
                    )
                        ? limit
                        : 10
                )
            )
        )

    const conditions =
        terms
            .map(
                () =>
                    `(content LIKE ? OR type LIKE ?)`
            )
            .join(' OR ')

    const params: string[] = []

    for (const term of terms) {
        const pattern =
            `%${term}%`

        params.push(
            pattern,
            pattern
        )
    }

    return sqliteDB.getAllSync<Memory>(
        `SELECT
            id,
            content,
            type,
            importance,
            created_at,
            updated_at
         FROM nexus_memories
         WHERE ${conditions}
         ORDER BY
            importance DESC,
            updated_at DESC
         LIMIT ?`,
        ...params,
        safeLimit
    )
}

export const getRecentMemories = (
    limit = 10
): Memory[] => {
    initializeMemory()

    const safeLimit =
        Math.max(
            1,
            Math.min(
                20,
                Math.floor(
                    Number.isFinite(
                        limit
                    )
                        ? limit
                        : 10
                )
            )
        )

    return sqliteDB.getAllSync<Memory>(
        `SELECT
            id,
            content,
            type,
            importance,
            created_at,
            updated_at
         FROM nexus_memories
         ORDER BY updated_at DESC
         LIMIT ?`,
        safeLimit
    )
}

export const linkMemories = (
    memoryId: number,
    relatedMemoryId: number,
    relationship: string
): number => {
    initializeMemory()

    const cleanedRelationship =
        relationship.trim()

    if (
        !cleanedRelationship ||
        memoryId <= 0 ||
        relatedMemoryId <= 0 ||
        memoryId === relatedMemoryId
    ) {
        return 0
    }

    const existing =
        sqliteDB.getFirstSync<{
            id: number
        }>(
            `SELECT id
             FROM nexus_memory_links
             WHERE memory_id = ?
               AND related_memory_id = ?
               AND relationship = ?
             LIMIT 1`,
            memoryId,
            relatedMemoryId,
            cleanedRelationship
        )

    if (existing) {
        return existing.id
    }

    const result =
        sqliteDB.runSync(
            `INSERT INTO nexus_memory_links
                (
                    memory_id,
                    related_memory_id,
                    relationship,
                    created_at
                )
             VALUES (?, ?, ?, ?)`,
            memoryId,
            relatedMemoryId,
            cleanedRelationship,
            now()
        )

    return result.lastInsertRowId
}

export const unlinkMemories = (
    memoryId: number,
    relatedMemoryId: number,
    relationship?: string
): boolean => {
    initializeMemory()

    let result

    if (relationship) {
        result =
            sqliteDB.runSync(
                `DELETE FROM nexus_memory_links
                 WHERE memory_id = ?
                   AND related_memory_id = ?
                   AND relationship = ?`,
                memoryId,
                relatedMemoryId,
                relationship
            )
    } else {
        result =
            sqliteDB.runSync(
                `DELETE FROM nexus_memory_links
                 WHERE memory_id = ?
                   AND related_memory_id = ?`,
                memoryId,
                relatedMemoryId
            )
    }

    return result.changes > 0
}

export const getMemoryLinks = (
    memoryId: number
): MemoryLink[] => {
    initializeMemory()

    return sqliteDB.getAllSync<MemoryLink>(
        `SELECT
            id,
            memory_id,
            related_memory_id,
            relationship,
            created_at
         FROM nexus_memory_links
         WHERE memory_id = ?
            OR related_memory_id = ?
         ORDER BY created_at DESC`,
        memoryId,
        memoryId
    )
}

export const getAllMemories =
    (): Memory[] => {
        initializeMemory()

        return sqliteDB.getAllSync<Memory>(
            `SELECT
                id,
                content,
                type,
                importance,
                created_at,
                updated_at
             FROM nexus_memories
             ORDER BY updated_at DESC`
        )
    }
