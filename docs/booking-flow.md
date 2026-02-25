# Booking Flow + API Contract (Next.js)

## Endpoints (MVP)

### `GET /api/slots?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Auth: student or teacher
- Returns available slots converted to requester timezone for display.
- Server should:
  1. Read UTC slots where `status='available'`.
  2. Include `held` slots only if held by current student and hold not expired.
  3. Convert UTC -> requester local for response payload.

### `POST /api/slots/:slotId/hold`
- Auth: student
- Purpose: create 10-minute hold to prevent race conditions.
- Transactional steps:
  1. Lock slot row (`SELECT ... FOR UPDATE`).
  2. Ensure slot is currently `available`.
  3. Set `status='held'`, `held_by_student_id=<me>`, `hold_expires_at_utc=now()+interval '10 min'`.

### `POST /api/bookings/confirm`
- Auth: student
- Body: `{ slotId: string }`
- Transactional steps:
  1. Lock slot row.
  2. Verify slot is `held` by student and hold not expired.
  3. Compute teacher-timezone month boundaries for slot start.
  4. Count student's booked lessons in month.
  5. If count >= quota and no bonus allowed, reject.
  6. Create lesson row.
  7. Mark slot `booked` and clear hold fields.

### `POST /api/requests`
- Auth: student
- Body: preferred windows + notes.
- Save proposal windows as UTC JSON array.

### `PATCH /api/requests/:id`
- Auth: teacher
- Approve, reject, or counter request.

## Quota enforcement query pattern

Compute month boundaries in teacher timezone using Luxon/date-fns-tz, then query UTC range:

```sql
select count(*)
from lessons
where student_id = $1
  and status = 'booked'
  and start_utc >= $2
  and start_utc < $3;
```

## Expired hold cleanup

Run every minute (cron/job):

```sql
update slots
set status = 'available',
    held_by_student_id = null,
    hold_expires_at_utc = null,
    updated_at = now()
where status = 'held'
  and hold_expires_at_utc < now();
```

## Notifications

On booking confirmation:
1. Send student + teacher email confirmation.
2. Create calendar event (Google/Outlook) with conferencing link.
3. Configure reminders (24h and 1h).
