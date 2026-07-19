---
name: Twilio WhatsApp official sender
description: Rules for official (non-sandbox) WhatsApp senders and env var vs secret precedence
---

- Official WhatsApp senders (registered via Meta/Twilio) can only message users outside a 24-hour session via **approved Content templates** (error 63016 otherwise). Sandbox never enforced this.
- **Why:** Meta policy; freeform body messages silently show "sent" via Twilio but land as `undelivered` with error 63016 — always check message status via `/Messages/<sid>.json`, not just the create call.
- **How to apply:** create templates via `content.twilio.com/v1/Content` + `/ApprovalRequests/whatsapp` (category UTILITY approves fast); send with `contentSid` + `contentVariables` (JSON string).
- A **shared env var silently overrides a secret with the same name**. Agent cannot set/delete secrets but CAN set/delete env vars — when a user keeps mis-entering a non-sensitive value into a secret, add an env-var override key (e.g. `TWILIO_WHATSAPP_FROM`) that the code prefers.
- The correct ONLINE sender in this account is `whatsapp:+15553707968` (the Meta-registered number); the purchased Twilio number +15739201367 is NOT a WhatsApp sender.
