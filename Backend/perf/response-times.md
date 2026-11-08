# API response times

Measured again 8 Nov 2026, 03:33 UTC, as Owner of the leap gym, after the auth cache, the member-list cleanup, and the profile, check-in, and BI changes. Cold is one uncached request. Warm is the following cache hit. Load p95 is 10 samples at 5 in flight, and is blank when that route was not in the critical set.

The Before column is the first measurement the same morning, before those changes. Times are milliseconds. The grade is the worse of the cold time and the load p95.

| Class | Good | Moderate | Bad |
| --- | --- | --- | --- |
| Door (check-in list, unread count) | under 300 | 300–800 | over 800 |
| Login | under 800 | 800–2000 | over 2000 |
| Normal screens | under 500 | 500–1500 | over 1500 |
| Large reads | under 1500 | 1500–4000 | over 4000 |
| Snapshot BI | under 400 | 400–1200 | over 1200 |
| Check-in write | under 400 | 400–1000 | over 1000 |

Counts now: Good 37, Moderate 10, Bad 0, Error 1, Skipped 7. The first run was Good 6, Moderate 16, Bad 25, Error 1, Skipped 7. WhatsApp templates, billing prices, and the member package-exception read were measured again after those three handlers changed. The other rows are the 03:33 run.

## Critical routes

| Endpoint | Class | Before cold | Before p95 | Before | Cold | Warm | Load p95 | Now |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | --- |
| POST /api/users/login | login | 2787.9 |  | Bad | 1109.6 |  |  | Moderate |
| GET /api/users/sales-manager/revenue | large | 1550.7 | 2307.6 | Moderate | 571.8 | 1.5 | 21.6 | Good |
| GET /api/users/sales-manager/subscriptions | large | 1224.7 | 1148.0 | Good | 283.3 | 1.3 | 11.1 | Good |
| GET /api/members?limit=20 | normal | 10736.9 | 4500.2 | Bad | 585.4 | 1.3 | 11.0 | Moderate |
| GET /api/members?limit=10000 | large | 12190.3 | 4317.2 | Bad | 1182.2 | 1.6 | 9.1 | Good |
| GET /api/members?all=true | large | 6073.3 | 4577.7 | Bad | 874.8 | 1.7 | 12.3 | Good |
| GET /api/members/all?limit=10000 | large | 6835.8 | 4412.1 | Bad | 1330.6 | 1.3 | 9.2 | Good |
| GET /api/members/all-notes | large | 3482.4 | 2249.6 | Moderate | 306.9 | 1.5 | 12.9 | Good |
| GET /api/members/today-checkins | door | 2891.9 | 2268.1 | Bad | 301.6 | 1.6 | 301.1 | Moderate |
| GET /api/members/:id | normal | 5684.1 | 4457.4 | Bad | 885.6 | 1.4 | 4.9 | Moderate |
| GET /api/members/by/:id | normal | 1971.6 | 1703.1 | Bad | 574.8 | 1.7 | 20.4 | Moderate |
| GET /api/analytics/churn | large | 1942.2 | 1957.6 | Moderate | 294.9 | 1.9 | 17.8 | Good |
| GET /api/analytics/forecast | large | 1744.7 | 1697.8 | Moderate | 767.2 | 1.3 | 10.2 | Good |
| GET /api/analytics/cohorts | large | 1576.6 | 1723.1 | Moderate | 325.6 | 2.1 | 3.8 | Good |
| GET /api/analytics/attendance | large | 1399.5 | 1130.7 | Good | 299.8 | 1.5 | 18.8 | Good |
| GET /api/analytics/funnel | large | 1836.3 | 2255.2 | Moderate | 313.9 | 1.1 | 15.7 | Good |
| GET /api/analytics/executive | large | 1797.1 | 2121.8 | Moderate | 580.9 | 867.7 | 4.2 | Good |
| GET /api/bi/dashboard | bi | 1768.8 | 1140.3 | Bad | 291.3 | 1.0 | 4.7 | Good |
| GET /api/bi/cohorts | bi | 1170.1 | 1456.7 | Bad | 294.4 | 1.0 | 3.7 | Good |
| GET /api/bi/heatmap | bi | 1192.7 | 1714.8 | Bad | 694.1 | 1.1 | 15.9 | Moderate |
| GET /api/bi/forecast | bi | 1171.7 | 1146.9 | Moderate | 291.4 | 2.1 | 3.6 | Good |
| GET /api/bi/funnel | bi | 1124.6 | 1535.8 | Bad | 286.9 | 1.5 | 4.7 | Good |
| GET /api/bi/insights | bi | 1125.8 | 2067.0 | Bad | 292.5 | 1.2 | 3.8 | Good |
| GET /api/bi/objectives | bi | 1829.8 | 1416.7 | Bad | 291.1 | 1.3 | 3.8 | Good |
| GET /api/accounting/contracts | large | 1773.1 | 855.8 | Moderate | 884.7 | 1.2 | 4.0 | Good |
| GET /api/packages | normal | 1494.4 | 854.8 | Moderate | 306.0 | 2.2 | 6.0 | Good |
| GET /api/tenant/me | normal | 1699.3 | 1735.3 | Bad | 946.3 | 1.3 | 4.0 | Moderate |
| GET /api/requests | normal | 1412.8 | 1424.1 | Moderate | 584.7 | 1.0 | 4.3 | Moderate |
| POST /api/members/check-in | write | 1705.1 |  | Bad | 293.6 |  |  | Good |

