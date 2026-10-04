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

export type Memory = {
    id: number
    content: string
    type: MemoryType
    importance: number
    createdAt: number
    updatedAt: number
}

export type MemoryLink = {
    memoryId: number
    relatedMemoryId: number
    relationship: string
}

type MemoryRow = {
    id: number
    content: string
    type: string
    importance: number
    created_at: number
    updated_at: number
}

type MemoryLinkRow = {
    memory_id: number
    related_memory_id: number
    relationship: string
}

let initialized = false

/**
 * Initializes the NEXUS memory tables.
 *
 * This intentionally uses the existing application SQLite database.
 * Memory is independent from chats, characters, and the selected model.
 */
export function initializeMemory(): void {
    if (initialized) return

    sqliteDB.execSync(`
        CREATE TABLE IF NOT EXISTS nexus_memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'other',
            importance INTEGER NOT NULL DEFAULT 50,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_nexus_memories_type
        ON nexus_memories(type);

        CREATE INDEX IF NOT EXISTS idx_nexus_memories_updated
        ON nexus_memories(updated_at);

        CREATE TABLE IF NOT EXISTS nexus_memory_links (
            memory_id INTEGER NOT NULL,
            related_memory_id INTEGER NOT NULL,
            relationship TEXT NOT NULL,
            PRIMARY KEY (memory_id, related_memory_id, relationship),
            FOREIGN KEY (memory_id)
                REFERENCES nexus_memories(id)
                ON DELETE CASCADE,
            FOREIGN KEY (related_memory_id)
                REFERENCES nexus_memories(id)
                ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_nexus_memory_links_memory
        ON nexus_memory_links(memory_id);

        CREATE INDEX IF NOT EXISTS idx_nexus_memory_links_related
        ON nexus_memory_links(related_memory_id);
    `)

    initialized = true
}

function rowToMemory(row: MemoryRow): Memory {
    return {
        id: row.id,
        content: row.content,
        type: row.type as MemoryType,
        importance: row.importance,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

/**
 * Add a memory to NEXUS.
 */
export function addMemory(
    content: string,
    type: MemoryType = 'other',
    importance = 50,
): number {
    initializeMemory()

    const now = Date.now()
    const safeImportance = Math.max(0, Math.min(100, Math.round(importance)))

    const result = sqliteDB.runSync(
        `
        INSERT INTO nexus_memories
            (content, type, importance, created_at, updated_at)
        VALUES
            (?, ?, ?, ?, ?)
        `,
        content.trim(),
        type,
        safeImportance,
        now,
        now,
    )

    return result.lastInsertRowId
}

/**
 * Retrieve a single memory.
 */
export function getMemory(id: number): Memory | null {
    initializeMemory()

    const row = sqliteDB.getFirstSync<MemoryRow>(
        `
        SELECT
            id,
            content,
            type,
            importance,
            created_at,
            updated_at
        FROM nexus_memories
        WHERE id = ?
        LIMIT 1
        `,
        id,
    )

    return row ? rowToMemory(row) : null
}

/**
 * Update an existing memory.
 */
export function updateMemory(
    id: number,
    updates: {
        content?: string
        type?: MemoryType
        importance?: number
    },
): boolean {
    initializeMemory()

    const existing = getMemory(id)
    if (!existing) return false

    const content = updates.content?.trim() ?? existing.content
    const type = updates.type ?? existing.type
    const importance =
        updates.importance === undefined
            ? existing.importance
            : Math.max(0, Math.min(100, Math.round(updates.importance)))

    sqliteDB.runSync(
        `
        UPDATE nexus_memories
        SET
            content = ?,
            type = ?,
            importance = ?,
            updated_at = ?
        WHERE id = ?
        `,
        content,
        type,
        importance,
        Date.now(),
        id,
    )

    return true
}

/**
 * Remove a memory.
 */
export function removeMemory(id: number): boolean {
    initializeMemory()

    const result = sqliteDB.runSync(
        `
        DELETE FROM nexus_memories
        WHERE id = ?
        `,
        id,
    )

    return result.changes > 0
}

/**
 * Search memories using local SQLite text matching.
 *
 * This is deliberately simple for Phase 1.
 * Semantic/vector retrieval can be added later without changing
 * the public memory API.
 */
export function searchMemories(
    query: string,
    limit = 10,
): Memory[] {
    initializeMemory()

    const normalizedQuery = query.trim()
    if (!normalizedQuery) return []

    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)))
    const pattern = `%${normalizedQuery}%`

    const rows = sqliteDB.getAllSync<MemoryRow>(
        `
        SELECT
            id,
            content,
            type,
            importance,
            created_at,
            updated_at
        FROM nexus_memories
        WHERE
            content LIKE ?
            OR type LIKE ?
        ORDER BY
            importance DESC,
            updated_at DESC
        LIMIT ?
        `,
        pattern,
        pattern,
        safeLimit,
    )

    return rows.map(rowToMemory)
}

