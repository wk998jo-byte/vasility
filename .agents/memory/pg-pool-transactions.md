---
name: pg.Pool transaction safety
description: Multi-statement DB writes must use the withTransaction helper (single checked-out client), never BEGIN/COMMIT on the pool.
---

The rule: never run `BEGIN`/`COMMIT`/`ROLLBACK` through `pool.query()`. In node-postgres, each `pool.query()` may use a different connection, so pool-level transactions silently don't work. Always wrap multi-statement writes in the `withTransaction(pool, fn)` helper (server/db.js), which checks out one client for the whole transaction.

**Why:** An architect review caught that all transactional routes used `req.db.query('BEGIN')` where `req.db` is a `pg.Pool` — the code passed low-concurrency tests but gave no real atomicity guarantee.

**How to apply:** Any new route that writes to more than one table (or needs rollback-on-404 semantics) goes through `withTransaction`. For expected control-flow aborts inside the transaction (e.g. not-found), throw a sentinel error with a custom `code` and map it to the HTTP status in the outer catch.
