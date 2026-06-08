#!/usr/bin/env python3
"""Fix the agent.ts file - restore original content with retry improvements."""

import re

# Read the current (corrupted) file
with open("C:/Developer/action4.me/core/agent/agent.ts", "r", encoding="utf-8") as f:
    content = f.read()

# Fix 1: The JSDoc comments got corrupted - they have literal \n instead of newlines
# Fix 2: The retryWithBackoff method has literal \n
# Fix 3: The run method has literal \n and escaped quotes

# Replace the corrupted JSDoc for getRelevantSkills
old_jsdoc = """/**"
\n\n       * Carrega skills relevantes para um determinado contexto"
\n\n       */"""

new_jsdoc = """/**\n       * Carrega skills relevantes para um determinado contexto\n       */"""

content = content.replace(old_jsdoc, new_jsdoc)

# The retryWithBackoff method - replace entire corrupted section
# Find the start marker
old_retry_start = """      /**""
\n\n       * Retry wrapper com exponential backoff + jitter aprimorado."""

new_retry_start = """      /**\n       * Retry wrapper com exponential backoff + jitter aprimorado."""

content = content.replace(old_retry_start, new_retry_start)

# Save
with open("C:/Developer/action4.me/core/agent/agent.ts", "w", encoding="utf-8") as f:
    f.write(content)

print("File partially fixed - checking for remaining issues")
print(f"File size: {len(content)} bytes")

# Check for corrupted patterns
if '\\n' in content and '\\\\n' not in content:
    # Find where literal \n appears
    lines = content.split('\\n')
    # Only report if there are actual literal \n in code
    for i, line in enumerate(lines):
        if '\\n' in line:
            # Check if this is in a string context (inside quotes)
            if '"' in line or "'" in line or '`' in line:
                print(f"Line {i}: possible corrupted: {line[:100]}")
