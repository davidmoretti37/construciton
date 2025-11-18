# Archived Legacy Files

This directory contains deprecated files from the legacy single-agent AI system.

## Archived Files

### `agentPrompt.js.bak` (360 lines)
- **Status**: DEPRECATED
- **Date Archived**: 2024-11-18
- **Reason**: Replaced by multi-agent orchestration system

Original monolithic AI prompt that handled all functionality in a single agent:
- Project creation workflow
- Financial tracking
- Estimates and invoices
- Workers management
- BuilderTrend-style task scheduling

### `agentPrompt_optimized.js.bak` (737 lines)
- **Status**: DEPRECATED
- **Date Archived**: 2024-11-18
- **Reason**: Replaced by multi-agent orchestration system

More recent version of the monolithic prompt with:
- Enhanced validation rules
- "INTELLIGENT TEXT ONLY" response strategy
- Stricter project creation state machine
- Phase-based project management

## Current System

The app now uses a **multi-agent orchestration architecture** located in:

```
src/services/agents/
├── core/
│   ├── CoreAgent.js          # Central orchestrator
│   ├── BaseWorkerAgent.js    # Base class for workers
│   ├── ExecutionEngine.js    # Plan executor
│   └── AgentContext.js       # Context builder
├── prompts/
│   ├── coreAgentPrompt.js
│   ├── projectCreationPrompt.js
│   ├── financialPrompt.js
│   ├── documentPrompt.js
│   └── estimateInvoicePrompt.js
├── ProjectAgent.js
├── FinancialAgent.js
├── DocumentAgent.js
└── EstimateInvoiceAgent.js
```

## Migration Notes

The legacy system was replaced because:
1. **Maintainability**: 737-line prompts are difficult to debug and update
2. **Modularity**: Specialized agents handle specific tasks better
3. **Scalability**: Easier to add new agents without affecting existing ones
4. **Context Management**: Better token usage with agent-specific contexts
5. **Testing**: Individual agents can be tested in isolation

## Backward Compatibility

The `aiService.js` still contains the `getSystemPrompt()` function for backward compatibility, but it now uses a minimal fallback prompt and logs a deprecation warning if called.

## Restoration

If you need to restore the legacy system:
1. Rename `.bak` files back to `.js`
2. Update the import in `aiService.js`
3. Modify `ChatScreen.js` to use `sendMessageToAIStreaming()` instead of `CoreAgent.processStreaming()`

**Not recommended** - the multi-agent system is more robust and maintainable.
