"""
Testes para context_manager.py
Cobre: blocos atomicos, safe truncation, invariantes pos-trim,
       cenarios reais de estouro de tokens.
"""

import sys, os, pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from context_manager import (
    Message, ContextManager, ContextManagerConfig,
    _build_atomic_blocks, _find_safe_trim_index,
    _estimate_tokens, _count_message_tokens, trim_messages,
)


# ═══════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════

@pytest.fixture
def basic_msgs():
    return [
        Message(role="user", content="Hello"),
        Message(role="assistant", tool_calls=[
            {"id": "c1", "function": {"name": "search"}, "type": "function"}
        ]),
        Message(role="tool", tool_call_id="c1", content="Results"),
        Message(role="user", content="Thanks"),
    ]


@pytest.fixture
def multi_tool_msgs():
    return [
        Message(role="user", content="Q1"),
        Message(role="assistant", tool_calls=[
            {"id": "c1", "function": {}, "type": "function"},
            {"id": "c2", "function": {}, "type": "function"},
        ]),
        Message(role="tool", tool_call_id="c1", content="R1"),
        Message(role="tool", tool_call_id="c2", content="R2"),
        Message(role="user", content="Q2"),
    ]


@pytest.fixture
def interleaved_msgs():
    return [
        Message(role="user", content="Q"),
        Message(role="assistant", tool_calls=[
            {"id": "c1", "function": {}, "type": "function"}
        ]),
        Message(role="user", content="interruption"),
        Message(role="tool", tool_call_id="c1", content="Result"),
        Message(role="user", content="Q2"),
    ]


@pytest.fixture
def heavy_msgs():
    msgs = []
    for i in range(20):
        msgs.append(Message(role="user", content=f"Question {i} " * 30))
        msgs.append(Message(role="assistant", tool_calls=[
            {"id": f"c{i}a", "function": {}, "type": "function"},
            {"id": f"c{i}b", "function": {}, "type": "function"},
        ]))
        msgs.append(Message(role="tool", tool_call_id=f"c{i}a",
                            content=f"Result {i}a " * 30))
        msgs.append(Message(role="tool", tool_call_id=f"c{i}b",
                            content=f"Result {i}b " * 30))
    return msgs


# ═══════════════════════════════════════════════════════
# UNIT: _build_atomic_blocks
# ═══════════════════════════════════════════════════════

class TestBuildAtomicBlocks:
    def test_single_user(self):
        msgs = [Message(role="user", content="Hi")]
        assert _build_atomic_blocks(msgs) == [(0, 1)]

    def test_no_toolcalls(self):
        msgs = [
            Message(role="user", content="Q"),
            Message(role="assistant", content="A"),
            Message(role="user", content="Q2"),
        ]
        assert _build_atomic_blocks(msgs) == [(0, 1), (1, 2), (2, 3)]

    def test_assistant_with_tool_responses(self, basic_msgs):
        blocks = _build_atomic_blocks(basic_msgs)
        assert blocks == [(0, 1), (1, 3), (3, 4)]

    def test_multi_tool_block(self, multi_tool_msgs):
        blocks = _build_atomic_blocks(multi_tool_msgs)
        assert blocks == [(0, 1), (1, 4), (4, 5)]

    def test_interleaved(self, interleaved_msgs):
        blocks = _build_atomic_blocks(interleaved_msgs)
        assert blocks == [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)]

    def test_system_message(self):
        msgs = [
            Message(role="system", content="You are helpful"),
            Message(role="user", content="Hi"),
        ]
        assert _build_atomic_blocks(msgs) == [(0, 1), (1, 2)]

    def test_empty(self):
        assert _build_atomic_blocks([]) == []


# ═══════════════════════════════════════════════════════
# UNIT: _find_safe_trim_index
# ═══════════════════════════════════════════════════════

