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

    const timestamp = now()

    const result = sqliteDB.runSync(
        `INSERT INTO nexus_memories
            (content, type, importance, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        content.trim(),
        type,
        importance,
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

    const existing = getMemory(id)

    if (!existing) {
        return false
    }

    const content =
        updates.content?.trim() ??
        existing.content

    const type =
        updates.type ??
        existing.type

    const importance =
        updates.importance ??
        existing.importance

    const result = sqliteDB.runSync(
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

    const result = sqliteDB.runSync(
        `DELETE FROM nexus_memories
         WHERE id = ?`,
        id
    )

    return result.changes > 0
}

export const searchMemories = (
    query: string,
    limit = 10
): Memory[] => {
    initializeMemory()

    const trimmed =
        query.trim()

    if (!trimmed) {
        return []
    }

    const terms =
        trimmed
            .split(/\s+/)
            .map((term) =>
                term
                    .replace(
                        /[%_]/g,
                        ''
                    )
                    .trim()
            )
            .filter(Boolean)

    if (terms.length === 0) {
        return []
    }

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
        Math.max(
            1,
            Math.floor(limit)
        )
    )
}

export const getRecentMemories = (
    limit = 10
): Memory[] => {
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
         ORDER BY updated_at DESC
         LIMIT ?`,
        Math.max(
            1,
            Math.floor(limit)
        )
    )
}

export const linkMemories = (
    memoryId: number,
    relatedMemoryId: number,
    relationship: string
): number => {
    initializeMemory()

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
            relationship
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
            relationship,
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
        result = sqliteDB.runSync(
            `DELETE FROM nexus_memory_links
             WHERE memory_id = ?
               AND related_memory_id = ?
               AND relationship = ?`,
            memoryId,
            relatedMemoryId,
            relationship
        )
    } else {
        result = sqliteDB.runSync(
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

export const getAllMemories = (): Memory[] => {
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
