# Scheduler Analysis Notes - Feb 2026 Test
## Date: 2026-02-22

## Error Pattern Analysis

### Observed Errors:
- **Week 1 (Feb 1-8)**: Few errors, relatively successful
- **Week 2+ (Feb 9-28)**: Massive under-coverage
  - Early: 0-2 engineers (need 3)
  - Late: 0-2 engineers (need 3)
  - Morning: 0 engineers consistently (need 2)
  - Night: Sporadic issues on Feb 10, 17, 27

### Key Pattern:
Coverage collapses completely from Feb 9 onward (week 2 start).

---

## Root Cause Analysis

### ROOT CAUSE IDENTIFIED: Pipeline Order Bug

The current pipeline in `Scheduler.solve()`:
```
1. Initialize (all null)
2. Training shifts
3. Night shifts (entire month)
4. FOR EACH WEEK: solveWeek() → assigns Early/Late/Morning
5. assignOffDays() → assigns 2 consecutive OFF per week
6. Floaters
7. fillNullSlots
8. Balance
9. Rationality check
```

**THE BUG**: `solveWeek()` checks consecutive work days like this:
```javascript
for (let i = dayIndex - 1; i >= 0 && consecutive < 6; i--) {
  const checkShift = schedule[engineer.id]?.[checkDateStr];
  if (checkShift && checkShift !== SHIFTS.OFF && checkShift !== SHIFTS.UNAVAILABLE) {
    consecutive++;
  } else {
    break;
  }
}
if (consecutive >= 5) return false;  // BLOCKED!
```

When processing **Week 2 Monday (Feb 9)**:
- Engineers worked Mon-Fri in Week 1 (5 work shifts)
- OFF days for Week 1 NOT YET ASSIGNED (assignOffDays runs AFTER all weeks)
- Consecutive check: Mon→Sun→Sat→Fri→Thu→Wed→Tue→Mon = 5 work days found
- **ALL engineers blocked** because consecutive >= 5
- Result: 0 engineers eligible for Feb 9

### Why Week 1 Worked:
- Week 1 had no prior assignments to check
- Previous month's trailing days likely had breaks
- First week always has fresh start

---

## Solution Design

### Fix Option 1: Run OFF Assignment Per Week (RECOMMENDED)
Modify pipeline to interleave OFF assignment with week solving:
```
FOR EACH WEEK:
  1. solveWeek() - assign work shifts
  2. assignOffDaysForWeek() - assign OFF immediately
```

This ensures OFF days are visible to consecutive check for next week.

### Fix Option 2: Smarter Consecutive Check
Only look back to find actual breaks, treat null slots as potential OFF.
Less reliable - nulls might become work shifts.

### Fix Option 3: Limit Consecutive Check Window
Only check last 6 days (German law requirement).
Simpler but doesn't fix the fundamental issue.

---

## Implementation Plan

1. Refactor `assignOffDays()` to support single-week mode
2. Modify `solve()` pipeline to call OFF assignment after each week
3. Test with Feb 2026 data

---

## Technical Details

### Files to Modify:
- `server/services/scheduler/core/Scheduler.js`
  - `assignOffDays()` → add week parameter
  - `solve()` → interleave OFF assignment

### Coverage Requirements (from defaults.js):
```javascript
weekday: { Early: min 3, Late: min 3, Morning: min 2, Night: min 2 max 3 }
weekend: { Early: min 2, Late: min 2, Morning: min 1, Night: min 2 max 3 }
```

### Engineer Math:
- ~15 core engineers total
- 3 on Night (rotates bi-weekly)
- 12 available for day shifts
- Need 8 engineer-slots per weekday (3+3+2)
- Need 5 engineer-slots per weekend day (2+2+1)
- 12 engineers × 5 shifts/week = 60 capacity
- 5 weekdays × 8 + 2 weekend × 5 = 50 needed
- Math works IF engineers aren't blocked incorrectly

---

## Round 2 Analysis (v3.3.0 → v3.4.0)

### Results After Interleaved OFF Fix:
- Errors reduced from ~70 to 25
- Coverage now works in weeks 2+ (main fix successful)
- Remaining errors are scattered shortfalls, not total collapses

### Remaining Error Categories:
| Shift | # Errors | Pattern |
|-------|----------|---------|
| Early | 10 | Short by 1-2 on most weekdays |
| Late | 6 | Short by 1 on scattered days |
| Morning | 5 | 0 coverage on several days |
| Night | 4 | Short by 1 on transition days |

### Root Causes Found:

1. **Consecutive check `>= 5` too conservative** (all 3 files)
   - German law: `ArbZG.MAX_CONSECUTIVE_WORK_DAYS = 6`
   - Code blocked at 5: `if (consecutive >= 5) return false;`
   - Should be `>= 6` — gives ~20% more scheduling capacity
   - Affected: `solveWeek()`, `fillNullSlots()`, `DayShiftStrategy.js`

