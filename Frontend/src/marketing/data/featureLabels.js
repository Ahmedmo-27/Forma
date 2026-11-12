/** Human labels for plan feature keys (mirrors platform Feature catalog). */
export const FEATURE_LABELS = {
  members: "Members management",
  checkin: "Access & check-in",
  packages: "Packages & subscriptions",
  pt_tracking: "Personal training (PT)",
  audit: "Audit trail",
  accounting: "Ledger & accounting",
  exception_approvals: "Exception approvals",
  sales_crm: "Sales pipeline & CRM",
  whatsapp: "WhatsApp automation",
  excel_import: "Excel import & export",
  exec_analytics: "Executive analytics",
  funnels: "Sales conversion funnels",
  business_intelligence: "Business intelligence",
  multi_branches: "Multi-branch locations",
};

export function labelFeature(key) {
  if (!key) return "";
  if (FEATURE_LABELS[key]) return FEATURE_LABELS[key];
  return String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
