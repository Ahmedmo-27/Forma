# Unified Error Handling & Modal System Architecture

This document defines the unified error handling architecture for Forma across the backend API, the tenant application, and the Platform Console.

---

## 1. Unified Response Envelope

Every error returned by any API endpoint follows this standard JSON structure:

```json
{
  "error": {
    "code": "PLAN_LIMIT_REACHED",
    "message": "You have reached your plan limit of 300 members.",
    "status": 403,
    "requestId": "req_8f1a2c3d",
    "details": {
      "limit": "maxMembers",
      "current": 300,
      "max": 300,
      "requiredPlan": "gold"
    },
    "fieldErrors": {
      "email": ["Invalid email format"]
    },
    "retryAfter": null,
    "docsKey": "plan-limits"
  }
}
```

### Envelope Properties
- **`code`** (string, required): Unique machine-readable identifier from `ERROR_CODES`.
- **`message`** (string, required): Safe, plain-language, blame-free default message.
- **`status`** (number, required): HTTP status code matching the response.
- **`requestId`** (string, required): Correlation ID in the format `req_[hex/uuid]` attached to request logs and HTTP headers (`X-Request-Id`).
- **`details`** (object, optional): Structured context parameters (e.g. `limit`, `current`, `max`, `feature`, `lockedUntil`). Sensitive fields are automatically sanitized.
- **`fieldErrors`** (object, validation only): Map of field names to arrays of validation error messages.
- **`retryAfter`** (number, rate limiting only): Seconds until the client may retry.
- **`docsKey`** (string, optional): Key pointing to user documentation.

> **Transitional Compatibility**: During platform migration, the backend response also mirrors top-level fields (e.g. `message`, `code`, `details` keys) so that legacy API clients continue functioning without breaking changes.

---

## 2. Backend `AppError` Class Hierarchy

Operational errors are modeled using an expressive class hierarchy extending `AppError`:

```text
AppError (isOperational = true)
├── ValidationError (code: VALIDATION_FAILED, status: 400, fieldErrors)
├── AuthError (code: AUTH_*, status: 401/429)
├── ForbiddenError (code: AUTH_FORBIDDEN, status: 403)
├── FeatureNotInPlanError (code: FEATURE_NOT_IN_PLAN, status: 403, feature, requiredPlan)
├── PlanLimitError (code: PLAN_LIMIT_REACHED, status: 403, limit, current, max)
├── SubscriptionError (code: TENANT_*, status: 403/404)
├── NotFoundError (code: RESOURCE_NOT_FOUND, status: 404)
├── ConflictError (code: CONFLICT_DUPLICATE / VERSION_CONFLICT, status: 409)
├── RateLimitError (code: RATE_LIMITED, status: 429, retryAfter)
├── PaymentError (code: BILLING_*, status: 402)
├── UploadError (code: UPLOAD_*, status: 400/413)
├── MaintenanceError (code: MAINTENANCE_MODE, status: 503)
├── UpstreamError (code: UPSTREAM_UNAVAILABLE, status: 502)
└── InternalError (code: INTERNAL_ERROR, status: 500, isOperational = false)
```

---

## 3. Full Error Code Table