2. **TARGET_SHIFTS_PER_WEEK = 5 hard cap blocks coverage**
   - `if (weekShifts >= TARGET_SHIFTS_PER_WEEK) continue;`
   - Engineers at 5 shifts skipped even when coverage isn't met
   - Fix: Add overflow pass allowing up to 6 shifts (legal max)

3. **fillNullSlots() only fills +1 per shift gap**
   - `break;` after first assignment per shift
   - Shift needing 3 with 1 only gets bumped to 2
   - Fix: Remove break, loop until minRequired met

4. **Night cohort too small (3) for handling unavailability**
   - When 1 of 3 is unavailable, coverage drops to 1
   - Fix: Select cohort of 4, cap daily assignment at 3

### Fixes Applied (v3.4.0):
- Changed consecutive threshold: `>= 5` → `>= 6` (3 locations)
- Added overflow pass in solveWeek (allows up to 6 shifts/week for coverage)
- Fixed fillNullSlots to fill all gaps, not just +1
- Increased night cohort size from 3 to 4 (cap stays at 3/day)

---

## Round 3: Predetermined OFF Fix (v3.4.0 → v3.5.0)

### Bug Found:
When an engineer has 2+ predetermined OFF days that aren't consecutive (e.g., Tue + Thu),
`assignOffDaysForWeek()` would fall through the guard clauses and add a FULL PAIR of OFF
days on top, giving the engineer 4 OFF days instead of 2.

**Root cause**: Guard clause was `if (hasConsecutiveOff && existingOffDays.length >= 2)` —
requires BOTH conditions true. With non-consecutive predetermined OFF, `hasConsecutiveOff`
is false, so the guard fails.

### Fix:
Restructured OFF assignment into 3 clear cases:
1. **Have 2+ OFF (including predetermined)**: Done — skip entirely. Just warn if non-consecutive.
2. **Have 1 OFF (e.g., 1 predetermined)**: Add 1 more, prefer adjacent for consecutiveness.
3. **Have 0 OFF**: Find best consecutive pair (existing logic).

Also part of this commit: consecutive threshold fix, overflow pass, fillNullSlots gap fill,
and night cohort resilience from Round 2.

---

## Round 4: Pre Scheduled Day Off Data Flow Fix (v3.4.0 → v3.5.0)

### Bug Found:
Pre Scheduled Day Off wasn't being respected - showed as UNAVAILABLE instead of OFF in generated schedules.

**Root cause**: Data flow mismatch between routes:
- UI (`EngineerUnavailability.jsx`) calls `api.addUserUnavailableDates()` → `/users/:id/unavailable-dates`
- Scheduler's `isPredeterminedOff()` checks `engineer.unavailableTypes[dateStr]` (a map)
- But `users.js` POST route only stored `unavailableDates` array, NOT `unavailableTypes` map
- Meanwhile `engineers.js` route correctly stored the map, but UI wasn't calling that endpoint

### Fixes Applied:
1. **users.js POST route**: Now stores `unavailableTypes`, `unavailableNotes`, `unavailableSources` maps
   alongside the existing `unavailableDates` array (consistent with engineers.js)
2. **users.js DELETE route**: Now cleans up the maps when dates are removed
3. **Scheduler isPredeterminedOff()**: Added fallback to check `unavailableDates` array for legacy data
4. **fillNullSlots overflow**: Fixed bug where shortfall of 1 used standard limit (5) instead of legal max (6)

### Additional Fix:
In `fillNullSlots()`, the overflow logic only used legal max (6 shifts/week) when short by 2+,
but used standard limit (5) when short by just 1. Changed to always use legal max when under coverage.

---

## Commits History:
- `4abbf7f` - Fix Pre Scheduled Day Off data flow and improve coverage overflow (v3.5.0)
- `eac57d3` - Fix predetermined OFF data flow and rename to Pre Scheduled Day Off
- `f5ef42d` - Fix predetermined OFF counting and prevent excess OFF assignment
- `5559d55` - Refine scheduler: fix consecutive threshold, overflow pass, and night cohort
- `a4d46f0` - Fix consecutive work day check by interleaving OFF assignment per week
- `249f65e` - Remove template copying, solve each week independently
- `3989068` - Fix Night shift duplication and add max coverage enforcement
- `8dbe3a6` - Revert OFF-first pipeline, fix partial week handling and coverage
- `74fd41b` - Fix OFF reservation for partial weeks and update coverage priorities
- `f92a2e5` - Implement OFF-first pipeline to reduce scheduler errors
