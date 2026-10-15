# Prompts: 20261009-provider-module

Spec revision 6. Paste one prompt per new session.

## Plan 1: Unverified provider lock

### Implement

```
/sdd-implement .agents/features/20261009-provider-module/plan-1-unverified-provider-lock.md
Spec revision 6. Follow the plan's phases and stop points exactly; write the implementation report in the feature folder.
```

### Review (fresh session)

```
/sdd-review .agents/features/20261009-provider-module/plan-1-unverified-provider-lock.md
Spec revision 6. Check AC2 and AC2a against the real diff, run npm test, typecheck and lint, and confirm the server gate in execute cannot be bypassed.
```

### Ship (only after review passes and the user authorizes the commit)

```
/sdd-ship .agents/features/20261009-provider-module/plan-1-unverified-provider-lock.md
```

## Remaining plans

Not written yet. Plan the rest of the provider module after plan 1 ships.
