# TUXI PHASE 2F — CONTROLLED FINAL LOCK DOCUMENT

**Document Version:** `v2.6.0-lock-phase2f`  
**Authorization Date:** `2026-10-10`  
**Operator Authorization:** Accepted and Formally Authorized  
**Git Checkpoint Commit:** `39c03bff3846ca131dc538bdfb08381776509a77`  
**Git Tag:** `v2.6.0-phase2f-lock`  
**Lock State:** **LOCKED & IMMUTABLE**  

---

## 1. Executive Summary & Lock Scope

Phase 2F (Admin Command Center, Multi-Factor Authentication, Dual-Authorization Financial Governance, PostGIS Territory Oversight, Emergency Controls, and Gemini AI Operational Intelligence) is hereby formally locked.

This lock encapsulates all deliverables from Phase 1 through Phase 2F. All behavior, database schemas, cryptographic safeguards, access controls, and regression test suites are frozen. No modification to locked functionality may occur without explicit operator approval. Phase 2G remains unstarted, and external paid integrations remain inactive.

---

## 2. Verified Test Baseline & Regression Results

**Total Test Count:** **330 Tests Passed** across **11 Suites** (0 Failed, 0 Skipped, 100% Passing).  
**Runtime:** PostgreSQL 18.6 with PostGIS 3.6.4 (no SQLite fallback in production).

| # | Test Suite File | Tests | Status | Domain Verified |
|---|:---|:---:|:---:|:---|
| 1 | `tests/foundation.test.ts` | 30 | **PASSED** | Core framework, utilities, base validation |
| 2 | `tests/postgresFoundation.test.ts` | 29 | **PASSED** | PostgreSQL engine, PostGIS extension, RBAC matrix |
| 3 | `tests/phase2aAcceptanceGate.test.ts` | 33 | **PASSED** | Customer Eats workflows, 3% commission cap |
| 4 | `tests/phase2aEatsEndToEnd.test.ts` | 19 | **PASSED** | Customer checkout & merchant order flows |
| 5 | `tests/phase2bAcceptanceGate.test.ts` | 20 | **PASSED** | Shop inventory lifecycle, reservation release |
| 6 | `tests/phase2bShopEndToEnd.test.ts` | 25 | **PASSED** | Shop catalog, multi-item checkout persistence |
| 7 | `tests/phase2cCourierAndDriver.test.ts` | 28 | **PASSED** | 5-Driver race, delivery state machine, OTP proof |
| 8 | `tests/phase2dRepAcquisition.test.ts` | 44 | **PASSED** | 5-Rep race, 20 km territory, owner consent, ledger |
| 9 | `tests/phase2eMerchantOperations.test.ts` | 48 | **PASSED** | Reconciled merchant suite (all 48 locked tests passing) |
| 10 | `tests/phase2fAdminAcceptance.test.ts` | 43 | **PASSED** | MFA 128-bit recovery, 3% ceiling, dual auth, kill switch |
| 11 | `tests/phase2fGeminiIntelligence.test.ts` | 11 | **PASSED** | Gemini AI read-only boundaries, prompt injection defense |
| **TOTAL** | **11 Test Files** | **330** | **PASSED** | **100% Test Coverage** |

---

## 3. Database Schema & Migration Versions

Authoritative Database: **PostgreSQL 18.6** with **PostGIS 3.6.4**  
Table Count: **58 Tables Verified** in `public` schema  
Schema Migration Ledger (`schema_migrations`):