| Code | Status | Category | Retryable | UI Presentation | User Action |
| :--- | :---: | :--- | :---: | :--- | :--- |
| `AUTH_INVALID_CREDENTIALS` | 401 | auth | Yes | Inline message | Verify credentials and try again. |
| `AUTH_ACCOUNT_LOCKED` | 429 | auth | Timer | RateLimitedModal | Wait for cooldown timer to expire. |
| `AUTH_MFA_REQUIRED` | 401 | auth | Yes | MFA modal | Enter 6-digit TOTP code. |
| `AUTH_MFA_INVALID_CODE` | 400 | auth | Yes | Inline message | Verify authenticator code or use backup. |
| `AUTH_MFA_RECOVERY_USED` | 200 | auth | No | Warning toast | Generate fresh recovery codes. |
| `AUTH_TOKEN_EXPIRED` | 401 | auth | Auto | SessionExpiredModal | Re-enter password without losing unsaved form. |
| `AUTH_TOKEN_INVALID` | 401 | auth | No | SessionExpiredModal | Sign in with valid credentials. |
| `AUTH_WRONG_AUDIENCE` | 401 | auth | No | ErrorModal | Sign in through designated portal. |
| `AUTH_SESSION_REVOKED` | 401 | auth | No | SessionExpiredModal | Sign in to acquire new active session. |
| `AUTH_IP_NOT_ALLOWED` | 403 | auth | No | Full-page banner | Connect to authorized network/VPN. |
| `AUTH_FORBIDDEN` | 403 | auth | No | ErrorModal | Contact manager for permission. |
| `TENANT_NOT_FOUND` | 404 | tenant | No | Full-page banner | Check workspace address. |
| `TENANT_SUSPENDED` | 403 | tenant | No | GlobalStatusBanner | Contact gym owner or platform billing. |
| `TENANT_CANCELLED` | 403 | tenant | No | GlobalStatusBanner | Contact support to reactivate. |
| `SUBSCRIPTION_PAST_DUE` | 403 | tenant | No | GlobalStatusBanner | Settle outstanding invoice. |
| `TRIAL_EXPIRED` | 403 | tenant | No | UpgradeRequiredModal | Select subscription plan. |
| `MAINTENANCE_MODE` | 503 | tenant | Yes | GlobalStatusBanner | Refresh page after maintenance window. |
| `FEATURE_NOT_IN_PLAN` | 403 | tenant | No | UpgradeRequiredModal | Upgrade plan tier to unlock feature. |
| `PLAN_LIMIT_REACHED` | 403 | tenant | No | UpgradeRequiredModal | Upgrade plan or archive inactive records. |
| `ROLE_NOT_IN_PLAN` | 403 | tenant | No | UpgradeRequiredModal | Upgrade plan tier to permit role. |
| `BILLING_PAYMENT_PENDING` | 402 | billing | Yes | ErrorModal | Wait for accounts team verification. |
| `BILLING_PAYMENT_FAILED` | 402 | billing | Yes | PaymentFailedModal | Try another card; card was not charged. |
| `BILLING_DUPLICATE_PAYMENT_REF` | 409 | billing | No | ErrorModal | Check transaction history. |
| `BILLING_SEATS_SOLD_OUT` | 409 | billing | No | ErrorModal | Choose another available plan. |
| `BILLING_COUPON_INVALID` | 400 | billing | Yes | Inline message | Re-enter promo code. |
| `BILLING_DOWNGRADE_DISALLOWED` | 400 | billing | No | ErrorModal | Contact support for plan adjustments. |
| `BILLING_REFUND_WINDOW_CLOSED` | 400 | billing | No | ErrorModal | Contact support for manual review. |
| `BILLING_INVOICE_NOT_FOUND` | 404 | billing | No | Toast | Verify invoice ID. |
| `CHECKIN_MEMBER_BLOCKED` | 403 | front_desk | No | ErrorModal | Review member alert notes or manager PIN. |
| `CHECKIN_MEMBERSHIP_EXPIRED` | 400 | front_desk | No | ErrorModal | Renew member package. |
| `CHECKIN_NO_SESSIONS_LEFT` | 400 | front_desk | No | ErrorModal | Add sessions to package. |
| `CHECKIN_UNKNOWN_BARCODE` | 404 | front_desk | Yes | Toast / Modal | Re-scan barcode or search by name. |
| `CHECKIN_SCANNER_PERMISSION` | Client | front_desk | Yes | ErrorModal | Allow camera access in browser. |
| `VALIDATION_FAILED` | 400 | data | Yes | Inline Field Errors | Correct highlighted input fields. |
| `CONFLICT_DUPLICATE` | 409 | data | Yes | Inline Field Error | Use unique value (email, phone, slug). |
| `RESOURCE_NOT_FOUND` | 404 | data | No | Toast / EmptyState | Return to list view. |
| `VERSION_CONFLICT` | 409 | data | Yes | ConflictModal | Reload latest data. |
| `CANNOT_DELETE_IN_USE` | 409 | data | No | ErrorModal | Delete or reassign dependent records. |
| `INVALID_ID` | 400 | data | No | Toast | Verify record link format. |
| `UPLOAD_FILE_TOO_LARGE` | 413 | files | Yes | ErrorModal | Select file under 5 MB. |
| `UPLOAD_INVALID_TYPE` | 400 | files | Yes | Toast | Select valid JPG, PNG, PDF, XLSX. |
| `UPLOAD_MAGIC_MISMATCH` | 400 | files | Yes | ErrorModal | Upload genuine uncorrupted file. |
| `STORAGE_UNAVAILABLE` | 503 | files | Yes | Toast | Retry upload in a few moments. |
| `IMPORT_ROW_ERRORS` | 422 | files | Yes | ImportErrorsModal | Download CSV of failed rows, correct, re-upload. |
| `PLATFORM_REASON_REQUIRED` | 400 | platform | Yes | Inline Field Error | Provide audit explanation reason. |
| `IMPERSONATION_EXPIRED` | 401 | platform | No | ErrorModal | Re-authorize from platform console. |
| `IMPERSONATION_READ_ONLY` | 403 | platform | No | ErrorModal | Read-only session blocks mutations. |
| `LAST_SUPERADMIN_PROTECTED` | 400 | platform | No | ErrorModal | Promote another super_admin first. |
| `CONFIRMATION_SLUG_MISMATCH` | 400 | platform | Yes | Inline Field Error | Type exact slug to confirm. |
| `PURGE_RETENTION_BLOCKED` | 400 | platform | No | ErrorModal | Wait until retention window expires. |
| `RATE_LIMITED` | 429 | system | Timer | RateLimitedModal | Wait for cooldown timer. |
| `NETWORK_OFFLINE` | Client | system | Auto | OfflineBanner | Auto-resumes on reconnect. |
| `REQUEST_TIMEOUT` | 408 | system | Yes | Toast | Check connection and retry. |
| `UPSTREAM_UNAVAILABLE` | 502 | system | Yes | Toast | Wait a few moments and retry. |
| `ROUTE_NOT_FOUND` | 404 | system | No | Toast | Check endpoint URL. |
| `INVALID_JSON` | 400 | system | Yes | Toast | Submit valid JSON. |
| `INTERNAL_ERROR` | 500 | system | Yes | ErrorModal | Friendly error + copyable request ID. |

