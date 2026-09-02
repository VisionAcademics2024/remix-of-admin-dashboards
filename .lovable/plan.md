# Stage 3B production-calendar cutover preflight (read-only findings)

Read-only. No code, database, commit or Google Calendar change was made. Commit unchanged at `34ed78058d19fec8287cab5176fa64aa03783e8c`.

Window read: Mon 7 Sep 2026 00:00 to Mon 28 Sep 2026 00:00 Australia/Sydney (`2026-09-06T14:00Z` – `2026-09-27T14:00Z`).
Student, guardian, billing, attendance, balance and pay details are excluded. Several Google event titles contain student first names; they are referred to below by class type only.

## 1. Production calendar identity — unambiguous

- Name: **Vision Academics Classes** (description "Populated from Airtable")
- Calendar ID: `c_9c86f4e6b52d6368c41f70996a7bd74ae8ef7a3b36e9c0f5ef8e4336199a1921@group.calendar.google.com`
- Timezone: Australia/Sydney; access role: owner; data owner and connected account: `admin@visionacademics.com.au`
- Only one calendar carries that name, so there is no ambiguity. The Stage 3A test calendar ("Vision Classes – Sync Test", ID ending `…b48865c`) is a separate calendar and is untouched by this report.
- Other visible calendars: three staff mailbox calendars, one second personal Gmail calendar, Holidays in Australia. None is a class calendar.

## 2. Recurring master series — none

Reading with `singleEvents=false` returned **0 events carrying a recurrence rule** and 0 events carrying a `recurringEventId`. Every class event in the window is a standalone single event created from the Airtable import (one event per session, titles ending "– Session 08/09/10").

## 3. Exceptions — none

No cancelled instances (`status: cancelled`), no moved/edited instances, no `originalStartTime` overrides, nothing returned with `showDeleted=true`. Three events carry `sequence: 1` (edited once in July 2026), which is an ordinary edit, not a recurrence exception.

## 4. Visible counts in the interval

| Category | Count |
| --- | --- |
| Recurring occurrences | 0 |
| Recurrence exceptions | 0 |
| Standalone events | 51 |
| **Total visible** | **51** |

Of the 51, 48 are titled as scheduled and 3 carry a "[CANCELLED]" title prefix while still being `status: confirmed` on Google.

## 5. Likely duplicates and ambiguity on Google

- 3 events titled `[CANCELLED] …` (7, 14, 21 Sep, 08:00–10:00) are still confirmed and still occupy visible slots. One of them is double-prefixed `[CANCELLED] [CANCELLED] …`, evidence of repeated re-labelling rather than real cancellation.
- Those three sit on Mondays for the same private class that also has confirmed Wednesday 08:00 events (9, 16, 23 Sep) — a likely stale/duplicate pair from a pre-import reschedule.
- The description block on every event carries a stale `Status:` line ("Scheduled"/"Cancelled") and an empty `Room:` line; no event has a `location`, so room can never be used for matching.
- No two confirmed events share the same title and start time, so there are no exact duplicates.

## 6. Comparison against the 61 eligible dashboard Sessions

Dashboard side verified independently: exactly **61** future scheduled Sessions in the window (one further Session that day is `cancelled` and excluded). None of the 61 carries any Google mapping — all are `calendar_sync_status = not_synced` with no `google_event_id`, so the 3 Stage 3A mapped Sessions are outside this window and unaffected.

Matched cautiously on Sydney date, start time, duration and tutor (never on student or guardian data). Room is unusable on both sides (empty on Google, null on the dashboard).

| Outcome | Count | Notes |
| --- | --- | --- |
| Confident matches | 23 | Group classes where date, time, duration, tutor **and** class/program label agree (Year 3/4/5 R/W, M/TS, E/M streams across 8–27 Sep) |
| Ambiguous slot-only matches | 16 | Private 1:1 events: slot, duration and tutor agree, but Google titles are per-student and the dashboard offering is a generic private program — cannot be confirmed without student data |
| Missing from Google | 22 | Dashboard Sessions with no Google event at that slot/tutor at all (includes every Monday and Sunday-morning private slot, the Wednesday afternoon slots, and the Thursday 15:30/18:15 private slots) |
| Google-only | 12 | 3 `[CANCELLED]`-titled events; 3 Monday 15:30 group events whose tutor and weekday no longer match the dashboard (dashboard runs that class Tuesdays with a different tutor); 3 Monday 17:45 private events; 1 Monday 18:00 private event; 2 early-morning private events |
| Time/location conflicts | 4 signature-level | Same class stream appears on a different weekday and/or with a different tutor on Google than on the dashboard (Year 4 R/W Mon-vs-Tue, Year 3 E/M 10 Sep 16:00 vs dashboard 15:30 with a different tutor, and the two Monday/Wednesday private pairs). No room conflicts are detectable — no event has a location. |

Interpretation: the production calendar reflects the **Airtable-era timetable**, not the current dashboard timetable. Roughly a third of the interval disagrees on weekday, tutor or presence.

## 7. Is "end the series from 7 September, then backfill" safe?

The step as described does not apply: **there are no recurring series on this calendar in the window**, so there is nothing to truncate with an `UNTIL` rule. The equivalent safe cutover is a per-event reconciliation:

- Safe: creating dashboard-linked events for the 22 slots missing from Google, and adopting (PATCH + store `google_event_id`) the 23 confident matches.
- Not safe unattended: the 16 ambiguous private matches and the 12 Google-only events. Deleting or overwriting them from a signature match alone risks removing a real lesson or silently retitling the wrong student's event. These need an explicit owner decision, class by class.
- Also worth noting: Stage 3A code is deliberately update-only and hard-codes the test calendar ID, so no production write can happen until that constant and the create path are changed under a separate approved stage.

## 8. Exact set of writes that would be proposed next — none performed

| Proposed write | Count | Target |
| --- | --- | --- |
| PATCH existing event + store mapping on the Session (adopt) | 23 | Confident group-class matches |
| POST new event + store mapping | 22 | Dashboard Sessions missing from Google |
| Owner-reviewed decision, then PATCH-and-adopt or POST-new | 16 | Ambiguous private 1:1 slot matches |
| DELETE (or retitle) stale events | 3 | The `[CANCELLED]`-titled Monday events |
| Owner-reviewed decision, then DELETE or leave | 9 | Remaining Google-only events |

End state if all of the above were approved: 61 dashboard-linked events in the window, 0 unexplained Google-only events. Total writes would be 61 event writes plus up to 12 removals. **Nothing has been written.**

Stopping here as instructed — no further action without your approval of a Stage 3B write plan.
