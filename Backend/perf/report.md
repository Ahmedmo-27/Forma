# API response times

Measured 2026-11-08T03:33:48.730Z against http://127.0.0.1:5001 as Owner (leap).
Cold is one request with Cache-Control: no-cache. Warm is the next request after a fill, so X-Cache HIT means the in-memory cache served it. Load is p95 of 10 samples at 5-way concurrency with the cache left on.

## Bands

- Door (check-ins, unread count): Good under 300 ms, Moderate 300–800 ms, Bad over 800 ms.
- Login: Good under 800 ms, Moderate 800–2000 ms, Bad over 2000 ms. Password checks use 12 bcrypt rounds.
- Normal screens: Good under 500 ms, Moderate 500–1500 ms, Bad over 1500 ms.
- Large reads: Good under 1500 ms, Moderate 1500–4000 ms, Bad over 4000 ms.
- Snapshot BI: Good under 400 ms, Moderate 400–1200 ms, Bad over 1200 ms.
- Check-in write: Good under 400 ms, Moderate 400–1000 ms, Bad over 1000 ms.
- A warm HIT over 50 ms is payload size, not the database.

## Counts

- Good 34, Moderate 12, Bad 1, Error 1, Skipped 7.
- Requests sent: 432. Rate limited: no.

## Critical

| Endpoint | Class | Cold ms | Warm ms | Warm cache | Load p95 | Grade |
| --- | --- | ---: | ---: | --- | ---: | --- |
| POST /api/users/login | login | 1109.6 |  |  |  | Moderate |
| GET /api/users/sales-manager/revenue | large | 571.8 | 1.5 | HIT | 21.6 | Good |
| GET /api/users/sales-manager/subscriptions | large | 283.3 | 1.3 | HIT | 11.1 | Good |
| GET /api/members?limit=20 | normal | 585.4 | 1.3 | HIT | 11 | Moderate |
| GET /api/members?limit=10000 | large | 1182.2 | 1.6 | HIT | 9.1 | Good |
| GET /api/members?all=true | large | 874.8 | 1.7 | HIT | 12.3 | Good |
| GET /api/members/all?limit=10000 | large | 1330.6 | 1.3 | HIT | 9.2 | Good |
| GET /api/members/all-notes | large | 306.9 | 1.5 | HIT | 12.9 | Good |
| GET /api/members/today-checkins | door | 301.6 | 1.6 | HIT | 301.1 | Moderate |
| GET /api/members/6a41277efbd6496e1d99b3df | normal | 885.6 | 1.4 | HIT | 4.9 | Moderate |
| GET /api/members/by/6a41277efbd6496e1d99b3df | normal | 574.8 | 1.7 | HIT | 20.4 | Moderate |
| GET /api/analytics/churn | large | 294.9 | 1.9 | HIT | 17.8 | Good |
| GET /api/analytics/forecast | large | 767.2 | 1.3 | HIT | 10.2 | Good |
| GET /api/analytics/cohorts | large | 325.6 | 2.1 | HIT | 3.8 | Good |
| GET /api/analytics/attendance | large | 299.8 | 1.5 | HIT | 18.8 | Good |
| GET /api/analytics/funnel | large | 313.9 | 1.1 | HIT | 15.7 | Good |
| GET /api/analytics/executive | large | 580.9 | 867.7 | HIT | 4.2 | Good |
| GET /api/bi/dashboard | bi | 291.3 | 1 | HIT | 4.7 | Good |
| GET /api/bi/cohorts | bi | 294.4 | 1 | HIT | 3.7 | Good |
| GET /api/bi/heatmap | bi | 694.1 | 1.1 | HIT | 15.9 | Moderate |
| GET /api/bi/forecast | bi | 291.4 | 2.1 | HIT | 3.6 | Good |
| GET /api/bi/funnel | bi | 286.9 | 1.5 | HIT | 4.7 | Good |
| GET /api/bi/insights | bi | 292.5 | 1.2 | HIT | 3.8 | Good |
| GET /api/bi/objectives | bi | 291.1 | 1.3 | HIT | 3.8 | Good |
| GET /api/notifications | normal | 1.5 | 1.1 |  |  | Skipped |
| GET /api/notifications/unread-count | door | 1.3 | 1.2 |  |  | Skipped |
| GET /api/accounting/contracts | large | 884.7 | 1.2 | HIT | 4 | Good |
| GET /api/packages | normal | 306 | 2.2 | HIT | 6 | Good |
| GET /api/tenant/me | normal | 946.3 | 1.3 | HIT | 4 | Moderate |
| GET /api/requests | normal | 584.7 | 1 | HIT | 4.3 | Moderate |
| POST /api/members/check-in | write | 293.6 |  |  |  | Good |

## Every endpoint

