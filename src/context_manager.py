
"""
ContextManager - Gerenciamento de historico de mensagens com token budget.

Fornece truncagem segura que preserva a integridade dos pares
assistant(tool_calls) <-> tool, evitando o erro 400 da API:
"Messages with role 'tool' must be a response to a preceding
 message with 'tool_calls'"

Autor: colabor-ai
Versao: 1.0.0
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

logger = logging.getLogger("ContextManager")


@dataclass
class Message:
    """Representa uma mensagem do chat."""
    role: str
    content: Optional[str] = None
    tool_calls: Optional[list[dict]] = None
    tool_call_id: Optional[str] = None
    name: Optional[str] = None

    def to_dict(self) -> dict:
        d: dict = {"role": self.role}
        if self.content is not None:
            d["content"] = self.content
        if self.tool_calls is not None:
            d["tool_calls"] = self.tool_calls
        if self.tool_call_id is not None:
            d["tool_call_id"] = self.tool_call_id
        if self.name is not None:
            d["name"] = self.name
        return d

    @staticmethod
    def from_dict(data: dict) -> "Message":
        return Message(
            role=data.get("role", ""),
            content=data.get("content"),
            tool_calls=data.get("tool_calls"),
            tool_call_id=data.get("tool_call_id"),
            name=data.get("name"),
        )


@dataclass
class ContextManagerConfig:
    """Configuracao do ContextManager."""
    max_tokens: int = 8000
    recent_ratio: float = 0.6
    min_messages: int = 4
    token_counter: Any = None


# =========================================================================
# Blocos Atomicos
# =========================================================================

def _build_atomic_blocks(
    messages: list[Message],
) -> list[tuple[int, int]]:
    """
    Agrupa mensagens em blocos atomicos (start_idx, end_idx_exclusive).

    Um bloco contem: assistant(tool_calls) + todas as tool messages
    que respondem a ele (identificadas por tool_call_id).

    Retorna lista de tuplas (start, end) onde end e exclusivo.
    """
    blocks: list[tuple[int, int]] = []
    i = 0
    n = len(messages)

    while i < n:
        msg = messages[i]
        if (
            msg.role == "assistant"
            and msg.tool_calls
            and isinstance(msg.tool_calls, list)
            and len(msg.tool_calls) > 0
        ):
            start = i
            tool_ids: set[str] = set()
            for tc in msg.tool_calls:
                if isinstance(tc, dict) and "id" in tc:
                    tool_ids.add(tc["id"])

            i += 1
            while i < n and tool_ids:
                next_msg = messages[i]
                if (
                    next_msg.role == "tool"
                    and next_msg.tool_call_id in tool_ids
                ):
                    tool_ids.discard(next_msg.tool_call_id)
                    i += 1
                else:
                    break
            blocks.append((start, i))
        else:
            blocks.append((i, i + 1))
            i += 1

    return blocks


# =========================================================================
# Safe Truncation Index
# =========================================================================


def _find_safe_trim_index(
    messages: list[Message],
    desired_start: int,
) -> int:
    """
    Encontra indice de truncagem que nao quebra pares
    assistant(tool_calls) <-> tool.

    Regra central: um bloco assistant+tool_calls+tool_responses
    e atomico -- ou fica inteiro, ou e removido inteiro.

    Se desired_start cai no meio de um bloco:
      - O bloco INTEIRO e removido (safe_start avanca para
        depois do bloco).

    Alem disso:
      - Tool messages cujo assistant foi removido: recua
        safe_start para incluir o assistant (cross-block).
      - Tool messages orfas (sem assistant): avanca safe_start
        para pula-las.
      - Apos ajustes, re-alinha safe_start com borda de bloco.
    """
    if desired_start <= 0:
        return 0

    n = len(messages)
    safe_start = desired_start

    # ---------------------------------------------------------------
    # PASSO 1: Blocos atomicos cortados por desired_start
    #          -> avanca safe_start para o fim do bloco
    # ---------------------------------------------------------------
    blocks = _build_atomic_blocks(messages)

    for block_start, block_end in blocks:
        if block_end <= desired_start:
            continue  # bloco inteiro removido -> OK
        if block_start >= desired_start:
            continue  # bloco inteiro mantido -> OK
        # Bloco cortado: parte removida, parte mantida
        # Remove o bloco inteiro
        if block_end > safe_start:
            safe_start = block_end
            logger.debug(
                "Bloco atomico [%d, %d) cortado por desired_start=%d. "
                "Avancando safe_start para %d.",
                block_start, block_end, desired_start, safe_start,
            )

    # ---------------------------------------------------------------
    # PASSO 2: Cross-block check -- tool messages mantidas cujo
    #          assistant esta na zona de remocao.
    #          -> recua safe_start para incluir o assistant
    #
    # Isto cobre o caso onde assistant e tool nao estao no mesmo
    # bloco (ex: mensagem "user" entre eles), evitando que a tool
    # fique orfa.
    # ---------------------------------------------------------------
    for i in range(safe_start, n):
        msg = messages[i]
        if msg.role != "tool" or not msg.tool_call_id:
            continue

        # Procura o assistant que contem este tool_call_id
        for j in range(i - 1, -1, -1):
            candidate = messages[j]
            if (
                candidate.role == "assistant"
                and candidate.tool_calls
                and isinstance(candidate.tool_calls, list)
            ):
                for tc in candidate.tool_calls:
                    if (
                        isinstance(tc, dict)
                        and tc.get("id") == msg.tool_call_id
                    ):
                        # Assistant encontrado em j
                        if j < safe_start:
                            # Assistant removido, tool mantida -> recua
                            safe_start = j
                            logger.debug(
                                "Tool mantida (idx=%d, id=%s) com assistant "
                                "removido (idx=%d). Recuando safe_start=%d.",
                                i, msg.tool_call_id, j, safe_start,
                            )
                        # Assistant ja esta na zona mantida -> OK
                        break
                break  # assistant encontrado, nao precisa procurar mais

    # ---------------------------------------------------------------
    # PASSO 3: Tool messages orfas (sem assistant em lugar nenhum)
    #          -> avanca safe_start para pula-las
    # ---------------------------------------------------------------
    for i in range(safe_start, n):
        msg = messages[i]
        if msg.role != "tool" or not msg.tool_call_id:
            continue

        found = False
        for j in range(i - 1, -1, -1):
            candidate = messages[j]
            if (
                candidate.role == "assistant"
                and candidate.tool_calls
                and isinstance(candidate.tool_calls, list)
            ):
                for tc in candidate.tool_calls:
                    if (
                        isinstance(tc, dict)
                        and tc.get("id") == msg.tool_call_id
                    ):
                        found = True
                        break
            if found:
                break

        if not found:
            logger.warning(
                "Tool message orfa detectada (tool_call_id=%s, idx=%d). "
                "Pulando para evitar erro 400.",
                msg.tool_call_id, i,
            )
            if i >= safe_start:
                safe_start = i + 1

    # ---------------------------------------------------------------
    # PASSO 4: Re-alinhar safe_start com borda de bloco apos
    #          PASSO 2 (recuo) e PASSO 3 (avanco).
    #          Se safe_start caiu no meio de um bloco atomico,
    #          recua para o inicio do bloco.
    # ---------------------------------------------------------------
    blocks = _build_atomic_blocks(messages)
    for block_start, block_end in blocks:
        if block_start < safe_start < block_end:
            # safe_start caiu no meio de um bloco
            # Recua para incluir o bloco inteiro
            safe_start = block_start
            logger.debug(
                "Re-alinhamento: safe_start caiu dentro do bloco "
                "[%d, %d). Recuando safe_start=%d.",
                block_start, block_end, safe_start,
            )

    return min(safe_start, n)
def _estimate_tokens(text: str) -> int:
    """Estimativa simples: ~4 caracteres por token."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def _count_message_tokens(msg: Message) -> int:
    """Estima tokens de uma mensagem."""
    tokens = 4
    if msg.content:
        tokens += _estimate_tokens(msg.content)
    if msg.tool_calls:
        for tc in msg.tool_calls:
            tokens += _estimate_tokens(str(tc))
    if msg.tool_call_id:
        tokens += _estimate_tokens(msg.tool_call_id)
    if msg.name:
        tokens += _estimate_tokens(msg.name)
    return tokens


