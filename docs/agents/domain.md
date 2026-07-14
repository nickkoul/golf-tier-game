# Domain Docs

## Before exploring, read these

- `CONTEXT.md` at the repository root, or `CONTEXT-MAP.md` if it exists.
- Relevant ADRs in `docs/adr/`.

If they do not exist, proceed silently. The `/domain-modeling` skill creates them only when a term or decision requires one.

## File structure

This is a single-context repository:

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Use the glossary's vocabulary

Use terms defined in `CONTEXT.md` for issues, code, tests, and documentation. Flag a conflict with an existing ADR rather than silently overriding it.