| Endpoint | Class | Status | Cold ms | Cold cache | Warm ms | Warm cache | Bytes | Load p50 | Load p95 | Load max | Grade |
| --- | --- | ---: | ---: | --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| POST /api/users/login | login | 200 | 1109.6 |  |  |  | 1198 |  |  |  | Moderate |
| GET /api/users/profile | normal | 200 | 2.1 |  | 0.9 |  | 511 |  |  |  | Good |
| GET /api/users/me | normal | 200 | 361.7 |  | 626.4 |  | 881 |  |  |  | Good |
| GET /api/users/access/search?q=a | normal | 200 | 290.2 |  | 285.6 |  | 609 |  |  |  | Good |
| GET /api/users/access/search?role=Sales | normal | 200 | 294.8 |  | 287.3 |  | 984 |  |  |  | Good |
| GET /api/users/sales-revenue | large | 403 | 1.9 |  | 0.7 |  | 96 |  |  |  | Skipped |
| GET /api/users/sales-manager/revenue | large | 200 | 571.8 | BYPASS | 1.5 | HIT | 755 | 2.2 | 21.6 | 21.6 | Good |
| GET /api/users/sales-manager/subscriptions | large | 200 | 283.3 | BYPASS | 1.3 | HIT | 105 | 2 | 11.1 | 11.1 | Good |
| GET /api/users/my-subscriptions | large | 403 | 1 |  | 1.1 |  | 96 |  |  |  | Skipped |
| GET /api/users/sales-reps | normal | 200 | 284.9 | BYPASS | 1.2 | HIT | 3035 |  |  |  | Good |
| GET /api/users/sales | normal | 200 | 280.7 | BYPASS | 1.2 | HIT | 1070 |  |  |  | Good |
| GET /api/users/receptionists | normal | 200 | 286.5 | BYPASS | 1.2 | HIT | 3051 |  |  |  | Good |
| GET /api/users/team | large | 200 | 755.1 | BYPASS | 1.9 | HIT | 6235 |  |  |  | Good |
| GET /api/users/team/6a42bc00286f9e72da14da36 | large | 200 | 657.6 | BYPASS | 1.8 | HIT | 497 |  |  |  | Good |
| GET /api/users/coach-team | large | 200 | 326 | BYPASS | 1 | HIT | 1484 |  |  |  | Good |
| GET /api/users/coach-team/6a5188ddfdfb324a468d36bb | large | 200 | 575.8 | BYPASS | 1.3 | HIT | 3318 |  |  |  | Good |
| GET /api/users/receptionist-team | normal | 200 | 438.1 | BYPASS | 1.5 | HIT | 278 |  |  |  | Good |
| GET /api/users/allTeams | normal | 500 | 1.4 | BYPASS | 1.2 | MISS | 54 |  |  |  | Error |
| GET /api/users/6a5c24b953e87d4c902224d4/access | normal | 403 | 309.7 |  | 653.8 |  | 48 |  |  |  | Skipped |
| GET /api/users/6a5c24b953e87d4c902224d4 | normal | 200 | 697.2 | BYPASS | 2.3 | HIT | 235 |  |  |  | Moderate |
| GET /api/members?limit=20 | normal | 200 | 585.4 | BYPASS | 1.3 | HIT | 21374 | 1.6 | 11 | 11 | Moderate |
| GET /api/members?limit=10000 | large | 200 | 1182.2 | BYPASS | 1.6 | HIT | 22942 | 3.9 | 9.1 | 9.1 | Good |
| GET /api/members?all=true | large | 200 | 874.8 | BYPASS | 1.7 | HIT | 35778 | 4 | 12.3 | 12.3 | Good |
| GET /api/members/all?limit=10000 | large | 200 | 1330.6 | BYPASS | 1.3 | HIT | 22942 | 4 | 9.2 | 9.2 | Good |
| GET /api/members/all-notes | large | 200 | 306.9 | BYPASS | 1.5 | HIT | 10215 | 5.9 | 12.9 | 12.9 | Good |
| GET /api/members/today-checkins | door | 200 | 301.6 | BYPASS | 1.6 | HIT | 4478 | 3.5 | 301.1 | 301.1 | Moderate |
| GET /api/members/today-coach-transfers | normal | 403 | 1.6 |  | 1.3 |  | 93 |  |  |  | Skipped |
| GET /api/members/6a41277efbd6496e1d99b3df | normal | 200 | 885.6 | BYPASS | 1.4 | HIT | 39617 | 2.3 | 4.9 | 4.9 | Moderate |
| GET /api/members/by/6a41277efbd6496e1d99b3df | normal | 200 | 574.8 | BYPASS | 1.7 | HIT | 13690 | 2.9 | 20.4 | 20.4 | Moderate |
| GET /api/analytics/churn | large | 200 | 294.9 | BYPASS | 1.9 | HIT | 1210 | 2.5 | 17.8 | 17.8 | Good |
| GET /api/analytics/forecast | large | 200 | 767.2 | BYPASS | 1.3 | HIT | 1274 | 1.5 | 10.2 | 10.2 | Good |
| GET /api/analytics/cohorts | large | 200 | 325.6 | BYPASS | 2.1 | HIT | 1295 | 3.2 | 3.8 | 3.8 | Good |
| GET /api/analytics/attendance | large | 200 | 299.8 | BYPASS | 1.5 | HIT | 6908 | 3.3 | 18.8 | 18.8 | Good |
| GET /api/analytics/funnel | large | 200 | 313.9 | BYPASS | 1.1 | HIT | 707 | 2.2 | 15.7 | 15.7 | Good |
| GET /api/analytics/executive | large | 200 | 580.9 | BYPASS | 867.7 | HIT | 493 | 2.2 | 4.2 | 4.2 | Good |
| GET /api/bi/dashboard | bi | 200 | 291.3 | BYPASS | 1 | HIT | 11346 | 3.5 | 4.7 | 4.7 | Good |
| GET /api/bi/cohorts | bi | 200 | 294.4 | BYPASS | 1 | HIT | 959 | 3.3 | 3.7 | 3.7 | Good |
| GET /api/bi/heatmap | bi | 200 | 694.1 | BYPASS | 1.1 | HIT | 783 | 3 | 15.9 | 15.9 | Moderate |
| GET /api/bi/forecast | bi | 200 | 291.4 | BYPASS | 2.1 | HIT | 281 | 2.6 | 3.6 | 3.6 | Good |
| GET /api/bi/funnel | bi | 200 | 286.9 | BYPASS | 1.5 | HIT | 888 | 3.8 | 4.7 | 4.7 | Good |
| GET /api/bi/insights | bi | 200 | 292.5 | BYPASS | 1.2 | HIT | 455 | 3.5 | 3.8 | 3.8 | Good |
| GET /api/bi/objectives | bi | 200 | 291.1 | BYPASS | 1.3 | HIT | 31 | 3.7 | 3.8 | 3.8 | Good |
| GET /api/bi/export?metric=activeMembers | bi | 403 | 2.1 |  | 1.2 |  | 191 |  |  |  | Skipped |
| GET /api/notifications | normal | 403 | 1.5 |  | 1.1 |  | 68 |  |  |  | Skipped |
| GET /api/notifications/unread-count | door | 403 | 1.3 |  | 1.2 |  | 68 |  |  |  | Skipped |
| GET /api/accounting/contracts | large | 200 | 884.7 | BYPASS | 1.2 | HIT | 18733 | 3.6 | 4 | 4 | Good |
| GET /api/packages | normal | 200 | 306 | BYPASS | 2.2 | HIT | 7543 | 4.2 | 6 | 6 | Good |
| GET /api/tenant/me | normal | 200 | 946.3 | BYPASS | 1.3 | HIT | 8806 | 3.9 | 4 | 4 | Moderate |
| GET /api/tenant/billing/prices | normal | 200 | 568.4 |  | 575.1 |  | 3564 |  |  |  | Moderate |
| GET /api/requests | normal | 200 | 584.7 | BYPASS | 1 | HIT | 4907 | 3.9 | 4.3 | 4.3 | Moderate |
| GET /api/coach-requests | normal | 200 | 294.5 | BYPASS | 1.7 | HIT | 2 |  |  |  | Good |
| GET /api/whatsapp-templates | normal | 200 | 1739.2 | BYPASS | 2.9 | HIT | 2858 |  |  |  | Bad |
| GET /api/package-exceptions | normal | 200 | 578.1 | BYPASS | 1.4 | HIT | 11989 |  |  |  | Moderate |
| GET /api/package-exceptions/member/6a41277efbd6496e1d99b3df | normal | 200 | 850.3 | BYPASS | 2.2 | HIT | 982 |  |  |  | Moderate |
| POST /api/members/check-in | write | 201 | 293.6 |  |  |  | 217 |  |  |  | Good |

