/**
 * ERROR_CATALOG - Client User-Facing Messages & Actions
 * Plain, specific, and blame-free copy with placeholder interpolation.
 * Prepared for internationalization (i18n-ready, key-based, RTL-safe).
 */

export const ERROR_MESSAGES = {
  // Auth
  AUTH_INVALID_CREDENTIALS: {
    title: "Invalid Credentials",
    message: "The email or password you entered is incorrect. Please check and try again.",
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: "Try Again", action: "retry" },
  },
  AUTH_ACCOUNT_LOCKED: {
    title: "Account Temporarily Locked",
    message: "Too many failed sign-in attempts. For your security, this account is locked for {minutesLeft} minutes.",
    severity: "danger",
    presentation: "modal",
    primaryAction: { label: "Wait for Timer", action: "wait" },
  },
  AUTH_MFA_REQUIRED: {
    title: "Two-Factor Authentication Required",
    message: "Please enter the 6-digit code from your authenticator app to complete sign-in.",
    severity: "info",
    presentation: "modal",
    primaryAction: { label: "Verify Code", action: "mfa_challenge" },
  },
  AUTH_MFA_INVALID_CODE: {
    title: "Invalid Verification Code",
    message: "The 6-digit code was incorrect or has expired. Please check your authenticator and try again.",
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: "Retry Code", action: "retry" },
  },
  AUTH_MFA_RECOVERY_USED: {
    title: "Backup Recovery Code Used",
    message: "You used a single-use backup recovery code. We strongly recommend generating new recovery codes now.",
    severity: "warning",
    presentation: "toast",
    primaryAction: { label: "Settings", action: "navigate_settings" },
  },
  AUTH_TOKEN_EXPIRED: {
    title: "Session Expired",
    message: "Your session has expired. Please enter your credentials to resume without losing your current progress.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Sign In Again", action: "relogin" },
  },
  AUTH_TOKEN_INVALID: {
    title: "Authentication Required",
    message: "Your session could not be verified. Please sign in to continue.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Sign In", action: "login" },
  },
  AUTH_WRONG_AUDIENCE: {
    title: "Access Restricted",
    message: "Your account credentials are valid for a different portal. Please sign in through the designated login page.",
    severity: "danger",
    presentation: "modal",
    primaryAction: { label: "Switch Portal", action: "switch_portal" },
  },
  AUTH_SESSION_REVOKED: {
    title: "Session Terminated",
    message: "This session was signed out from another device or your password was reset.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Sign In Again", action: "login" },
  },
  AUTH_IP_NOT_ALLOWED: {
    title: "Network Restricted",
    message: "Access to this platform console is restricted to authorized corporate networks or VPNs.",
    severity: "danger",
    presentation: "banner",
    primaryAction: { label: "Contact Admin", action: "support" },
  },
  AUTH_FORBIDDEN: {
    title: "Permission Denied",
    message: "You do not have the required permissions to access this feature.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Go Back", action: "back" },
  },

  // Tenant / Plan
  TENANT_NOT_FOUND: {
    title: "Gym Not Found",
    message: "We couldn't find a gym workspace associated with this address.",
    severity: "danger",
    presentation: "banner",
    primaryAction: { label: "Contact Support", action: "support" },
  },
  TENANT_SUSPENDED: {
    title: "Subscription Suspended",
    message: "Your gym's subscription is currently suspended. Data access is restricted.",
    severity: "danger",
    presentation: "banner",
    primaryAction: { label: "Contact Support", action: "billing" },
  },
  TENANT_CANCELLED: {
    title: "Account Cancelled",
    message: "This gym account has been deactivated. Please reach out to reactivate your workspace.",
    severity: "danger",
    presentation: "banner",
    primaryAction: { label: "Reactivate Account", action: "billing" },
  },
  SUBSCRIPTION_PAST_DUE: {
    title: "Payment Past Due",
    message: "Your subscription payment is overdue. Read-only mode is active until payment is completed.",
    severity: "warning",
    presentation: "banner",
    primaryAction: { label: "Update Billing", action: "billing" },
  },
  TRIAL_EXPIRED: {
    title: "Trial Period Ended",
    message: "Your free trial has ended. Select a subscription plan to continue managing your gym.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "View Plans", action: "billing" },
  },
  MAINTENANCE_MODE: {
    title: "Scheduled Maintenance",
    message: "Leap is temporarily performing scheduled upgrades. We will be back online shortly.",
    severity: "info",
    presentation: "banner",
    primaryAction: { label: "Refresh", action: "reload" },
  },
  FEATURE_NOT_IN_PLAN: {
    title: "Plan Upgrade Required",
    message: "The '{feature}' feature is not included in your current subscription plan. Upgrade to {requiredPlan} to unlock it.",
    severity: "info",
    presentation: "modal",
    primaryAction: { label: "Upgrade Plan", action: "upgrade" },
    secondaryAction: { label: "Not Now", action: "dismiss" },
  },
  PLAN_LIMIT_REACHED: {
    title: "Plan Limit Reached",
    message: "You have reached your plan limit of {max} {limit}. Upgrade your subscription to add more.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Increase Limit", action: "upgrade" },
    secondaryAction: { label: "Cancel", action: "dismiss" },
  },
  ROLE_NOT_IN_PLAN: {
    title: "Role Not Permitted",
    message: "The '{role}' staff role is not available under your current plan tier.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Upgrade Plan", action: "upgrade" },
  },

  // Billing
  BILLING_PAYMENT_PENDING: {
    title: "Payment Verification In Progress",
    message: "Your payment reference has been submitted and is currently being verified by our accounts team.",
    severity: "info",
    presentation: "modal",
    primaryAction: { label: "Check Invoices", action: "invoices" },
  },
  BILLING_PAYMENT_FAILED: {
    title: "Payment Could Not Be Processed",
    message: "The transaction was declined by the payment provider. Your card was not charged.",
    severity: "danger",
    presentation: "modal",
    primaryAction: { label: "Try Different Card", action: "retry" },
    secondaryAction: { label: "Contact Bank", action: "dismiss" },
  },
  BILLING_DUPLICATE_PAYMENT_REF: {
    title: "Duplicate Payment Reference",
    message: "This payment reference code was already confirmed. You were not charged twice.",
    severity: "info",
    presentation: "modal",
    primaryAction: { label: "View Invoices", action: "invoices" },
  },
  BILLING_SEATS_SOLD_OUT: {
    title: "Offer Sold Out",
    message: "All seats for this lifetime subscription tier have been claimed. Please explore our other plans.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Choose Another Plan", action: "plans" },
  },
  BILLING_COUPON_INVALID: {
    title: "Coupon Not Applied",
    message: "The promo code entered is either invalid, expired, or has reached its redemption limit.",
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: "Re-enter Code", action: "retry" },
  },
  BILLING_DOWNGRADE_DISALLOWED: {
    title: "Downgrade Restricted",
    message: "Downgrading is restricted while active usage exceeds the limits of the target tier.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Contact Support", action: "support" },
  },
  BILLING_REFUND_WINDOW_CLOSED: {
    title: "Refund Window Expired",
    message: "This transaction is past the allowable refund window and cannot be refunded automatically.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Close", action: "dismiss" },
  },
  BILLING_INVOICE_NOT_FOUND: {
    title: "Invoice Not Found",
    message: "The requested billing invoice record could not be found.",
    severity: "warning",
    presentation: "toast",
  },

  // Front Desk Check-in
  CHECKIN_MEMBER_BLOCKED: {
    title: "Member Blocked",
    message: "This member account is flagged as blocked. Access through the turnstile is restricted.",
    severity: "danger",
    presentation: "modal",
    primaryAction: { label: "View Member Details", action: "view_member" },
    secondaryAction: { label: "Dismiss", action: "dismiss" },
  },
  CHECKIN_MEMBERSHIP_EXPIRED: {
    title: "Membership Expired",
    message: "This member's subscription package has expired.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Renew Package", action: "renew_package" },
    secondaryAction: { label: "Dismiss", action: "dismiss" },
  },
  CHECKIN_NO_SESSIONS_LEFT: {
    title: "No Remaining Sessions",
    message: "Member has zero remaining sessions available on this package.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Add Sessions", action: "add_sessions" },
  },
  CHECKIN_UNKNOWN_BARCODE: {
    title: "Barcode Unrecognized",
    message: "No gym member was found matching the scanned barcode '{barcode}'.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Search by Phone or Name", action: "search_member" },
    secondaryAction: { label: "Scan Again", action: "retry_scan" },
  },
  CHECKIN_SCANNER_PERMISSION: {
    title: "Camera Access Required",
    message: "Camera permissions were denied in your browser. Please allow camera access in browser settings.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Grant Permission", action: "request_camera" },
  },

  // Data & Conflict
  VALIDATION_FAILED: {
    title: "Validation Error",
    message: "Please review the highlighted fields below and provide valid information.",
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: "Correct Fields", action: "focus_first" },
  },
  CONFLICT_DUPLICATE: {
    title: "Duplicate Information",
    message: "A record with this {field} already exists in the system.",
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: "Review Value", action: "retry" },
  },
  RESOURCE_NOT_FOUND: {
    title: "Record Not Found",
    message: "The record you requested may have been deleted or moved.",
    severity: "warning",
    presentation: "toast",
    primaryAction: { label: "Back to List", action: "back" },
  },
  VERSION_CONFLICT: {
    title: "Conflicting Changes Detected",
    message: "Another team member updated this record while you were editing. Reload to see the latest changes.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Reload Latest Data", action: "reload" },
    secondaryAction: { label: "Keep Editing", action: "dismiss" },
  },
  CANNOT_DELETE_IN_USE: {
    title: "Cannot Delete Item",
    message: "This item cannot be deleted because active records depend on it.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Understood", action: "dismiss" },
  },
  INVALID_ID: {
    title: "Invalid Identifier",
    message: "The format of the link or record identifier is invalid.",
    severity: "warning",
    presentation: "toast",
  },

  // Files & Imports
  UPLOAD_FILE_TOO_LARGE: {
    title: "File Exceeds Size Limit",
    message: "The file is larger than the allowed upload size.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Choose Smaller File", action: "retry" },
  },
  UPLOAD_INVALID_TYPE: {
    title: "Unsupported File Format",
    message: "This file format is not accepted. Please select a valid JPG, PNG, PDF, or Excel document.",
    severity: "warning",
    presentation: "toast",
  },
  UPLOAD_MAGIC_MISMATCH: {
    title: "File Verification Failed",
    message: "The file contents did not match the file extension. Please upload an authentic, uncorrupted file.",
    severity: "danger",
    presentation: "modal",
    primaryAction: { label: "Select New File", action: "retry" },
  },
  STORAGE_UNAVAILABLE: {
    title: "Storage Temporarily Unavailable",
    message: "Unable to reach file storage at this moment. Your file was not saved.",
    severity: "danger",
    presentation: "toast",
    primaryAction: { label: "Retry Upload", action: "retry" },
  },
  IMPORT_ROW_ERRORS: {
    title: "Import Finished with Errors",
    message: "{errorCount} of {totalCount} rows could not be imported due to formatting or duplicate issues.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Download Failed Rows (CSV)", action: "download_failed_csv" },
    secondaryAction: { label: "Close", action: "dismiss" },
  },

  // Platform Console Operations
  PLATFORM_REASON_REQUIRED: {
    title: "Reason Required",
    message: "Platform operations require a clear, mandatory reason for the audit trail.",
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: "Provide Reason", action: "focus_reason" },
  },
  IMPERSONATION_EXPIRED: {
    title: "Support Impersonation Expired",
    message: "Your support impersonation session has expired. Return to the platform console to re-authorize.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Back to Platform", action: "exit_impersonation" },
  },
  IMPERSONATION_READ_ONLY: {
    title: "Read-Only Impersonation Active",
    message: "You are currently browsing under a read-only support session. Data modifications are blocked.",
    severity: "info",
    presentation: "modal",
    primaryAction: { label: "Understood", action: "dismiss" },
  },
  LAST_SUPERADMIN_PROTECTED: {
    title: "Action Prohibited",
    message: "You cannot delete, suspend, or demote the last remaining super administrator account.",
    severity: "danger",
    presentation: "modal",
    primaryAction: { label: "Understood", action: "dismiss" },
  },
  CONFIRMATION_SLUG_MISMATCH: {
    title: "Confirmation Mismatch",
    message: "The typed confirmation text did not match the target gym slug '{expectedSlug}'.",
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: "Re-type Slug", action: "retry" },
  },
  PURGE_RETENTION_BLOCKED: {
    title: "Data Retention Block",
    message: "This gym account cannot be purged because it is still within the mandatory data retention window.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Close", action: "dismiss" },
  },

  // System & Network
  RATE_LIMITED: {
    title: "Rate Limit Exceeded",
    message: "You have made too many requests in a short time. Please wait for the cooldown timer.",
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: "Wait for Cooldown", action: "wait" },
  },
  NETWORK_OFFLINE: {
    title: "You Are Offline",
    message: "Unable to reach the server. Please check your internet connection.",
    severity: "warning",
    presentation: "banner",
    primaryAction: { label: "Retry Connection", action: "retry" },
  },
  REQUEST_TIMEOUT: {
    title: "Request Timed Out",
    message: "The server took too long to answer. Your connection may be slow or interrupted.",
    severity: "warning",
    presentation: "toast",
    primaryAction: { label: "Try Again", action: "retry" },
  },
  UPSTREAM_UNAVAILABLE: {
    title: "External Service Unavailable",
    message: "A third-party service ({serviceName}) is temporarily unavailable. Please try again shortly.",
    severity: "warning",
    presentation: "toast",
    primaryAction: { label: "Retry", action: "retry" },
  },
  ROUTE_NOT_FOUND: {
    title: "Page or Resource Not Found",
    message: "The requested page or API endpoint does not exist.",
    severity: "warning",
    presentation: "toast",
  },
  INVALID_JSON: {
    title: "Invalid Request Format",
    message: "The data sent to the server was not properly formatted.",
    severity: "danger",
    presentation: "toast",
  },
  INTERNAL_ERROR: {
    title: "Something Went Wrong",
    message: "An unexpected error occurred on our end. Our team has been notified.",
    severity: "critical",
    presentation: "modal",
    primaryAction: { label: "Try Again", action: "retry" },
    secondaryAction: { label: "Copy Details", action: "copy_details" },
  },
};

/**
 * Format error message with placeholder replacement from details
 */
export function formatErrorMessage(code, details = {}, fallbackMessage = null) {
  const item = ERROR_MESSAGES[code] || ERROR_MESSAGES.INTERNAL_ERROR;
  let text = fallbackMessage || item.message;

  if (details && typeof details === "object") {
    for (const [key, val] of Object.entries(details)) {
      if (val != null) {
        text = text.replaceAll(`{${key}}`, String(val));
      }
    }
  }

  // Clean any unreplaced placeholders
  text = text.replace(/\{[a-zA-Z0-9_]+\}/g, "");
  return text.trim();
}

/**
 * Retrieve metadata for a given error code
 */
export function getErrorMeta(code, details = {}) {
  const item = ERROR_MESSAGES[code] || ERROR_MESSAGES.INTERNAL_ERROR;
  return {
    ...item,
    message: formatErrorMessage(code, details),
  };
}