---

## 4. UI Presentation Decision Table

| Error Scenario | Presentation Mode | Trigger Condition | Accessibility & User Next Action |
| :--- | :--- | :--- | :--- |
| **Field Validation Error** | **Inline Message** | 400 `VALIDATION_FAILED` | First invalid input focused automatically; mapped to `aria-describedby`. |
| **Minor / Transient Failure** | **Toast** | Non-blocking retryable action | Emitted to `aria-live="polite"` region. Auto-dismisses in 3.5s. |
| **Plan Gating & Limits** | **UpgradeRequiredModal** | 403 `PLAN_LIMIT_REACHED` / `FEATURE_NOT_IN_PLAN` | Trapped focus (`role="alertdialog"`). Direct CTA to billing. |
| **Authentication Expiry** | **SessionExpiredModal** | 401 session token expiry | Allows in-place password verification without wiping unsaved work. |
| **Rate Limiting** | **RateLimitedModal** | 429 with `retryAfter` | Live countdown timer with auto-enabling retry button. |
| **Concurrent Mutation** | **ConflictModal** | 409 `VERSION_CONFLICT` | Option to reload latest data or review local draft. |
| **Excel Batch Import** | **ImportErrorsModal** | 422 `IMPORT_ROW_ERRORS` | Scrollable error table + one-click CSV download of failed rows. |
| **Payment Declined** | **PaymentFailedModal** | 402 billing failure | Explicitly confirms "Your card was not charged" with request ID. |
| **Tenant Suspended / Past Due**| **GlobalStatusBanner** | 403 `TENANT_SUSPENDED` / `SUBSCRIPTION_PAST_DUE` | Pinned across top of layout. Allows read-only navigation. |
| **Device Offline** | **OfflineBanner** | `!navigator.onLine` | Pinned top banner; auto-dismisses upon reconnection. |
| **Unexpected 500 Failure** | **ErrorModal** | 500 `INTERNAL_ERROR` | Friendly message, copyable request ID, no internal stack leaks. |
| **Widget Render Failure** | **WidgetErrorBoundary** | React rendering throw in card | Isolates failure to that card; rest of page remains functional. |

---

## 5. How to Add a New Error Code End-to-End

1. **Add Code to Backend Enum (`Backend/src/utils/errorCodes.js`)**:
   ```javascript
   NEW_FEATURE_ERROR: {
     code: "NEW_FEATURE_ERROR",
     status: 400,
     category: "tenant",
     retryable: true,
     message: "Safe English default explanation.",
     userAction: "Clear instructions for what user should do next.",
   }
   ```
2. **Add Custom `AppError` Subclass (if needed) in `Backend/src/utils/errors.js`**:
   ```javascript
   class NewFeatureError extends AppError {
     constructor(message, details = {}) {
       super("NEW_FEATURE_ERROR", message, 400, details);
     }
   }
   ```
