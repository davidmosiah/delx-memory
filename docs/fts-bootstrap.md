# FTS bootstrap and recovery scope

SQLite FTS5 external-content queries without MATCH read the content table.
Consequently, counting `memory_fts` cannot establish that historical entries
were indexed. Bootstrap now compares the documented default-columnsize docsize
row count with the memory table and rebuilds on a mismatch. Schema/triggers,
count comparison and rebuild execute in one immediate transaction.

This covers new FTS indexes over legacy databases, empty indexes left by the old
bootstrap, and count-mismatched partial indexes. Existing memory rows are not
changed by rebuilding. Tests use fresh synthetic databases only, verify actual
MATCH/tag/update/delete/reopen behavior, and kill a fixture child after the real
bootstrap callback but before commit to check rollback and subsequent recovery.

This is NOT a general integrity repair: equal counts may still hide stale tokens,
wrong rowids or other corruption. No arbitrary corrupted production DB is opened
by tests. Large rebuilds acquire a write lock and may exceed another writer's
existing 5-second busy timeout; unsupported/error FTS setup keeps the pre-existing
LIKE fallback. No guarantee of unlimited concurrent writers or crash durability
beyond the tested SQLite transaction boundary is made.

Reference: https://www.sqlite.org/fts5.html#external_content_table_pitfalls and
https://www.sqlite.org/fts5.html#the_docsize_table .
