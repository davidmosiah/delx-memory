# Footprint benchmarks (directional)

Run:

```bash
npm run build && npm run bench:rss
```

Example output on macOS (Node 23, 2026-08-12, after `initialize` + `tools/list`):

| Transport | RSS (KB) |
| --- | ---: |
| lite (default, no MCP SDK) | ~52 000 |
| sdk (full MCP SDK) | ~70 000 |

Delta ~18 MB favoring lite. Not lab-grade; use as a regression signal.

Independent measurement by [@illegal-xd](https://github.com/illegal-xd) (issue #7): custom JSON-RPC transport ~23–31 MB baseline vs MCP SDK path ~49–99 MB peak — SDK tree is the main overhead class.
