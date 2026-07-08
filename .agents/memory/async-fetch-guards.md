---
name: Async fetch stale-response guards
description: Convention for guarding async fetches in the SPA against stale/overlapping responses
---
Every user-triggered async fetch in the React app must guard against stale responses before calling setState.
**Why:** The architect reviewer has failed reviews twice (admin ticket panel, public tracking portal) for races where an older in-flight response overwrote newer state.
**How to apply:** Use a monotonic request-id ref (or a "current selection" ref) checked after every await boundary, including catch/finally; also gate Enter-key handlers on the loading flag so overlapping submissions can't start.
