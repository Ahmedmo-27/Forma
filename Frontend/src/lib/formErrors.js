/**
 * Form Error Helper
 * Maps backend fieldErrors onto component form state,
 * extracts first error message per field, and handles summary rendering.
 */

export function mapFieldErrors(backendFieldErrors = {}) {
  const result = {};
  if (!backendFieldErrors || typeof backendFieldErrors !== "object") {
    return result;
  }

  for (const [key, value] of Object.entries(backendFieldErrors)) {
    if (Array.isArray(value) && value.length > 0) {
      result[key] = value[0];
    } else if (typeof value === "string") {
      result[key] = value;
    }
  }

  return result;
}

export function getFirstFieldErrorMessage(fieldErrors = {}) {
  const mapped = mapFieldErrors(fieldErrors);
  const keys = Object.keys(mapped);
  return keys.length > 0 ? mapped[keys[0]] : null;
}

export function focusFirstInvalidField(fieldErrors = {}) {
  const keys = Object.keys(fieldErrors || {});
  if (keys.length === 0) return;

  for (const key of keys) {
    const el =
      document.querySelector(`[name="${key}"]`) ||
      document.querySelector(`[id="${key}"]`) ||
      document.querySelector(`input[name*="${key}"]`);
    if (el && typeof el.focus === "function") {
      el.focus();
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      break;
    }
  }
}
