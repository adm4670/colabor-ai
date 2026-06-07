-- ============================================
    -- Migration 001: Initial Schema
    -- colabor-ai Cloud - Multi-tenant Vector Database
    -- ============================================
    
    -- Ativa extensao pgvector para busca semantica
    CREATE EXTENSION IF NOT EXISTS vector;
    
    -- ============================================
    -- Tabela: users
    -- ============================================
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        google_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        avatar_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    CREATE INDEX idx_users_google_id ON users(google_id);
    CREATE INDEX idx_users_email ON users(email);
    
    -- ============================================
    -- Tabela: sessions
    -- ============================================
    CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(512) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    CREATE INDEX idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX idx_sessions_token ON sessions(token);
    CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
    
    -- ============================================
    -- Tabela: conversations
    -- ============================================
    CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) DEFAULT 'Nova conversa',
        messages JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    CREATE INDEX idx_conversations_user_id ON conversations(user_id);
    CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
    
    -- ============================================
    -- Tabela: memories (vetorial - pgvector)
    -- ============================================
    CREATE TABLE IF NOT EXISTS memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'note',
        source VARCHAR(100) NOT NULL DEFAULT 'agent',
        content TEXT NOT NULL,
        tags TEXT[] DEFAULT '{}',
        embedding vector(384),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    CREATE INDEX idx_memories_user_id ON memories(user_id);
    CREATE INDEX idx_memories_type ON memories(type);
    CREATE INDEX idx_memories_created_at ON memories(created_at DESC);
    
    -- Indice IVFFlat para busca vetorial rapida
    CREATE INDEX IF NOT EXISTS idx_memories_embedding 
        ON memories 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
    
    -- ============================================
    -- Funcao para busca semantica por similaridade
    -- ============================================
    CREATE OR REPLACE FUNCTION search_memories(
        p_user_id UUID,
        p_embedding vector(384),
        p_threshold FLOAT DEFAULT 0.4,
        p_limit INT DEFAULT 5
    )
    RETURNS TABLE(
        id UUID,
        content TEXT,
        type VARCHAR,
        tags TEXT[],
        similarity FLOAT,
        created_at TIMESTAMP WITH TIME ZONE
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
        RETURN QUERY
        SELECT 
            m.id,
            m.content,
            m.type,
            m.tags,
            1 - (m.embedding <=> p_embedding) AS similarity,
            m.created_at
        FROM memories m
        WHERE m.user_id = p_user_id
          AND m.embedding IS NOT NULL
          AND 1 - (m.embedding <=> p_embedding) > p_threshold
        ORDER BY m.embedding <=> p_embedding
        LIMIT p_limit;
    END;
    $$;
    