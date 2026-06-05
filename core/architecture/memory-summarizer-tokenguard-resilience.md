# Architecture Analysis: MemorySummarizer, TokenGuard & Resilience Layer
    
    > **Context:** This document proposes a MemorySummarizer, an advanced TokenGuard, and a Resilience Layer to upgrade the existing orchestration pipeline.
    > **Base Code:** `core/orchestrator/orchestrator.ts`, `core/agents/*.ts`, `core/memory/memory-engine.ts`, `conversation/context-engine.ts`
    
    ---
    
    ## 1. MemorySummarizer
    
    ### 1.1 The Problem
    
    The existing MemoryEngine in memory-engine.ts already extracts facts, decisions, preferences, and learnings via regex patterns. However:
    
    | Limitation | Impact |
    |---|---|
    | Regex-based extraction is brittle | Only catches explicit phrases like "lembre que...", misses implicit learning |
    | No semantic linking | Each fact is stored as an isolated string |
    | No code-awareness | Code patterns, API decisions, architectural choices are not extracted |
    | No structure | Facts are simple strings appended to MEMORY.md with no metadata |
    | No periodic background consolidation | The consolidate() method only runs on explicit transcript -- no scheduled cleanup |
    
    ### 1.2 Proposed Architecture
    
    ```
    +-------------------------------------------------------+
    |                  MemorySummarizer                      |
    +-------------------------------------------------------+
    | Extracts -> KeyValueFact[] with:                       |
    |   - content (string)                                   |
    |   - type: 'fact' | 'decision' | 'preference'           |
    |          | 'learning' | 'code_pattern'                  |
    |          | 'architecture' | 'constraint'                |
    |   - confidence: 0.0 - 1.0                              |
    |   - tags: string[] (ex: ["backend", "fastapi"])        |
    |   - sourceMessageIds: string[]                         |
    |   - timestamp: number                                  |
    |   - ttl: number | null (optional expiration)           |
    |   - relatedFacts: string[] (semantic links)            |
    +-------------------------------------------------------+
    | Methods:                                               |
    |   extractFromConversation(messages, context)           |
    |   consolidateOldFacts() -- merges duplicates            |
    |   pruneExpired() -- removes expired facts               |
    |   summarizeForPrompt(query) -- returns rich context     |
    +-------------------------------------------------------+
    ```
    
    ### 1.3 KeyValueFact Interface
    
    ```typescript
    interface KeyValueFact {
      id: string;                    // uuid hash
      content: string;               // The extracted knowledge
      type: FactType;                // Semantic category
      confidence: number;            // 0.0 - 1.0
      tags: string[];                // Searchable labels
      sourceMessageIds: string[];    // Traceability
      timestamp: number;             // When extracted
      ttl: number | null;            // Auto-expire (null = permanent)
      relatedFacts: string[];        // IDs of semantically related facts
      lastAccessed: number;          // For LRU pruning
      accessCount: number;           // Popularity metric
    }
    ```
    
    ### 1.4 Extraction Strategies (beyond regex)
    
    The MemorySummarizer uses three tiers of extraction:
    
    #### Tier 1: Pattern-Based (existing, refined)
    Improves on CONSOLIDATION_PATTERNS with broader patterns:
    
    ```typescript
    PATTERNS = [
      // Existing explicit patterns
      { regex: /(?:lembre|recorda|anota|guarda).../gi, type: 'fact' },
      { regex: /(?:prefiro|prefere|gosto mais de).../gi, type: 'preference' },
      { regex: /(?:decidi|decidiu|vamos\s+\w+\s+porque).../gi, type: 'decision' },
      { regex: /(?:aprendi|descobri|aprendeu|descobriu).../gi, type: 'learning' },
    
      // NEW: Code/architecture patterns
      { regex: /(?:usamos?|usando|utilizamos?|utilizando)\s+([^.!]+)/gi, type: 'architecture' },
      { regex: /(?:a arquitetura|estrutura|design)\s+(?:[eé])\s+([^.!]+)/gi, type: 'architecture' },
      { regex: /(?:configuramos?|configuracao|setup|config)\s+([^.!]+)/gi, type: 'constraint' },
    
      // NEW: Dependency/external service mentions
      { regex: /(?:integramos?|integracao|integracao|conectamos?)\s+(?:com\s+)?([^.!]+)/gi, type: 'architecture' },
    
      // NEW: "E importante que..." / "Precisamos que..." / "nao podemos"
      { regex: /(?:importante|precisamos?|nao\s+podemos|precisa\s+ser)\s+([^.!]+)/gi, type: 'constraint' },
    ]
    ```
    
    #### Tier 2: Contextual Extraction
    From tool calls and execution results:
    - **File modifications**: extract the what and why from code changes
    - **Error handling**: extract failure modes and recovery strategies
    - **User corrections**: "nao, quero diferente" -> preference refinement
    
    #### Tier 3: Periodic Background Consolidation
    Using create_background_task:
    
    ```typescript
    // Runs every ~30 min of inactivity
    backgroundTask('memory-summarizer', async () => {
      const summarizer = getMemorySummarizer();
      summarizer.consolidateOldFacts();      // Merge duplicates
      summarizer.pruneExpired();             // Remove expired facts
      summarizer.updateTagIndex();           // Rebuild search index
      summarizer.archiveToNotes();           // Write daily summary to notas diarias
    });
    ```
    
    ### 1.5 Integration with Existing MemoryEngine
    
    The MemorySummarizer complements the existing MemoryEngine, it does not replace it:
    
    | Existing MemoryEngine | New MemorySummarizer |
    |---|---|
    | consolidate(transcript) -> regex extraction | extractFromConversation(messages, context) -> multi-tier extraction |
    | recall(query) -> token-based ranking | summarizeForPrompt(query) -> weighted + popularity + recency scoring |
    | Appends to MEMORY.md | Writes structured facts.json + periodic summary to daily notes |
    | No TTL/pruning | TTL-based auto-expiry + LRU pruning |
    | Singletons (getMemoryEngine) | Singleton (getMemorySummarizer) |
    
    ### 1.6 File Structure
    
    ```
    core/
      memory/
        memory-engine.ts          <- existing (unchanged)
        memory-summarizer.ts      <- NEW
        facts-store.ts            <- NEW (JSON persistence layer)
        tag-index.ts              <- NEW (inverted index for fast tag search)
        types.ts                  <- NEW (KeyValueFact interface)
    ```
    
    ---
    
    ## 2. TokenGuard
    
    ### 2.1 The Problem
    
    The current manageWorkingMemory() in memory-engine.ts (lines 234-264) is basic:
    
    ```typescript
    // Current implementation:
    manageWorkingMemory(messages, maxTokens) {
      if (estimatedTokens <= maxTokens || messages.length <= 7) return messages;
    
      // Keep first 2 and last 5 messages
      const middle = messages.slice(keepFirst, -keepLast);
      const summary = this.summarizeMessages(middle);  // Simple truncation
    
      return [first 2, summary, last 5];
    }
    ```
    
    **Weaknesses:**
    - Uses simple character-count estimation (length / 4) -- not agent-aware
    - Fixed window (keep 2 + summarize middle + keep 5) -- no adaptive strategy
    - No per-agent budget tracking (each sub-agent gets the same window)
    - No emergency compression when exceeding limit severely
    - No message dropping (only summarization)
    - No proactive warning before hitting limits
    
    ### 2.2 Proposed Architecture
    
    ```
    +-------------------------------------------------------+
    |                    TokenGuard                          |
    +-------------------------------------------------------+
    | Budget Allocation:                                     |
    |   agentBudgets: Map<AgentType, TokenBudget>           |
    |   - softLimit: number  (warning at 80%)               |
    |   - hardLimit: number  (block at 100%)                |
    |   - currentUsage: number                              |
    |   - messages: number                                  |
    +-------------------------------------------------------+
    | Methods:                                               |
    |   estimate(text, role?, agent?) -> tokens             |
    |   canSend(agent, text) -> { allowed, reason }         |
    |   compress(messages, targetTokens, strategy)           |
    |   getUsageReport() -> TokenUsageReport                 |
    |   resetBudget(agent)                                  |
    +-------------------------------------------------------+
    ```
    
    ### 2.3 Token Estimation
    
    Replace simple length / 4 with role-aware estimation:
    
    ```typescript
    function estimate(text: string, role?: AgentRole): number {
      const base = text.length / 4;  // ~0.25 tokens/char for English
    
      const MULTIPLIERS: Record<AgentRole, number> = {
        'system':    1.0,   // Mostly English instructions
        'user':      1.3,   // Code snippets, longer tokens
        'assistant': 1.0,   // Mix of code + prose
        'tool':      1.5,   // JSON results, verbose output
        'code':      1.5,   // PythonAgent output -- denser
        'browser':   1.2,   // Web content
      };
    
      // Code-heavy content has higher token ratios
      const codeRatio = (text.match(/[{}().,;=<>]/g)?.length ?? 0) / text.length;
      const codeBonus = codeRatio > 0.1 ? 1.3 : 1.0;
    
      return Math.ceil(base * (MULTIPLIERS[role] ?? 1.0) * codeBonus);
    }
    ```
    
    ### 2.4 Per-Agent Budget Allocation
    
    ```typescript
    const AGENT_BUDGETS: Record<string, TokenBudget> = {
      orchestrator: { softLimit: 4000,  hardLimit: 6000  },
      PythonAgent:  { softLimit: 3000,  hardLimit: 4500  },
      browser:      { softLimit: 4000,  hardLimit: 5500  },
      writer:       { softLimit: 3000,  hardLimit: 4000  },
      assistant:    { softLimit: 2000,  hardLimit: 3000  },
    };
    
    // Total system limit: ~16,000 - 20,000 tokens
    ```
    
    ### 2.5 Compression Strategies
    
    | Strategy | When | What It Does |
    |---|---|---|
    | Summarize | Usage > softLimit | Uses LLM to create a 1-paragraph summary of oldest messages |
    | Drop | Usage > hardLimit * 0.9 | Drops tool messages (JSON outputs) from oldest to newest |
    | Truncate | Usage > hardLimit | Truncates the longest individual messages to 50% |
    | Emergency | Usage > hardLimit * 1.2 | Drops everything except system prompt and last user message |
    
    ```typescript
    function compress(
      messages: TranscriptMessage[],
      targetTokens: number,
      strategy: CompressionStrategy
    ): TranscriptMessage[] {
      switch (strategy) {
        case 'summarize': {
          // Find oldest user+assistant pair, replace with summary
          const { target, idx } = findCompressiblePair(messages);
          return [
            ...messages.slice(0, idx),
            { role: 'system', content: `[Summary] ${target.summary}` },
            ...messages.slice(idx + 2),
          ];
        }
        case 'drop': {
          // Drop tool messages with large JSON content
          return messages.filter(m => {
            if (m.role === 'tool' && m.content.length > 500) {
              return Math.random() > 0.3;  // Drop 30% of large tool outputs
            }
            return true;
          });
        }
        case 'truncate': {
          // Truncate longest messages
          return messages.map(m => {
            if (m.content.length > 2000) {
              return { ...m, content: m.content.slice(0, 1000) + '...[truncated]' };
            }
            return m;
          });
        }
        case 'emergency': {
          // Keep only system + last user message
          const system = messages.filter(m => m.role === 'system');
          const lastUser = messages.filter(m => m.role === 'user').slice(-1);
          return [...system, ...lastUser, {
            role: 'system',
            content: '[Emergency compression applied. Full context lost.]'
          }];
        }
      }
    }
    ```
    
    ### 2.6 Preemptive Blocking
    
    ```typescript
    function canSend(agent: string, text: string): { allowed: boolean; reason?: string } {
      const budget = getBudget(agent);
      const cost = estimate(text, getRole(agent));
    
      if (budget.currentUsage + cost > budget.hardLimit) {
        return {
          allowed: false,
          reason: `Token budget exceeded for ${agent}: ${budget.currentUsage} + ${cost} > ${budget.hardLimit}`
        };
      }
    
      if (budget.currentUsage + cost > budget.softLimit) {
        // Warn but allow
        console.warn(`WARNING ${agent} near token limit: ${budget.currentUsage + cost}/${budget.hardLimit}`);
      }
    
      return { allowed: true };
    }
    ```
    
    ---
    
    ## 3. Resilience Layer
    
    ### 3.1 The Problem
    
    The current system has no retry logic, no circuit breaker, no fallback. If:
    - A sub-agent (e.g., browser) fails -> the orchestrator gets an error and stops
    - An LLM call times out -> user waits indefinitely
    - Memory write fails -> try/catch silently swallows the error
    
    ### 3.2 Proposed Architecture
    
    ```
    +-------------------------------------------------------+
    |                Resilience Layer                        |
    +-------------------------------------------------------+
    | Components:                                           |
    |   RetryManager        |  CircuitBreaker               |
    |   FallbackManager     |  TimeoutManager               |
    |   HealthMonitor       |                               |
    +-------------------------------------------------------+
    | Decorators / Hooks:                                    |
    |   retryable(maxAttempts, backoff)                     |
    |   circuitBreaker(failureThreshold, resetTimeout)       |
    |   timeout(ms)                                         |
    |   fallback(strategy)                                  |
    +-------------------------------------------------------+
    ```
    
    ### 3.3 Retry with Exponential Backoff + Jitter
    
    ```typescript
    async function withRetry<T>(
      fn: () => Promise<T>,
      options: RetryOptions = { maxAttempts: 3, baseDelay: 1000, maxDelay: 10000 }
    ): Promise<T> {
      let lastError: Error;
    
      for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error as Error;
    
          if (attempt === options.maxAttempts) break;
    
          // Exponential backoff with jitter
          const delay = Math.min(
            options.baseDelay * Math.pow(2, attempt - 1),
            options.maxDelay
          );
          const jitter = delay * (0.5 + Math.random() * 0.5);  // 50-100% of delay
    
          console.warn(`WARNING Attempt ${attempt} failed. Retrying in ${Math.round(jitter)}ms...`);
          await sleep(jitter);
        }
      }
    
      throw lastError!;
    }
    ```
    
    ### 3.4 Circuit Breaker
    
    ```typescript
    class CircuitBreaker {
      private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
      private failureCount = 0;
      private lastFailureTime = 0;
    
      constructor(
        private readonly threshold: number = 5,      // Failures before open
        private readonly resetTimeout: number = 30000, // 30s before half-open
        private readonly halfOpenMaxRequests: number = 1
      ) {}
    
      async call<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
          if (Date.now() - this.lastFailureTime > this.resetTimeout) {
            this.state = 'HALF_OPEN';
          } else {
            throw new Error('Circuit breaker is OPEN');
          }
        }
    
        try {
          const result = await fn();
          if (this.state === 'HALF_OPEN') {
            this.state = 'CLOSED';
            this.failureCount = 0;
          }
          return result;
        } catch (error) {
          this.failureCount++;
          this.lastFailureTime = Date.now();
    
          if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
            console.error(`Circuit breaker OPEN for agent after ${this.failureCount} failures`);
          }
    
          throw error;
        }
      }
    }
    ```
    
    ### 3.5 Fallback Manager
    
    ```typescript
    type FallbackStrategy =
      | { type: 'memory'; query: string }            // Use memory recall instead
      | { type: 'template'; templateId: string }      // Use a template response
      | { type: 'delegate'; agent: string }           // Try a different agent
      | { type: 'graceful'; message: string };        // Return a user-friendly message
    
    async function withFallback<T>(
      fn: () => Promise<T>,
      fallbacks: FallbackStrategy[]
    ): Promise<T> {
      for (const fallback of fallbacks) {
        try {
          return await fn();
        } catch {
          // Try next fallback
        }
      }
    
      // Last resort
      return { error: true, message: 'All strategies failed' } as T;
    }
    ```
    
    ### 3.6 Integration with Orchestrator
    
    ```typescript
    // orchestrator.ts -- updated executeWithAgent
    async function executeWithAgent(instruction: string, agent: AgentType): Promise<AgentResult> {
      const breaker = getCircuitBreaker(agent);
      const timeout = getTimeout(agent);
    
      return withRetry(
        () => timeout(
          () => breaker.call(
            () => spawnAgent(instruction, agent)
          ),
          TIMEOUTS[agent]
        ),
        { maxAttempts: 3, baseDelay: 1000 }
      );
    }
    ```
    
    ---
    
    ## 4. Integration Summary
    
    ### 4.1 Complete Pipeline
    
    ```
    User Message
         |
         v
    +-------------+    +----------------+
    | TokenGuard  |--->| canSend()      |--- Allowed? ---> Continue
    | (pre-check) |    +----------------+       |
    +-------------+                              | No
         |                                        v
         v                                   Block / Warn
    +-------------+    +----------------+
    | Orchestrator |--->| Analyze +      |
    |              |    | Route to       |
    |              |    | Sub-Agent      |
    +-------------+    +----------------+
         |                        |
         v                        v
    +-------------+    +----------------+
    |Resilience   |    | Sub-Agent      |
    | Layer       |<---| (Python, Web,  |
    | (retry,     |    |  Shell, etc)   |
    |  breaker)   |    +----------------+
    +-------------+           |
         |                    v
         v           +----------------+
    +-------------+  | MemorySummarizer|
    | TokenGuard  |<-| extracts facts  |
    | (post-check)|  | from result     |
    +-------------+  +----------------+
         |                    |
         v                    v
    +-------------+    +----------------+
    | Response    |    | facts stored   |
    | to User     |    | in facts.json  |
    +-------------+    +----------------+
    ```
    
    ### 4.2 File Changes Summary
    
    | File | Change | Risk |
    |---|---|---|
    | core/orchestrator/orchestrator.ts | Add TokenGuard pre/post checks, wrap sub-agent calls with Resilience Layer | Medium |
    | core/memory/memory-engine.ts | Minor: improve estimateTokens, add compress() | Low |
    | core/memory/memory-summarizer.ts | NEW -- full module | -- |
    | core/memory/facts-store.ts | NEW -- JSON persistence | -- |
    | core/memory/tag-index.ts | NEW -- inverted index | -- |
    | core/memory/types.ts | NEW -- interfaces | -- |
    | conversation/context-engine.ts | Add summarizeToNotes() hook for background tasks | Low |
    
    ### 4.3 Migration Path
    
    | Step | What | Effort |
    |---|---|---|
    | 1 | Create types.ts with KeyValueFact interface | 30 min |
    | 2 | Create facts-store.ts (read/write facts.json) | 1h |
    | 3 | Create tag-index.ts (inverted index) | 1h |
    | 4 | Create memory-summarizer.ts (extraction + consolidation) | 3h |
    | 5 | Add TokenGuard estimation improvements to memory-engine.ts | 30 min |
    | 6 | Create Resilience Layer (retry.ts, circuit-breaker.ts, fallback.ts) | 2h |
    | 7 | Integrate TokenGuard into orchestrator (canSend checks) | 1h |
    | 8 | Wrap sub-agent calls with Resilience Layer | 1h |
    | 9 | Add background consolidation task | 30 min |
    | 10 | Test + Integration | 2h |
    | | **Total** | **~13h** |
    
    ---
    
    ## 5. Performance Considerations
    
    | Concern | Mitigation |
    |---|---|
    | Frequent JSON reads | facts-store.ts uses in-memory cache with 10s TTL (same pattern as MemoryEngine) |
    | Tag index rebuild | Done only during background consolidation (not on every access) |
    | Extraction overhead | Tier 1 (regex) is O(n) -- negligible. Tier 2/3 only on background tasks |
    | Token estimation | O(text.length) -- fast enough for per-message checks |
    | Circuit breaker state | Per-agent singletons, no persistence needed |
    
    ---
    
    ## 6. Testing Strategy
    
    | Module | Test |
    |---|---|
    | MemorySummarizer | Unit: extraction patterns, fact dedup, tag matching |
    | FactsStore | Integration: read/write/update facts.json |
    | TokenGuard | Unit: estimation accuracy, budget tracking, compression strategies |
    | CircuitBreaker | Unit: state machine transitions (CLOSED -> OPEN -> HALF_OPEN -> CLOSED) |
    | Retry | Unit: retry count, backoff timing, error propagation |
    | Orchestrator integration | E2E: full pipeline with all layers active |
    