# =========================================================================
# ContextManager
# =========================================================================

class ContextManager:
    """
    Gerencia historico de mensagens com token budget e truncagem segura.
    Garante que pares assistant(tool_calls) <-> tool nunca sejam quebrados.
    """

    def __init__(self, config: Optional[ContextManagerConfig] = None):
        self.config = config or ContextManagerConfig()
        self._system_prompt: Optional[Message] = None
        self._history: list[Message] = []

    def set_system_prompt(self, content: str) -> None:
        self._system_prompt = Message(role="system", content=content)

    def add_message(self, msg: Message | dict) -> None:
        if isinstance(msg, dict):
            msg = Message.from_dict(msg)
        self._history.append(msg)

    def add_messages(self, messages: list[Message | dict]) -> None:
        for msg in messages:
            self.add_message(msg)

    def get_history(self) -> list[Message]:
        return list(self._history)

    def clear(self) -> None:
        self._history.clear()

    def count_tokens(self, messages: Optional[list[Message]] = None) -> int:
        msgs = messages if messages is not None else self._history
        return sum(_count_message_tokens(m) for m in msgs)

    def build_context(self) -> list[dict]:
        """
        Monta contexto para API com truncagem segura.
        """
        history = list(self._history)

        if not history:
            result: list[dict] = []
            if self._system_prompt:
                result.append(self._system_prompt.to_dict())
            return result

        total_tokens = self.count_tokens(history)
        if total_tokens <= self.config.max_tokens:
            result = []
            if self._system_prompt:
                result.append(self._system_prompt.to_dict())
            result.extend(m.to_dict() for m in history)
            return result

        trimmed = self._trim_messages(history)
        result = []
        if self._system_prompt:
            result.append(self._system_prompt.to_dict())
        result.extend(m.to_dict() for m in trimmed)
        return result

    def _trim_messages(self, history: list[Message]) -> list[Message]:
        """
        Remove mensagens antigas preservando pares assistant<->tool.

        Estrategia:
        1. Agrupa em blocos atomicos (assistant + tools)
        2. Mantem blocos recentes (recent_ratio do budget)
        3. Remove blocos antigos intactos
        4. Aplica _find_safe_trim_index como garantia
        """
        max_tokens = self.config.max_tokens
        recent_ratio = self.config.recent_ratio
        min_messages = self.config.min_messages
        n = len(history)

        blocks = _build_atomic_blocks(history)
        block_tokens = [
            sum(_count_message_tokens(history[j]) for j in range(start, end))
            for start, end in blocks
        ]

        total = sum(block_tokens)
        if total <= max_tokens:
            return list(history)

        recent_budget = int(max_tokens * recent_ratio)
        kept_blocks = len(blocks)
        recent_tokens = 0
        recent_count = 0

        for i in range(len(blocks) - 1, -1, -1):
            bt = block_tokens[i]
            if recent_tokens + bt > recent_budget and recent_count >= min_messages:
                kept_blocks = len(blocks) - (i + 1)
                break
            recent_tokens += bt
            recent_count += blocks[i][1] - blocks[i][0]

        if kept_blocks >= len(blocks):
            return list(history)

        removed_count = len(blocks) - kept_blocks
        raw_start = blocks[removed_count][0] if removed_count < len(blocks) else n
        safe_start = _find_safe_trim_index(history, raw_start)
        kept = history[safe_start:]

        logger.debug(
            "_trim_messages: %d -> %d msgs (safe_start=%d, budget=%d)",
            n, len(kept), safe_start, max_tokens,
        )

        return kept


# =========================================================================
# Funcao de conveniencia
# =========================================================================

def trim_messages(
    messages: list[dict],
    max_tokens: int = 8000,
    recent_ratio: float = 0.6,
    min_messages: int = 4,
) -> list[dict]:
    """
    Trunca lista de mensagens (formato OpenAI) com seguranca.

    Args:
        messages: Lista de mensagens no formato API OpenAI.
        max_tokens: Token budget maximo.
        recent_ratio: Proporcao do budget para mensagens recentes.
        min_messages: Numero minimo de mensagens a manter.

    Returns:
        Lista truncada com pares tool_calls<->tool preservados.
    """
    mgr = ContextManager(ContextManagerConfig(
        max_tokens=max_tokens,
        recent_ratio=recent_ratio,
        min_messages=min_messages,
    ))
    for m in messages:
        mgr.add_message(m)
    return mgr.build_context()
