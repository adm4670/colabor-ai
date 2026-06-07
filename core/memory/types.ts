// ============================================================
    // Tipos e interfaces para o sistema de memoria vetorial
    // ============================================================
    
    export type MemoryEntryType = 'conversation' | 'note' | 'fact' | 'decision'
    
    export interface MemoryMetadata {
      type: MemoryEntryType
      source: string
      timestamp: number
      tags: string[]
      sessionId?: string
    }
    
    export interface StoredEntry {
      id: string
      content: string
      metadata: MemoryMetadata
      embedding: number[]
      createdAt: number
    }
    
    export interface MemoryStoreFile {
      version: number
      entries: StoredEntry[]
    }
    
    export interface MemorySearchResult {
      id: string
      content: string
      metadata: MemoryMetadata
      similarity: number
      createdAt: number
    }
    
    export interface MemorySearchParams {
      query: string
      limit?: number
      threshold?: number
      typeFilter?: MemoryEntryType[]
    }
    
    export interface MemoryStoreParams {
      content: string
      type?: MemoryEntryType
      source?: string
      tags?: string[]
      sessionId?: string
    }
    