## What is still outside Good

These are the times after the auth cache, the list cleanup, and the profile, check-in, and BI cache changes. A cached repeat is a few milliseconds. The cold time is the one that sets the grade.

- **GET /api/members?limit=20** is Moderate at 585 ms because a normal screen is Good under 500. The cached load p95 is 11 ms. Expiry and sales assignment are no longer on this request.
- **GET /api/members/today-checkins** is Moderate at 302 ms cold and 301 ms load p95. The door line is 300 ms. The list now returns only today's entries. The 5-second cache is why a long load test still records a miss.
- **GET /api/members/:id** is Moderate at 886 ms cold. The repeat is 1.4 ms. The profile no longer populates every log author or saves a finished freeze.
- **GET /api/members/by/:id** is Moderate at 575 ms cold. The repeat is 1.7 ms.
- **GET /api/bi/heatmap** is Moderate at 694 ms cold. The repeat is 1.1 ms. The 120-second cache is already on this route.
- **GET /api/tenant/me** is Moderate at 946 ms cold. The repeat is 1.3 ms.
- **GET /api/requests** is Moderate at 585 ms cold. The repeat is 1 ms.
- **POST /api/users/login** is Moderate at 1110 ms. Password hashing stays at 12 rounds.
- **GET /api/whatsapp-templates** is the remaining Bad route, at 1739 ms cold, and it is not in the critical set. The cached repeat is 2.9 ms.

## Warm hits over 50 ms

- GET /api/analytics/executive: 867.7 ms, 493 bytes.