class TestFindSafeTrimIndex:
    def test_desired_start_zero(self):
        r = _find_safe_trim_index([Message(role="user", content="Hi")], 0)
        assert r == 0

    def test_no_tools_simple_trim(self):
        msgs = [Message(role="user", content=str(i)) for i in range(5)]
        r = _find_safe_trim_index(msgs, 3)
        assert r == 3

    def test_cut_assistant_block(self, basic_msgs):
        r = _find_safe_trim_index(basic_msgs, 2)
        assert r == 3

    def test_cut_multi_tool_block(self, multi_tool_msgs):
        r = _find_safe_trim_index(multi_tool_msgs, 3)
        assert r == 4

    def test_cut_second_tool_block(self):
        msgs = [
            Message(role="user", content="Q1"),
            Message(role="assistant", tool_calls=[
                {"id": "c1", "function": {}, "type": "function"}
            ]),
            Message(role="tool", tool_call_id="c1"),
            Message(role="user", content="Q2"),
            Message(role="assistant", tool_calls=[
                {"id": "c2", "function": {}, "type": "function"}
            ]),
            Message(role="tool", tool_call_id="c2"),
            Message(role="user", content="Q3"),
        ]
        r = _find_safe_trim_index(msgs, 6)
        assert r == 6

    def test_interleaved_tool_kept(self, interleaved_msgs):
        r = _find_safe_trim_index(interleaved_msgs, 3)
        assert r == 1

    def test_interleaved_both_removed(self, interleaved_msgs):
        r = _find_safe_trim_index(interleaved_msgs, 4)
        assert r == 4

    def test_orphan_tool(self):
        msgs = [
            Message(role="user", content="Q"),
            Message(role="tool", tool_call_id="orphan"),
            Message(role="user", content="Q2"),
        ]
        r = _find_safe_trim_index(msgs, 1)
        assert r == 2

    def test_orphan_tool_at_boundary(self):
        msgs = [
            Message(role="user", content="Q"),
            Message(role="tool", tool_call_id="orphan"),
            Message(role="user", content="Q2"),
        ]
        r = _find_safe_trim_index(msgs, 2)
        assert r == 2

    def test_aligned_boundary(self, basic_msgs):
        r = _find_safe_trim_index(basic_msgs, 3)
        assert r == 3

    def test_beyond_array(self):
        msgs = [Message(role="user", content="Q")]
        r = _find_safe_trim_index(msgs, 10)
        assert r == 1

    def test_empty_array(self):
        r = _find_safe_trim_index([], 0)
        assert r == 0


# ═══════════════════════════════════════════════════════
# UNIT: Token estimation
# ═══════════════════════════════════════════════════════

class TestTokenEstimation:
    def test_empty_string(self):
        assert _estimate_tokens("") == 0

    def test_short_text(self):
        tokens = _estimate_tokens("Hello world")
        assert 1 <= tokens <= 5

    def test_long_text(self):
        text = "Hello " * 500
        tokens = _estimate_tokens(text)
        expected = len(text) // 4
        assert abs(tokens - expected) < 50

    def test_message_with_tool_calls(self):
        msg = Message(role="assistant", content="Calling", tool_calls=[
            {"id": "c1", "function": {"name": "search"}, "type": "function"}
        ])
        tokens = _count_message_tokens(msg)
        assert tokens > 0
        msg_no_tc = Message(role="assistant", content="Calling")
        assert _count_message_tokens(msg) > _count_message_tokens(msg_no_tc)


# ═══════════════════════════════════════════════════════
# INTEGRATION: ContextManager
# ═══════════════════════════════════════════════════════

