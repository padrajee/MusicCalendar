# Music Calendar – Class Planner Blueprint

This repository now contains an implementation-ready blueprint for a music teacher calendar app that supports:

- 30 students across multiple U.S. time zones
- 2 lessons per student, per month
- Student self-booking against teacher availability
- Conflict-safe holds and booking confirmations
- Preferred-time request workflow when no slot works

## What is included

1. **PostgreSQL schema** with quota-safe booking support: `db/schema.sql`
2. **Slot generation logic** (teacher local rules -> UTC slots): `src/slotGeneration.ts`
3. **Workflow + API contract sketch** for Next.js API routes: `docs/booking-flow.md`

## Suggested stack

- Frontend: Next.js + React
- Backend: Next.js route handlers
- DB: PostgreSQL / Supabase
- Auth: Supabase Auth, Clerk, or Auth0
- Timezone library: Luxon

## Quick start (implementation sequence)

1. Apply SQL schema and indexes from `db/schema.sql`.
2. Implement auth and role-aware access (`teacher`, `student`).
3. Implement slot generation using `src/slotGeneration.ts`.
4. Build booking APIs in the order documented in `docs/booking-flow.md`.
5. Add calendar and notification integrations.

## Core architecture rules

- Persist all timestamps in UTC.
- Persist all user time zones as IANA strings.
- Enforce monthly quota in a transaction at confirm-booking time.
- Use expiring holds to avoid double booking races.
