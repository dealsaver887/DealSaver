---
name: DealSaver deal data rules
description: Product rules for manually entered deals and expiry behavior.
---

Only admin-entered, real retailer deals should appear; do not seed or fabricate sample deals. An omitted end date means the deal has no expiry.

**Why:** the user requested manually curated deals, no fake records, and no expiry unless an end date is entered.

**How to apply:** Preserve these constraints in data setup, admin entry, deal filtering, and tests.