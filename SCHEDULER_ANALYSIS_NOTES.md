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

## Commits History:
- `249f65e` - Remove template copying, solve each week independently
- `3989068` - Fix Night shift duplication and add max coverage enforcement
- `8dbe3a6` - Revert OFF-first pipeline, fix partial week handling and coverage
- `74fd41b` - Fix OFF reservation for partial weeks and update coverage priorities
- `f92a2e5` - Implement OFF-first pipeline to reduce scheduler errors
