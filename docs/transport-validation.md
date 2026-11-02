# Transport validation and scorecard interpretation

The default lite transport deliberately implements tools only, without loading
MCP SDK resources/prompts. This is a footprint feature, not a promise that lite
exposes every optional MCP capability. SDK mode (`--sdk`, no `--lean`) already
registers four actual metadata resources: `memory://inventory`,
`memory://agent-manifest`, `memory://capabilities`, and
`memory://connection-status`. No new resource is added for a score.

CI tests the default lite mode, full SDK mode and lean SDK mode through real
stdio clients. It requires the same 15 tools, intent gating and real synthetic
read/write behavior. Full SDK must list/read the four existing resources without
returning stored entry keys/values. A two-process SDK test exercises 24 writes to
a shared temporary WAL database with case-distinct namespaces. This tests a
bounded workload, not crash durability or all scheduling/race conditions.

The scorecard source is pinned to reviewed commit
`e211c329379d52e47b0fafc0b54de7a6575617b3`. Its complete 11 checks and weights are
unchanged. CI retains both raw JSON reports in the job log (and writes local JSON files). Lite's `resources` check remains
**FAIL / 0**, explicitly checked as the documented absence of an optional
surface; every other lite check must pass. Full SDK must pass **all** checks,
including resources. Neither report is relabeled as the other mode, and no
aggregate score hides a failing functional check. Resource listing alone is
supplemented by the actual resource-read tests above.

The audit launches only this repository's built entrypoint against newly created
fake databases. A dedicated target wrapper selects the documented transport
inside the subprocess because the scorecard intentionally does not forward
arbitrary environment variables. It does not expand scorecard credential
inheritance. It never opens the user's default memory database.

Namespaces are cooperative key scoping, not authentication/tenant boundaries:
processes with the same database access can choose global mode, and store-wide
metadata/FTS corpus statistics are shared. Existing connection-status resource
performs lazy TTL cleanup, so it is not a guarantee of zero filesystem writes.
