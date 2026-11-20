/**
 * ERROR_CATALOG - Client User-Facing Messages & Actions
 * Plain, specific, and blame-free copy with placeholder interpolation.
 * Prepared for internationalization (i18n-ready, key-based, RTL-safe).
 */

import { tr, tActive } from "../i18n/translate.js";

export const ERROR_MESSAGES = {
  // Auth
  AUTH_INVALID_CREDENTIALS: {
    title: tr("Invalid Credentials"),
    message: tr("The email or password you entered is incorrect. Please check and try again."),
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: tr("Try Again"), action: "retry" },
  },
  AUTH_ACCOUNT_LOCKED: {
    title: tr("Account Temporarily Locked"),
    message: tr("Too many failed sign-in attempts. For your security, this account is locked for {minutesLeft} minutes."),
    severity: "danger",
    presentation: "modal",
    primaryAction: { label: tr("Wait for Timer"), action: "wait" },
  },
  AUTH_TOKEN_EXPIRED: {
    title: tr("Session Expired"),
    message: tr("Your session has expired. Please enter your credentials to resume without losing your current progress."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Sign In Again"), action: "relogin" },
  },
  AUTH_TOKEN_INVALID: {
    title: tr("Authentication Required"),
    message: tr("Your session could not be verified. Please sign in to continue."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Sign In"), action: "login" },
  },
  AUTH_WRONG_AUDIENCE: {
    title: tr("Access Restricted"),
    message: tr("Your account credentials are valid for a different portal. Please sign in through the designated login page."),
    severity: "danger",
    presentation: "modal",
    primaryAction: { label: tr("Switch Portal"), action: "switch_portal" },
  },
  AUTH_SESSION_REVOKED: {
    title: tr("Session Terminated"),
    message: tr("This session was signed out from another device or your password was reset."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Sign In Again"), action: "login" },
  },
  AUTH_IP_NOT_ALLOWED: {
    title: tr("Network Restricted"),
    message: tr("Access to this platform console is restricted to authorized corporate networks or VPNs."),
    severity: "danger",
    presentation: "banner",
    primaryAction: { label: tr("Contact Admin"), action: "support" },
  },
  AUTH_FORBIDDEN: {
    title: tr("Permission Denied"),
    message: tr("You do not have the required permissions to access this feature."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Go Back"), action: "back" },
  },

  // Tenant / Plan
  TENANT_NOT_FOUND: {
    title: tr("Gym Not Found"),
    message: tr("We couldn't find a gym workspace associated with this address."),
    severity: "danger",
    presentation: "banner",
    primaryAction: { label: tr("Contact Support"), action: "support" },
  },
  TENANT_SUSPENDED: {
    title: tr("Subscription Suspended"),
    message: tr("Your gym's subscription is currently suspended. Data access is restricted."),
    severity: "danger",
    presentation: "banner",
    primaryAction: { label: tr("Contact Support"), action: "billing" },
  },
  TENANT_CANCELLED: {
    title: tr("Account Cancelled"),
    message: tr("This gym account has been deactivated. Please reach out to reactivate your workspace."),
    severity: "danger",
    presentation: "banner",
    primaryAction: { label: tr("Reactivate Account"), action: "billing" },
  },
  SUBSCRIPTION_PAST_DUE: {
    title: tr("Payment Past Due"),
    message: tr("Your subscription payment is overdue. Read-only mode is active until payment is completed."),
    severity: "warning",
    presentation: "banner",
    primaryAction: { label: tr("Update Billing"), action: "billing" },
  },
  TRIAL_EXPIRED: {
    title: tr("Trial Period Ended"),
    message: tr("Your free trial has ended. Select a subscription plan to continue managing your gym."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("View Plans"), action: "billing" },
  },
  MAINTENANCE_MODE: {
    title: tr("Scheduled Maintenance"),
    message: tr("Forma is temporarily performing scheduled upgrades. We will be back online shortly."),
    severity: "info",
    presentation: "banner",
    primaryAction: { label: tr("Refresh"), action: "reload" },
  },
  FEATURE_NOT_IN_PLAN: {
    title: tr("Plan Upgrade Required"),
    message: tr("The '{feature}' feature is not included in your current subscription plan. Upgrade to {requiredPlan} to unlock it."),
    severity: "info",
    presentation: "modal",
    primaryAction: { label: tr("Upgrade Plan"), action: "upgrade" },
    secondaryAction: { label: tr("Not Now"), action: "dismiss" },
  },
  PLAN_LIMIT_REACHED: {
    title: tr("Plan Limit Reached"),
    message: tr("You have reached your plan limit of {max} {limit}. Upgrade your subscription to add more."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Increase Limit"), action: "upgrade" },
    secondaryAction: { label: tr("Cancel"), action: "dismiss" },
  },
  ROLE_NOT_IN_PLAN: {
    title: tr("Role Not Permitted"),
    message: tr("The '{role}' staff role is not available under your current plan tier."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Upgrade Plan"), action: "upgrade" },
  },

  // Billing
  BILLING_PAYMENT_PENDING: {
    title: tr("Payment Verification In Progress"),
    message: tr("Your payment reference has been submitted and is currently being verified by our accounts team."),
    severity: "info",
    presentation: "modal",
    primaryAction: { label: tr("Check Invoices"), action: "invoices" },
  },
  BILLING_PAYMENT_FAILED: {
    title: tr("Payment Could Not Be Processed"),
    message: tr("The transaction was declined by the payment provider. Your card was not charged."),
    severity: "danger",
    presentation: "modal",
    primaryAction: { label: tr("Try Different Card"), action: "retry" },
    secondaryAction: { label: tr("Contact Bank"), action: "dismiss" },
  },
  BILLING_DUPLICATE_PAYMENT_REF: {
    title: tr("Duplicate Payment Reference"),
    message: tr("This payment reference code was already confirmed. You were not charged twice."),
    severity: "info",
    presentation: "modal",
    primaryAction: { label: tr("View Invoices"), action: "invoices" },
  },
  BILLING_SEATS_SOLD_OUT: {
    title: tr("Offer Sold Out"),
    message: tr("This subscription option is no longer available. Please choose a monthly or yearly plan."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Choose Another Plan"), action: "plans" },
  },
  BILLING_COUPON_INVALID: {
    title: tr("Coupon Not Applied"),
    message: tr("The promo code entered is either invalid, expired, or has reached its redemption limit."),
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: tr("Re-enter Code"), action: "retry" },
  },
  BILLING_DOWNGRADE_DISALLOWED: {
    title: tr("Downgrade Restricted"),
    message: tr("Downgrading is restricted while active usage exceeds the limits of the target tier."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Contact Support"), action: "support" },
  },
  BILLING_REFUND_WINDOW_CLOSED: {
    title: tr("Refund Window Expired"),
    message: tr("This transaction is past the allowable refund window and cannot be refunded automatically."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Close"), action: "dismiss" },
  },
  BILLING_INVOICE_NOT_FOUND: {
    title: tr("Invoice Not Found"),
    message: tr("The requested billing invoice record could not be found."),
    severity: "warning",
    presentation: "toast",
  },

  // Front Desk Check-in
  CHECKIN_MEMBER_BLOCKED: {
    title: tr("Member Blocked"),
    message: tr("This member account is flagged as blocked. Access through the turnstile is restricted."),
    severity: "danger",
    presentation: "modal",
    primaryAction: { label: tr("View Member Details"), action: "view_member" },
    secondaryAction: { label: tr("Dismiss"), action: "dismiss" },
  },
  CHECKIN_MEMBERSHIP_EXPIRED: {
    title: tr("Membership Expired"),
    message: tr("This member's subscription package has expired."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Renew Package"), action: "renew_package" },
    secondaryAction: { label: tr("Dismiss"), action: "dismiss" },
  },
  CHECKIN_NO_SESSIONS_LEFT: {
    title: tr("No Remaining Sessions"),
    message: tr("Member has zero remaining sessions available on this package."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Add Sessions"), action: "add_sessions" },
  },
  CHECKIN_UNKNOWN_BARCODE: {
    title: tr("Barcode Unrecognized"),
    message: tr("No gym member was found matching the scanned barcode '{barcode}'."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Search by Phone or Name"), action: "search_member" },
    secondaryAction: { label: tr("Scan Again"), action: "retry_scan" },
  },
  CHECKIN_SCANNER_PERMISSION: {
    title: tr("Camera Access Required"),
    message: tr("Camera permissions were denied in your browser. Please allow camera access in browser settings."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Grant Permission"), action: "request_camera" },
  },

  // Data & Conflict
  VALIDATION_FAILED: {
    title: tr("Validation Error"),
    message: tr("Please review the highlighted fields below and provide valid information."),
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: tr("Correct Fields"), action: "focus_first" },
  },
  CONFLICT_DUPLICATE: {
    title: tr("Duplicate Information"),
    message: tr("A record with this {field} already exists in the system."),
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: tr("Review Value"), action: "retry" },
  },
  WHATSAPP_NOT_CONNECTED: {
    title: tr("WhatsApp Not Connected"),
    message: tr("Connect WhatsApp before sending. Open Connect WhatsApp from your profile menu."),
    severity: "warning",
    presentation: "toast",
    primaryAction: { label: tr("Connect WhatsApp"), action: "retry" },
  },
  WHATSAPP_NOT_ON_WHATSAPP: {
    title: tr("Not on WhatsApp"),
    message: tr("This phone number is not registered on WhatsApp."),
    severity: "warning",
    presentation: "toast",
    primaryAction: { label: tr("Check Number"), action: "dismiss" },
  },
  INBOX_CHANNEL_NOT_CONNECTED: {
    title: tr("Channel Not Connected"),
    message: tr("This inbox channel is not connected. Reconnect it from Connect Channels."),
    severity: "warning",
    presentation: "toast",
    primaryAction: { label: tr("Reconnect"), action: "dismiss" },
  },
  RESOURCE_NOT_FOUND: {
    title: tr("Record Not Found"),
    message: tr("The record you requested may have been deleted or moved."),
    severity: "warning",
    presentation: "toast",
    primaryAction: { label: tr("Back to List"), action: "back" },
  },
  VERSION_CONFLICT: {
    title: tr("Conflicting Changes Detected"),
    message: tr("Another team member updated this record while you were editing. Reload to see the latest changes."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Reload Latest Data"), action: "reload" },
    secondaryAction: { label: tr("Keep Editing"), action: "dismiss" },
  },
  CANNOT_DELETE_IN_USE: {
    title: tr("Cannot Delete Item"),
    message: tr("This item cannot be deleted because active records depend on it."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Understood"), action: "dismiss" },
  },
  INVALID_ID: {
    title: tr("Invalid Identifier"),
    message: tr("The format of the link or record identifier is invalid."),
    severity: "warning",
    presentation: "toast",
  },

  // Files & Imports
  UPLOAD_FILE_TOO_LARGE: {
    title: tr("File Exceeds Size Limit"),
    message: tr("The file is larger than the allowed upload size."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Choose Smaller File"), action: "retry" },
  },
  UPLOAD_INVALID_TYPE: {
    title: tr("Unsupported File Format"),
    message: tr("This file format is not accepted. Please select a valid JPG, PNG, PDF, or Excel document."),
    severity: "warning",
    presentation: "toast",
  },
  UPLOAD_MAGIC_MISMATCH: {
    title: tr("File Verification Failed"),
    message: tr("The file contents did not match the file extension. Please upload an authentic, uncorrupted file."),
    severity: "danger",
    presentation: "modal",
    primaryAction: { label: tr("Select New File"), action: "retry" },
  },
  STORAGE_UNAVAILABLE: {
    title: tr("Storage Temporarily Unavailable"),
    message: tr("Unable to reach file storage at this moment. Your file was not saved."),
    severity: "danger",
    presentation: "toast",
    primaryAction: { label: tr("Retry Upload"), action: "retry" },
  },
  IMPORT_ROW_ERRORS: {
    title: tr("Import Finished with Errors"),
    message: tr("{errorCount} of {totalCount} rows could not be imported due to formatting or duplicate issues."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Download Failed Rows (CSV)"), action: "download_failed_csv" },
    secondaryAction: { label: tr("Close"), action: "dismiss" },
  },

  // Platform Console Operations
  PLATFORM_REASON_REQUIRED: {
    title: tr("Reason Required"),
    message: tr("Platform operations require a clear, mandatory reason for the audit trail."),
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: tr("Provide Reason"), action: "focus_reason" },
  },
  IMPERSONATION_EXPIRED: {
    title: tr("Support Impersonation Expired"),
    message: tr("Your support impersonation session has expired. Return to the platform console to re-authorize."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Back to Platform"), action: "exit_impersonation" },
  },
  IMPERSONATION_READ_ONLY: {
    title: tr("Read-Only Impersonation Active"),
    message: tr("You are currently browsing under a read-only support session. Data modifications are blocked."),
    severity: "info",
    presentation: "modal",
    primaryAction: { label: tr("Understood"), action: "dismiss" },
  },
  LAST_SUPERADMIN_PROTECTED: {
    title: tr("Action Prohibited"),
    message: tr("You cannot delete, suspend, or demote the last remaining super administrator account."),
    severity: "danger",
    presentation: "modal",
    primaryAction: { label: tr("Understood"), action: "dismiss" },
  },
  CONFIRMATION_SLUG_MISMATCH: {
    title: tr("Confirmation Mismatch"),
    message: tr("The typed confirmation text did not match the target gym slug '{expectedSlug}'."),
    severity: "warning",
    presentation: "inline",
    primaryAction: { label: tr("Re-type Slug"), action: "retry" },
  },
  PURGE_RETENTION_BLOCKED: {
    title: tr("Data Retention Block"),
    message: tr("This gym account cannot be purged because it is still within the mandatory data retention window."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Close"), action: "dismiss" },
  },

  // System & Network
  RATE_LIMITED: {
    title: tr("Rate Limit Exceeded"),
    message: tr("You have made too many requests in a short time. Please wait for the cooldown timer."),
    severity: "warning",
    presentation: "modal",
    primaryAction: { label: tr("Wait for Cooldown"), action: "wait" },
  },
  NETWORK_OFFLINE: {
    title: tr("You Are Offline"),
    message: tr("Unable to reach the server. Please check your internet connection."),
    severity: "warning",
    presentation: "banner",
    primaryAction: { label: tr("Retry Connection"), action: "retry" },
  },
  REQUEST_TIMEOUT: {
    title: tr("Request Timed Out"),
    message: tr("The server took too long to answer. Your connection may be slow or interrupted."),
    severity: "warning",
    presentation: "toast",
    primaryAction: { label: tr("Try Again"), action: "retry" },
  },
  UPSTREAM_UNAVAILABLE: {
    title: tr("External Service Unavailable"),
    message: tr("A third-party service ({serviceName}) is temporarily unavailable. Please try again shortly."),
    severity: "warning",
    presentation: "toast",
    primaryAction: { label: tr("Retry"), action: "retry" },
  },
  ROUTE_NOT_FOUND: {
    title: tr("Page or Resource Not Found"),
    message: tr("The requested page or API endpoint does not exist."),
    severity: "warning",
    presentation: "toast",
  },
  INVALID_JSON: {
    title: tr("Invalid Request Format"),
    message: tr("The data sent to the server was not properly formatted."),
    severity: "danger",
    presentation: "toast",
  },
  INTERNAL_ERROR: {
    title: tr("Something Went Wrong"),
    message: tr("An unexpected error occurred on our end. Our team has been notified."),
    severity: "critical",
    presentation: "modal",
    primaryAction: { label: tr("Try Again"), action: "retry" },
    secondaryAction: { label: tr("Copy Details"), action: "copy_details" },
  },
};

/**
 * Format error message with placeholder replacement from details
 */
export function formatErrorMessage(code, details = {}, fallbackMessage = null) {
  const item = ERROR_MESSAGES[code] || ERROR_MESSAGES.INTERNAL_ERROR;
  let text = tActive(fallbackMessage || item.message);

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
