# Backend gaps

Capabilities the interface needs that the backend does not provide yet. Nothing
in this list may be built during an interface checkpoint: each item needs its
own review and approval, because it means schema, policy or business-rule work.

Recorded during Checkpoint 1 (foundations).

## Blocking

1. **The Vision schema does not exist in the current database.**
   `src/lib/vision/*` reads `students`, `guardians`, `student_guardians`,
   `class_offerings`, `programs`, `operating_periods`, `enrolments`, `charges`,
   `tutor_payouts` and the `v_*` views. The live database currently holds only
   `students`, `tutors`, `packages`, `student_packages`, `sessions`,
   `session_students` and `user_roles`. Every live read therefore fails at
   runtime, so screens can only be verified against mock mode until a reviewed
   migration lands.
2. **`staff` / role model.** `getMe` and `listStaff` expect a staff table with
   `owner` / `admin` / `tutor` roles. Only `user_roles` (`admin`, `staff`)
   exists, so owner-only surfaces (Tutor Pay, Staff) cannot be gated for real.

## Reads with no backend shape

3. **Reports metrics.** No aggregate source for the defined operational
   metrics; the Reports screen has no read to bind to.
4. **Hour-allocation balances.** Balances must be derived from attendance, not
   stored. Needs a view; no editable running-balance column may be added.
5. **Needs Attention rules.** The count and queue currently come from one
   server function whose rule set is not yet agreed as the full exception list.

## Legacy

6. **`/prototype/*` screens** read renamed `proto_*` tables that no longer
   exist. Unlinked from navigation in Checkpoint 0; permanent deletion is a
   separately reviewed cleanup.