Notifications and the unread count stayed 403 for this Owner token, so they are not timed.

## All endpoints

| Endpoint | Class | Status | Cold | Warm | Cache | Bytes | Load p50 | Load p95 | Grade |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| POST /api/users/login | login | 200 | 1109.6 |  |  | 1198 |  |  | Moderate |
| GET /api/users/profile | normal | 200 | 2.1 | 0.9 |  | 511 |  |  | Good |
| GET /api/users/me | normal | 200 | 361.7 | 626.4 |  | 881 |  |  | Good |
| GET /api/users/access/search?q=a | normal | 200 | 290.2 | 285.6 |  | 609 |  |  | Good |
| GET /api/users/access/search?role=Sales | normal | 200 | 294.8 | 287.3 |  | 984 |  |  | Good |
| GET /api/users/sales-revenue | large | 403 | 1.9 | 0.7 |  | 96 |  |  | Skipped |
| GET /api/users/sales-manager/revenue | large | 200 | 571.8 | 1.5 | HIT | 755 | 2.2 | 21.6 | Good |
| GET /api/users/sales-manager/subscriptions | large | 200 | 283.3 | 1.3 | HIT | 105 | 2.0 | 11.1 | Good |
| GET /api/users/my-subscriptions | large | 403 | 1.0 | 1.1 |  | 96 |  |  | Skipped |
| GET /api/users/sales-reps | normal | 200 | 284.9 | 1.2 | HIT | 3035 |  |  | Good |
| GET /api/users/sales | normal | 200 | 280.7 | 1.2 | HIT | 1070 |  |  | Good |
| GET /api/users/receptionists | normal | 200 | 286.5 | 1.2 | HIT | 3051 |  |  | Good |
| GET /api/users/team | large | 200 | 755.1 | 1.9 | HIT | 6235 |  |  | Good |
| GET /api/users/team/:id | large | 200 | 657.6 | 1.8 | HIT | 497 |  |  | Good |
| GET /api/users/coach-team | large | 200 | 326.0 | 1.0 | HIT | 1484 |  |  | Good |
| GET /api/users/coach-team/:id | large | 200 | 575.8 | 1.3 | HIT | 3318 |  |  | Good |
| GET /api/users/receptionist-team | normal | 200 | 438.1 | 1.5 | HIT | 278 |  |  | Good |
| GET /api/users/allTeams | normal | 500 | 1.4 | 1.2 | MISS | 54 |  |  | Error |
| GET /api/users/:id/access | normal | 403 | 309.7 | 653.8 |  | 48 |  |  | Skipped |
| GET /api/users/:id | normal | 200 | 697.2 | 2.3 | HIT | 235 |  |  | Moderate |
| GET /api/members?limit=20 | normal | 200 | 585.4 | 1.3 | HIT | 21374 | 1.6 | 11.0 | Moderate |
| GET /api/members?limit=10000 | large | 200 | 1182.2 | 1.6 | HIT | 22942 | 3.9 | 9.1 | Good |
| GET /api/members?all=true | large | 200 | 874.8 | 1.7 | HIT | 35778 | 4.0 | 12.3 | Good |
| GET /api/members/all?limit=10000 | large | 200 | 1330.6 | 1.3 | HIT | 22942 | 4.0 | 9.2 | Good |
| GET /api/members/all-notes | large | 200 | 306.9 | 1.5 | HIT | 10215 | 5.9 | 12.9 | Good |
| GET /api/members/today-checkins | door | 200 | 301.6 | 1.6 | HIT | 4478 | 3.5 | 301.1 | Moderate |
| GET /api/members/today-coach-transfers | normal | 403 | 1.6 | 1.3 |  | 93 |  |  | Skipped |
| GET /api/members/:id | normal | 200 | 885.6 | 1.4 | HIT | 39617 | 2.3 | 4.9 | Moderate |
| GET /api/members/by/:id | normal | 200 | 574.8 | 1.7 | HIT | 13690 | 2.9 | 20.4 | Moderate |
| GET /api/analytics/churn | large | 200 | 294.9 | 1.9 | HIT | 1210 | 2.5 | 17.8 | Good |
| GET /api/analytics/forecast | large | 200 | 767.2 | 1.3 | HIT | 1274 | 1.5 | 10.2 | Good |
| GET /api/analytics/cohorts | large | 200 | 325.6 | 2.1 | HIT | 1295 | 3.2 | 3.8 | Good |
| GET /api/analytics/attendance | large | 200 | 299.8 | 1.5 | HIT | 6908 | 3.3 | 18.8 | Good |
| GET /api/analytics/funnel | large | 200 | 313.9 | 1.1 | HIT | 707 | 2.2 | 15.7 | Good |
| GET /api/analytics/executive | large | 200 | 580.9 | 867.7 | HIT | 493 | 2.2 | 4.2 | Good |
| GET /api/bi/dashboard | bi | 200 | 291.3 | 1.0 | HIT | 11346 | 3.5 | 4.7 | Good |
| GET /api/bi/cohorts | bi | 200 | 294.4 | 1.0 | HIT | 959 | 3.3 | 3.7 | Good |
| GET /api/bi/heatmap | bi | 200 | 694.1 | 1.1 | HIT | 783 | 3.0 | 15.9 | Moderate |
| GET /api/bi/forecast | bi | 200 | 291.4 | 2.1 | HIT | 281 | 2.6 | 3.6 | Good |
| GET /api/bi/funnel | bi | 200 | 286.9 | 1.5 | HIT | 888 | 3.8 | 4.7 | Good |
| GET /api/bi/insights | bi | 200 | 292.5 | 1.2 | HIT | 455 | 3.5 | 3.8 | Good |
| GET /api/bi/objectives | bi | 200 | 291.1 | 1.3 | HIT | 31 | 3.7 | 3.8 | Good |
| GET /api/bi/export?metric=activeMembers | bi | 403 | 2.1 | 1.2 |  | 191 |  |  | Skipped |
| GET /api/notifications | normal | 403 | 1.5 | 1.1 |  | 68 |  |  | Skipped |
| GET /api/notifications/unread-count | door | 403 | 1.3 | 1.2 |  | 68 |  |  | Skipped |
| GET /api/accounting/contracts | large | 200 | 884.7 | 1.2 | HIT | 18733 | 3.6 | 4.0 | Good |
| GET /api/packages | normal | 200 | 306.0 | 2.2 | HIT | 7543 | 4.2 | 6.0 | Good |
| GET /api/tenant/me | normal | 200 | 946.3 | 1.3 | HIT | 8806 | 3.9 | 4.0 | Moderate |
| GET /api/tenant/billing/prices | normal | 200 | 303.2 | 1.2 | HIT | 3513 |  |  | Good |
| GET /api/requests | normal | 200 | 584.7 | 1.0 | HIT | 4907 | 3.9 | 4.3 | Moderate |
| GET /api/coach-requests | normal | 200 | 294.5 | 1.7 | HIT | 2 |  |  | Good |
| GET /api/whatsapp-templates | normal | 200 | 296.9 | 1.1 | HIT | 2858 |  |  | Good |
| GET /api/package-exceptions | normal | 200 | 578.1 | 1.4 | HIT | 11989 |  |  | Moderate |
| GET /api/package-exceptions/member/:id | normal | 200 | 285.8 | 1.2 | HIT | 982 |  |  | Good |
| POST /api/members/check-in | write | 201 | 293.6 |  |  | 217 |  |  | Good |

## Still outside Good

- Member list of 20 is 585 ms. Cached repeats are 11 ms. It is Moderate only because a normal screen is Good under 500.
- Today's check-ins are 302 ms, just over the 300 ms door line. Cached repeats are 2 ms.
- The member profile is 886 ms cold and 1.4 ms on a repeat. The shorter member read is 575 ms cold.
- BI heatmap is 694 ms on a cold miss and 1 ms after that. The other BI routes are under 300 ms cold.
- Gym settings are 946 ms cold. Requests are 585 ms cold. Both repeats are about 1 ms.
- Login is 1110 ms. Password hashing is still 12 rounds.
- `GET /api/users/allTeams` still returns 500.