class TestContextManager:
    def test_basic_build(self):
        mgr = ContextManager()
        mgr.add_message(Message(role="user", content="Hi"))
        ctx = mgr.build_context()
        assert len(ctx) == 1
        assert ctx[0]["role"] == "user"

    def test_system_prompt_first(self):
        mgr = ContextManager()
        mgr.set_system_prompt("You are helpful")
        mgr.add_message(Message(role="user", content="Hi"))
        ctx = mgr.build_context()
        assert ctx[0]["role"] == "system"
        assert ctx[0]["content"] == "You are helpful"

    def test_system_prompt_always_first_after_trim(self):
        mgr = ContextManager(ContextManagerConfig(max_tokens=100))
        mgr.set_system_prompt("You are helpful")
        for i in range(10):
            mgr.add_message(Message(role="user", content=f"Q{i} " * 20))
        ctx = mgr.build_context()
        assert ctx[0]["role"] == "system"

    def test_no_orphan_tools_after_trim(self, heavy_msgs):
        mgr = ContextManager(ContextManagerConfig(
            max_tokens=500, recent_ratio=0.3, min_messages=2
        ))
        for m in heavy_msgs:
            mgr.add_message(m)
        ctx = mgr.build_context()
        for i, m in enumerate(ctx):
            if m["role"] == "tool":
                tid = m["tool_call_id"]
                found = any(
                    prev["role"] == "assistant"
                    and prev.get("tool_calls")
                    and any(
                        isinstance(tc, dict) and tc.get("id") == tid
                        for tc in prev["tool_calls"]
                    )
                    for prev in ctx[:i]
                )
                assert found, f"Orphan tool at idx {i}: tool_call_id={tid}"

    def test_min_messages_respected(self):
        mgr = ContextManager(ContextManagerConfig(
            max_tokens=50, min_messages=3
        ))
        for i in range(10):
            mgr.add_message(Message(role="user", content=f"Q{i} " * 100))
        ctx = mgr.build_context()
        assert len(ctx) >= 3

    def test_clear(self):
        mgr = ContextManager()
        mgr.add_message(Message(role="user", content="Hi"))
        mgr.clear()
        assert len(mgr.get_history()) == 0

    def test_system_prompt_persists_after_clear(self):
        mgr = ContextManager()
        mgr.set_system_prompt("Be helpful")
        mgr.add_message(Message(role="user", content="Hi"))
        mgr.clear()
        ctx = mgr.build_context()
        assert ctx[0]["role"] == "system"

    def test_count_tokens(self):
        mgr = ContextManager()
        mgr.add_message(Message(role="user", content="Hello world"))
        n = mgr.count_tokens()
        assert n > 0

    def test_add_dict_message(self):
        mgr = ContextManager()
        mgr.add_message({"role": "user", "content": "Hi"})
        ctx = mgr.build_context()
        assert ctx[0]["role"] == "user"


# ═══════════════════════════════════════════════════════
# INTEGRATION: trim_messages (convenience)
# ═══════════════════════════════════════════════════════

class TestTrimMessages:
    def test_basic(self):
        result = trim_messages(
            [{"role": "user", "content": "Hi"}],
            max_tokens=1000,
        )
        assert len(result) == 1

    def test_no_orphan_tools(self):
        msgs = []
        for i in range(5):
            msgs.append({"role": "user", "content": f"Q{i} " * 50})
            msgs.append({
                "role": "assistant",
                "content": "Calling",
                "tool_calls": [{"id": f"c{i}", "function": {}, "type": "function"}],
            })
            msgs.append({
                "role": "tool",
                "content": f"R{i} " * 50,
                "tool_call_id": f"c{i}",
            })
        result = trim_messages(msgs, max_tokens=300, recent_ratio=0.5)
        for i, m in enumerate(result):
            if m["role"] == "tool":
                tid = m["tool_call_id"]
                found = any(
                    prev["role"] == "assistant"
                    and prev.get("tool_calls")
                    and any(tc.get("id") == tid for tc in prev["tool_calls"])
                    for prev in result[:i]
                )
                assert found, f"Orphan tool: {tid}"


# ═══════════════════════════════════════════════════════
# SCENARIO: Token overflow simulations
# ═══════════════════════════════════════════════════════

