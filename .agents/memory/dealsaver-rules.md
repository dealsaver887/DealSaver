---
name: DealSaver deal data rules
description: Product rules for manually entered deals and expiry behavior.
---

Only admin-entered, real retailer deals should appear; do not seed or fabricate sample deals. An omitted end date means the deal has no expiry.

**Why:** the user requested manually curated deals, no fake records, and no expiry unless an end date is entered.

**How to apply:** Preserve these constraints in data setup, admin entry, deal filtering, and tests.

When Supabase creates the table through its SQL Editor, the `service_role` may still lack table privileges even with RLS enabled. Grant schema usage and only the needed table CRUD operations to `service_role`; keep direct client access closed.

**Why:** running the initial setup produced PostgreSQL permission error `42501` for `public.deals`.

**How to apply:** Keep these explicit grants in the idempotent setup SQL and ask the project owner to rerun it if the API reports missing server permissions.