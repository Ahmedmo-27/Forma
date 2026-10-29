# Performance Optimization Review — member list/search `.select()` + `.lean()`

**Commit:** f22f5b0  
**Files:** `memberController.js`, `userController.js`, `Member.js`  
**Date:** 2026-10-29

---

## Checklist Results

### 1. No `.lean()` on `getMemberProfile` (auto-unfreeze path)
**PASS.** The diff and the current file both confirm `getMemberProfile` has no `.lean()` call. The query returns a full Mongoose document, `member.save()` is called safely inside the auto-unfreeze block, and `.toObject()` is called afterwards before passing to `redactMemberForViewer`. Correct.

### 2. `.select()` added to `getAllMembers` — both branches
**PASS.**  
- Global-search / `isGlobalSearch` branch: uses `MEMBER_SEARCH_SELECT` (`systemId memberId name phones photo status subscriptions assignedSales`). ✓  
- Paginated branch: uses `MEMBER_LIST_SELECT` (comprehensive list of all fields needed by the list view including `freezeDaysUsed`, `invitationsUsed`, `isBlocked`, `current_couch`, etc.). ✓

### 3. `.select()` added to `getMembers` — both branches
**PASS.**  
- Coach branch (`Member.find({ current_couch: req.user.id })`): `.select(MEMBER_LIST_SELECT)` added. Query does NOT use `.lean()` — still returns Mongoose documents, and `member.toObject()` is called in the `.map()`. Correct.  
- Sales/Owner paginated branch: `.select(MEMBER_LIST_SELECT)` added, `.lean()` already present. `formatSalesMember` receives a plain object — no `.save()` called. Correct.

### 4. `getSubscriptionsByDate` — `.lean()` added, no `.save()` on results
**PASS.** `.lean()` was added to the `Member.find(filter)` query. The function only reads fields to build the flattened `entries` array and never calls `.save()`. Correct.  
**Note (non-blocking):** No `.select()` was added to this query. The `filter` query could fetch all member fields including large subdocuments (`notes`, `alert`, `freeze`, `invitations`, `userlog`) which are not used in the response. This is a missed optimization opportunity but not a correctness or data failure.

### 5. `getMemberProfile` userlog slice — happens AFTER `member.save()`
**PASS.** In the current file, `member.save()` is called inside the auto-unfreeze `if` block (lines ~282–298), and `member.userlog.slice(-100)` is executed unconditionally afterwards (line ~301). The save precedes the slice. Correct.

### 6. No API response shape changes
**PASS.**  
- `MEMBER_LIST_SELECT` includes all fields consumed by `redactMemberForViewer` (`phones`, `nationalId` is not in select but it was never in the list response anyway), `isAssignedToRep` (`assignedSales`), `formatSalesMember` (`source`, `assignedSales`, `subscriptions`), and `formatCoachMember` (`current_couch`, `couch_subscription_status`).  
- `MEMBER_SEARCH_SELECT` is the lightweight search set; it includes `systemId memberId name phones photo status subscriptions assignedSales` — sufficient for the global search use case.  
- `getSubscriptionsByDate` reads `member._id`, `name`, `systemId`, `memberId`, `phones`, `status`, `assignedSales`, `subscriptions` — all present without an explicit `.select()`, so the full document is returned; no field is missing.  
- `getSalesProfile` members: `.select("systemId memberId name phones photo status isMember subscriptions assignedSales source createdAt")` was added. The response does `members.map((m) => m.toObject())` — no `.lean()`. All fields used by the response are in the select list. Correct.

### 7. Indexes in `Member.js`
**PASS.** Two new indexes added:
- `{ assignedSales: 1, systemId: 1 }` — supports sorted `getMembers` / `getAllMembers` queries.
- `{ "subscriptions.startDate": 1 }` — supports `getSubscriptionsByDate` range filter.

All six pre-existing indexes remain intact (`status+systemId`, `assignedSales+status`, `current_couch`, `isBlocked`, `name`, `phones`). No index was removed.

### 8. Syntax verification
**UNCONFIRMED.** The commit message is a single-line summary with no body. No `node -e "require(...)"` output or passing test/CI evidence was recorded in the commit or any separate file. The code reads as syntactically correct upon inspection, but the required verification artefact is absent.

---

## Additional Observations (non-blocking)

- **`getSalesManagerRevenue`**: The diff removed `.populate("assignedSales", "name email")` from the `members` query. The `reps` variable fetched alongside is not consumed in the revenue calculation or response. The response does not include per-rep attribution, so dropping the populate is harmless for this function. The `reps` query result is computed but never used in the response — minor dead work, not a correctness issue.
- **`getMembers` paginated branch**: `.lean()` was already present before this change (confirmed via diff context). The new `.select()` correctly restricts fields on the already-lean query.

---

## Verdict

**CHANGES_REQUESTED** — Missing required syntax verification evidence (checklist item 8). The commit message records no `node -e` check output. Per review instructions, missing required verification blocks approval.