class TestTokenOverflowScenarios:
    """Simula cenarios reais de estouro de tokens"""

    def test_heavy_conversation_single_tool(self):
        mgr = ContextManager(ContextManagerConfig(
            max_tokens=600, recent_ratio=0.3, min_messages=2
        ))
        for i in range(20):
            mgr.add_message(Message(role="user", content=f"Question {i} " * 40))
            mgr.add_message(Message(role="assistant", tool_calls=[
                {"id": f"c{i}", "function": {"name": "f"}, "type": "function"}
            ]))
            mgr.add_message(Message(role="tool", tool_call_id=f"c{i}",
                                    content=f"Result {i} " * 40))
        ctx = mgr.build_context()
        tokens = mgr.count_tokens([Message.from_dict(m) for m in ctx])
        print(f"\n  Single-tool: {len(ctx)} msgs, ~{tokens}tok (budget=600)")

        for i, m in enumerate(ctx):
            if m["role"] == "tool":
                tid = m["tool_call_id"]
                found = any(
                    prev["role"] == "assistant"
                    and prev.get("tool_calls")
                    and any(tc.get("id") == tid for tc in prev["tool_calls"])
                    for prev in ctx[:i]
                )
                assert found, f"Orphan: {tid}"

    def test_heavy_conversation_multi_tool(self, heavy_msgs):
        mgr = ContextManager(ContextManagerConfig(
            max_tokens=400, recent_ratio=0.2, min_messages=4
        ))
        for m in heavy_msgs:
            mgr.add_message(m)
        ctx = mgr.build_context()
        tokens = mgr.count_tokens([Message.from_dict(m) for m in ctx])
        print(f"\n  Multi-tool: {len(ctx)} msgs, ~{tokens}tok (budget=400)")

        for i, m in enumerate(ctx):
            if m["role"] == "tool":
                tid = m["tool_call_id"]
                found = any(
                    prev["role"] == "assistant"
                    and prev.get("tool_calls")
                    and any(
                        isinstance(tc, dict) and tc.get("id") == tid
                        for tc in prev["tool_calls"]
                    )
                    for prev in ctx[:i]
                )
                assert found, f"ORPHAN at idx={i}, id={tid}"

    def test_very_aggressive_trim(self):
        mgr = ContextManager(ContextManagerConfig(
            max_tokens=80, recent_ratio=0.5, min_messages=1
        ))
        for i in range(5):
            mgr.add_message(Message(role="user", content=f"Q{i} " * 30))
            mgr.add_message(Message(role="assistant", tool_calls=[
                {"id": f"c{i}", "function": {}, "type": "function"}
            ]))
            mgr.add_message(Message(role="tool", tool_call_id=f"c{i}",
                                    content=f"R{i} " * 30))
        ctx = mgr.build_context()
        print(f"\n  Aggressive: {len(ctx)} msgs (budget=80)")

        for i, m in enumerate(ctx):
            if m["role"] == "tool":
                tid = m["tool_call_id"]
                found = any(
                    prev["role"] == "assistant"
                    and prev.get("tool_calls")
                    and any(tc.get("id") == tid for tc in prev["tool_calls"])
                    for prev in ctx[:i]
                )
                assert found, f"Orphan: {tid} at idx {i}"

    def test_interleaved_trim(self, interleaved_msgs):
        mgr = ContextManager(ContextManagerConfig(
            max_tokens=80, recent_ratio=0.5, min_messages=1
        ))
        for m in interleaved_msgs:
            mgr.add_message(m)
        ctx = mgr.build_context()
        print(f"\n  Interleaved: {len(ctx)} msgs (budget=80)")

        tool_ids_in_ctx = {m["tool_call_id"] for m in ctx if m["role"] == "tool"}
        for tid in tool_ids_in_ctx:
            found = any(
                m["role"] == "assistant"
                and m.get("tool_calls")
                and any(tc.get("id") == tid for tc in m["tool_calls"])
                for m in ctx
            )
            assert found, f"Orphan interleaved: {tid}"