/**
 * Return the most important/recent memories.
 *
 * Useful as a simple initial context source before semantic
 * retrieval is introduced.
 */
export function getRecentMemories(limit = 10): Memory[] {
    initializeMemory()

    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)))

    const rows = sqliteDB.getAllSync<MemoryRow>(
        `
        SELECT
            id,
            content,
            type,
            importance,
            created_at,
            updated_at
        FROM nexus_memories
        ORDER BY
            importance DESC,
            updated_at DESC
        LIMIT ?
        `,
        safeLimit,
    )

    return rows.map(rowToMemory)
}

/**
 * Link two memories together.
 *
 * Example:
 *   project memory -> "related_to" -> person memory
 */
export function linkMemories(
    memoryId: number,
    relatedMemoryId: number,
    relationship: string,
): void {
    initializeMemory()

    if (memoryId === relatedMemoryId) return

    const relationshipValue = relationship.trim()
    if (!relationshipValue) return

    sqliteDB.runSync(
        `
        INSERT OR IGNORE INTO nexus_memory_links
            (memory_id, related_memory_id, relationship)
        VALUES
            (?, ?, ?)
        `,
        memoryId,
        relatedMemoryId,
        relationshipValue,
    )
}

/**
 * Remove a relationship between two memories.
 */
export function unlinkMemories(
    memoryId: number,
    relatedMemoryId: number,
    relationship?: string,
): void {
    initializeMemory()

    if (relationship?.trim()) {
        sqliteDB.runSync(
            `
            DELETE FROM nexus_memory_links
            WHERE
                memory_id = ?
                AND related_memory_id = ?
                AND relationship = ?
            `,
            memoryId,
            relatedMemoryId,
            relationship.trim(),
        )

        return
    }

    sqliteDB.runSync(
        `
        DELETE FROM nexus_memory_links
        WHERE
            memory_id = ?
            AND related_memory_id = ?
        `,
        memoryId,
        relatedMemoryId,
    )
}

/**
 * Get relationships connected to a memory.
 */
export function getMemoryLinks(id: number): MemoryLink[] {
    initializeMemory()

    const rows = sqliteDB.getAllSync<MemoryLinkRow>(
        `
        SELECT
            memory_id,
            related_memory_id,
            relationship
        FROM nexus_memory_links
        WHERE
            memory_id = ?
            OR related_memory_id = ?
        ORDER BY relationship
        `,
        id,
        id,
    )

    return rows.map((row) => ({
        memoryId: row.memory_id,
        relatedMemoryId: row.related_memory_id,
        relationship: row.relationship,
    }))
}

/**
 * Get all stored memories.
 *
 * Primarily useful for diagnostics and future memory-management UI.
 */
export function getAllMemories(): Memory[] {
    initializeMemory()

    const rows = sqliteDB.getAllSync<MemoryRow>(
        `
        SELECT
            id,
            content,
            type,
            importance,
            created_at,
            updated_at
        FROM nexus_memories
        ORDER BY updated_at DESC
        `,
    )

    return rows.map(rowToMemory)
}