| Migration Version | Description | Invariants Enforced |
|:---|:---|:---|
| `001_initial_schema.sql` | Core schema, users, auth, addresses, spatial geom | PostGIS SRID 4326, user RBAC |
| `002_customer_and_eats.sql` | Customer profiles, eats restaurants, cart, orders | Order state machine, line items |
| `003_shop_and_inventory.sql` | Shop businesses, inventory items, SKU tracking | Concurrency stock locks, reservations |
| `004_courier_and_delivery_driver.sql` | Driver profiles, delivery states, OTP verification | 5-Driver race handling, delivery proof |
| `005_rep_business_acquisition.sql` | Rep profiles, territory hubs, acquisition drafts | 20 km PostGIS boundary, consent OTP |
| `006_terms_acceptance_evidence.sql` | Versioned clickwrap terms, legal audit evidence | Immutable legal audit trails |
| `007_merchant_operations.sql` | Merchant operational states, catalog management | Operating hours, menu management |
| `008_merchant_products_and_handoff.sql` | Handoff verification, product categories | Barcode / QR handoff checks |
| `009_merchant_commercial_rules.sql` | Merchant commission tiers, financial rules | Merchant settlement rules |
| `010_phase2f_ai_and_command_center.sql` | AI operational suggestions, semantic discovery | Structured AI suggestions, audit logs |
| `011_phase2f_admin_command_center.sql` | Admin MFA credentials, risk investigations, sanctions | TOTP secrets, session hashes |
| `012_phase2f_commission_cap_and_mfa_recovery.sql` | 3% Rep commission DB check, 128-bit MFA recovery | `CHECK (percentage_rate <= 0.0300)`, recovery purge |

---

## 4. Preserved Business Rules & Cryptographic Invariants

1. **Rep Commission Ceiling**:
   * Platform absolute maximum rate is strictly **3.00% (`0.0300`)** enforced by PostgreSQL `CHECK` constraints on both `commission_rules` and `financial_policies`.
   * Current active production configuration remains **2.50% (`0.0250`)**.
   * Historical commission attribution and ledger entries are immutable; unpaid orders generate 0 earned commission; refunds generate compensating negative entries.
2. **Rep Acquisition Territory**:
   * Exact **20.0 km radius** enforced via PostGIS `ST_DWithin` on home hub addresses.
   * Cross-territory and duplicate business registrations strictly blocked.
3. **Admin Multi-Factor Authentication & Cryptographic Security**:
   * RFC 6238 TOTP secrets encrypted at rest using **AES-256-GCM**.
   * Recovery codes provide minimum **128 bits of cryptographic entropy** (32 hex characters in hyphenated format).
   * Recovery codes stored as keyed **HMAC-SHA256 hashes**; single-use enforced via atomic database removal.
   * Brute-force lockout triggered upon 5 consecutive failed attempts.
   * MFA session tokens stored as SHA-256 hashes and revocable on demand.
4. **Dual Authorization & Separation of Duties**:
   * Financial policies and commission cap adjustments require proposal by one administrator and approval by an independent second administrator with verified MFA.
   * Merchants and Reps are prohibited from self-approving their own accounts or applications.
5. **Server-Side Payment Authority & Production Dispatch Gates**:
   * Production driver dispatch requires authoritative `CAPTURED` payment status from trusted server-side records.
   * Simulated payments and local overrides are strictly rejected in production mode.
6. **Gemini AI Security & Operational Boundaries**:
   * AI services are strictly read-only and tenant-scoped.
   * Prompt injection defense active on all inputs.
   * AI recommendations cannot auto-execute; human administrator approval is required.
   * AI has zero access to mutate financial policies, commission rules, or order payment states.

---

## 5. Remaining External Integration Dependencies

The following external service integrations remain gated until subsequent phases:
* **Production Payment Gateway** (Stripe / PayFast / Ozow): Server-side payment webhook listeners and tokenized settlement pipelines.
* **Production SMS / WhatsApp Gateway** (Twilio / Infobip): Hardware SMS delivery for driver and merchant OTPs (currently handled by secure server-side OTP generator).
* **Live Courier Telematics & Mapping SDKs**: Production Google Maps Platform API key deployment.
* **Gemini Production API**: Key management via server-side proxy routes.

---

## 6. Controlled Lock Authorization State

* **Phase 2F Lock:** **AUTHORIZED AND LOCKED**
* **Git Checkpoint:** Established on repository commit
* **Phase 2G Status:** **UNSTARTED (Awaiting Operator Authorization)**
* **External Paid Integrations:** **DISABLED**