# ═══════════════════════════════════════════════════════
# PROPERTY: OpenAI validity
# ═══════════════════════════════════════════════════════

class TestOpenAIValidity:
    def test_first_message_not_tool(self, heavy_msgs):
        mgr = ContextManager(ContextManagerConfig(max_tokens=500))
        for m in heavy_msgs:
            mgr.add_message(m)
        ctx = mgr.build_context()
        first_non_system = next((m for m in ctx if m["role"] != "system"), None)
        if first_non_system:
            assert first_non_system["role"] != "tool",                     "First non-system message is tool!"

    def test_tool_messages_have_tool_call_id(self, heavy_msgs):
        mgr = ContextManager(ContextManagerConfig(max_tokens=600))
        for m in heavy_msgs:
            mgr.add_message(m)
        ctx = mgr.build_context()
        for m in ctx:
            if m["role"] == "tool":
                assert "tool_call_id" in m, f"Tool without tool_call_id: {m}"
                assert m["tool_call_id"], f"Empty tool_call_id"


# ═══════════════════════════════════════════════════════
# EDGE CASES
# ═══════════════════════════════════════════════════════

class TestEdgeCases:
    def test_all_tool_messages(self):
        msgs = [
            Message(role="tool", tool_call_id="c1"),
            Message(role="tool", tool_call_id="c2"),
        ]
        r = _find_safe_trim_index(msgs, 1)
        assert r == 2

    def test_tool_call_with_missing_tool_response(self):
        mgr = ContextManager(ContextManagerConfig(max_tokens=50))
        mgr.add_message(Message(role="user", content="Hi"))
        mgr.add_message(Message(role="assistant", tool_calls=[
            {"id": "pending", "function": {}, "type": "function"}
        ]))
        ctx = mgr.build_context()
        assert len(ctx) >= 1

    def test_config_defaults(self):
        cfg = ContextManagerConfig()
        assert cfg.max_tokens > 0
        assert 0 < cfg.recent_ratio <= 1
        assert cfg.min_messages >= 0

    def test_message_from_dict_roundtrip(self):
        d = {"role": "user", "content": "Hello"}
        msg = Message.from_dict(d)
        assert msg.role == "user"
        assert msg.content == "Hello"
        back = msg.to_dict()
        assert back == d

    def test_message_from_dict_with_tool_calls(self):
        d = {
            "role": "assistant",
            "content": "Calling",
            "tool_calls": [{"id": "c1", "function": {"name": "f"}, "type": "function"}],
        }
        msg = Message.from_dict(d)
        assert len(msg.tool_calls) == 1
        assert msg.tool_calls[0]["id"] == "c1"


# ═══════════════════════════════════════════════════════
# STRESS: Random trimming invariant
# ═══════════════════════════════════════════════════════

class TestStressInvariant:
    @pytest.mark.parametrize("budget", [50, 80, 120, 200, 350, 500, 1000])
    def test_no_orphan_regardless_of_budget(self, budget, heavy_msgs):
        mgr = ContextManager(ContextManagerConfig(
            max_tokens=budget, recent_ratio=0.4, min_messages=2
        ))
        for m in heavy_msgs:
            mgr.add_message(m)
        ctx = mgr.build_context()

        for i, m in enumerate(ctx):
            if m["role"] == "tool":
                tid = m["tool_call_id"]
                found = any(
                    prev["role"] == "assistant"
                    and prev.get("tool_calls")
                    and any(
                        isinstance(tc, dict) and tc.get("id") == tid
                        for tc in prev["tool_calls"]
                    )
                    for prev in ctx[:i]
                )
                assert found, (
                    f"ORPHAN at budget={budget}, idx={i}, id={tid}"
                )
