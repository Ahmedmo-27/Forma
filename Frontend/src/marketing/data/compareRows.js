/** Category comparison: template ERP gym tools vs Forma (no competitor names). */

const EN = [
  {
    theme: "Product DNA",
    them: "One ERP template stretched across restaurants, retail, warehouses, and gyms.",
    forma: "Purpose-built gym operating system — modern platform made for the floor.",
  },
  {
    theme: "Blast radius",
    them: "A vulnerability or bug in the shared template can affect every vertical on that platform — even if it started in a restaurant module.",
    forma: "Gym-focused surface — your product risk is not tied to unrelated industry modules.",
  },
  {
    theme: "Data boundaries",
    them: "Multi-industry tenancy patterns increase confusion and leakage risk when isolation is weak.",
    forma: "Gym workspaces with role-aware access and tenant-scoped operations.",
  },
  {
    theme: "Downtime",
    them: "Shared template incidents take unrelated businesses down together.",
    forma: "Platform owned for gym operators — releases and ops aimed at your workflows.",
  },
  {
    theme: "Fit to the floor",
    them: "Generic ERP screens forced into memberships and check-in.",
    forma: "Members, packages, check-in, sales, coaching, and billing in one gym-native workspace.",
  },
  {
    theme: "Roadmap",
    them: "Your needs wait behind unrelated ERP modules.",
    forma: "Roadmap driven by gym operators — not POS-for-restaurants.",
  },
  {
    theme: "Launch",
    them: "Self-serve dump into a dashboard.",
    forma: "Sales-assisted launch with deliberate bank-transfer activation.",
  },
];

const AR = [
  {
    theme: "هوية المنتج",
    them: "قالب ERP واحد ممدود على مطاعم وتجزئة ومستودعات وجيمات.",
    forma: "نظام تشغيل جيم غرضي — منصة حديثة مصمّمة لأرض الصالة.",
  },
  {
    theme: "نطاق الضرر",
    them: "ثغرة أو خطأ في القالب المشترك قد يصيب كل القطاعات على المنصة — حتى لو بدأ في وحدة مطاعم.",
    forma: "سطح مركّز على الجيم — مخاطرك ليست مربوطة بوحدات صناعات أخرى.",
  },
  {
    theme: "حدود البيانات",
    them: "أنماط تعدد الصناعات تزيد الالتباس وخطر التسريب عند ضعف العزل.",
    forma: "مساحات عمل جيم بصلاحيات حسب الدور وعمليات محدودة بالمستأجر.",
  },
  {
    theme: "التوقف",
    them: "حوادث القالب المشترك تُسقط أعمالًا غير مرتبطة معًا.",
    forma: "منصة مملوكة لمشغّلي الجيم — إصدارات وتشغيل موجّهة لسير عملك.",
  },
  {
    theme: "ملاءمة الأرض",
    them: "شاشات ERP عامة تُفرض على العضويات والحضور.",
    forma: "أعضاء وباقات وحضور ومبيعات وتدريب وفوترة في مساحة أصيلة للجيم.",
  },
  {
    theme: "خارطة الطريق",
    them: "احتياجاتك تنتظر خلف وحدات ERP غير ذات صلة.",
    forma: "خارطة طريق يقودها مشغّلو الجيم — لا نقاط بيع للمطاعم.",
  },
  {
    theme: "الإطلاق",
    them: "رمي خدمة ذاتية داخل لوحة.",
    forma: "إطلاق بمساعدة المبيعات وتفعيل متعمّد بتحويل بنكي.",
  },
];

/** @deprecated use compareRowsFor(locale) */
export const COMPARE_ROWS = EN;

export function compareRowsFor(locale = "en") {
  return locale === "ar" ? AR : EN;
}
