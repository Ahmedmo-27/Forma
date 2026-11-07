# Business intelligence

Forma analytics help a gym decide what to do next. Every number comes from a snapshot. The page never scans the whole member collection while someone is waiting.

## Money

Source documents still store pounds as JavaScript numbers. Snapshots store integer piasters (`round(pounds × 100)`). Membership sales use `pricePaid` minus `refundAmount`. If `pricePaid` is missing, the package snapshot price is used. The live package catalog is never used. Personal training sales are a separate total. There is no sale credit to a staff member.

## Time

Days follow `Tenant.settings.locale.timezone`, default `Africa/Cairo`. A check-in at 00:30 Cairo time belongs to that Cairo date, even when the server clock is still on the previous UTC date.

## Snapshots

`TenantMetricSnapshot` is tenant-scoped. The unique key is tenant, grain, and local date. The hourly job rebuilds yesterday and today for every gym that is not suspended or cancelled. Running it twice overwrites the same rows. Quality warnings are stored on the snapshot instead of being dropped.

Rebuild history:

```bash
node src/scripts/backfillBiSnapshots.js --dry-run --from 2026-01-01 --to 2026-01-31
node src/scripts/backfillBiSnapshots.js --tenant <id> --from 2026-01-01 --to 2026-01-31
```

## Plans

| Plan | What you see |
|---|---|
| Basic (`members`, `checkin`, `pt_tracking`) | Active members, new joins, check-ins, membership sales for owners and accountants, PT sessions |
| Gold (`accounting`, `funnels`) | Refunds, discount gap, funnel counts, current-rep follow-up groups |
| Platinum (`exec_analytics`, `business_intelligence`) | Renewal, churn, cohorts, forecast, at-risk lists, insights, goals, CSV export |

`funnels` is included on the Gold plan in `seedPlans.js`. Existing gyms keep their saved plan until plans are seeded again.

## Goals

A suggestion needs 14 daily snapshots and the metric's own sample minimum (usually 20 events). The baseline is that gym's history. Rate targets move 15% of the remaining gap, capped at 5 points, for the achievable band, and 30% capped at 10 points for stretch. The owner can type another target. The sales-target goal uses the sum of `User.monthlyTarget` and is not a second quota.

Pace after the window has started: expected = baseline + (target − baseline) × time elapsed. On track at pace ≥ 0.9, at risk from 0.7, off track below 0.7.

## Insights

Rules live in `evaluateInsights`. They do not fire under the sample minimum. Dismissing an insight keeps it from being created again for that rule and week. An insight can become a goal. It does not create a separate task.

## Adding a metric

1. Add the definition in `Backend/src/services/bi/metrics.js`.
2. Increment it inside `computeDays` from a field that already exists.
3. Add a fixture in `metrics.test.js` with a hand-calculated expected value.
4. Expose it from `biController.js` behind the right `requireFeature` and role list.
5. Show it with the definition popover. Do not invent a number when the sample is small.

## What is not collected yet

Door denials, lost-lead reasons, payment date, balance due, hourly capacity, branch, class attendance, and WhatsApp delivery are absent. Those charts stay empty. Sale credit to a person is intentionally not calculated.

## Platform

The platform daily snapshot excludes lifetime licenses from MRR. Same-day logo churn uses cancellations whose `updatedAt` is that day. Net revenue retention stays blank until two monthly snapshots exist. Tenant health is 25 points each for an active or trial status, a staff request in 7 days, at least one member, and at least one staff user. `lastActivityAt` is written on authenticated gym requests, at most every 15 minutes.