3. **Mirror in Frontend Catalog (`Frontend/src/lib/errorCodes.js` and `Frontend/src/lib/errorCatalog.js`)**:
   ```javascript
   NEW_FEATURE_ERROR: {
     title: "Feature Unavailable",
     message: "Unable to proceed with {featureName}.",
     severity: "warning",
     presentation: "modal",
     primaryAction: { label: "Try Again", action: "retry" },
   }
   ```
4. **Trigger from Backend Handler**:
   ```javascript
   throw new NewFeatureError("Could not process request", { featureName: "Locker Sync" });
   // Express 5 error middleware automatically formats into unified envelope!
   ```

---

## 6. How to Debug Using a Request ID

Every error payload contains a correlation `requestId` (e.g. `req_3f8a912e`).

1. **From User Report**: Ask the user for the Request ID displayed in the technical details drawer or modal footer.
2. **From Server Logs**: Search server log files (`logs/http.log` or `logs/errors.log`):
   ```bash
   grep "req_3f8a912e" Backend/logs/errors.log
   ```
3. **Structured Log Payload**: The log entry contains:
   - Request timestamp, IP, User Agent
   - Authenticated `userId`, `userRole`, and `tenantId`
   - Exact route and HTTP method
   - Sanitized request body (sensitive keys automatically redacted)
   - Full server stack trace and MongoDB error details

---

## 7. Migration Checklist

### Locations Migrated
- `Backend/src/middleware/errorHandler.js`: Upgraded to central envelope middleware converting Zod, Mongo 11000, CastError, JWT, Multer, and unknown exceptions.
- `Backend/src/middleware/requestId.js`: Sanitizes incoming `x-request-id` and prefixes uniform `req_...` format.
- `Backend/src/middleware/requestLogger.js`: Structured 4xx (`warn`) and 5xx (`error`) logging with deep PII sanitization.
- `Backend/src/middleware/featureGating.js`: Returns unified envelope for `FEATURE_NOT_IN_PLAN` and `TENANT_NOT_FOUND`.
- `Backend/src/middleware/tenantStatus.js`: Returns unified envelope for `PLAN_LIMIT_REACHED`, `ROLE_NOT_IN_PLAN`, `TENANT_SUSPENDED`, `SUBSCRIPTION_PAST_DUE`.
- `Backend/src/middleware/authMiddleware.js`: Returns unified envelope for token expiry, invalid token, and suspended gym.
- `Backend/src/middleware/platformAuth.js` & `platformRbac.js`: Returns unified envelope for platform token failure, session revocation, and permission denial.
- `Backend/src/middleware/loginLockout.js` & `userController.js`: Returns unified envelope with `AUTH_ACCOUNT_LOCKED` and anti-enumeration generic responses.
- `Backend/server.js`: Added `unhandledRejection` and `uncaughtException` process handlers.
- `Frontend/src/api/errorNormalizer.js`: Normalizes Axios, network offline, timeouts, cancels, and HTML proxy pages into unified `AppErrorView`.
- `Frontend/src/lib/errorCatalog.js`: Central i18n-ready message catalog with placeholder interpolation.
- `Frontend/src/lib/errorBus.js`: Global event bus with 4-second deduplication queue.
- `Frontend/src/components/errors/`: Complete suite of accessible modals (`ErrorModal`, `UpgradeRequiredModal`, `SessionExpiredModal`, `RateLimitedModal`, `ConflictModal`, `ImportErrorsModal`, `PaymentFailedModal`, `OfflineBanner`, `GlobalStatusBanner`, `ErrorBoundary`, `WidgetErrorBoundary`).
- `Frontend/src/api/axios.js` & `platformClient.js`: Integrated with normalizer and error bus; eliminates double toasts and supports `skipGlobalError: true`.
- `Frontend/src/pages/CheckIn.jsx`: Receptionist check-in upgraded with clear blocked/expired member handling and no duplicate toasts.
- `Frontend/src/components/AddMemberModal.jsx`: Inline field error mapping with `focusFirstInvalidField`.
- `Frontend/src/pages/Login.jsx`: Anti-enumeration inline alert without duplicate toasts.

### Locations Intentionally Left Alone
- **Internal Helper Functions**: Pure math utilities (`Backend/src/utils/revenueUtils.js`, `packageSnapshot.js`) throw standard errors that are properly caught by route handlers.
- **Vite Configuration & Build Pipeline**: Unchanged beyond bundling the new components.
