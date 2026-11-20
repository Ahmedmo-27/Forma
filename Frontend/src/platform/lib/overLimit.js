export const OVER_LIMIT_CODE = "PLAN_DOWNGRADE_OVER_LIMIT";

export function describeOverages(overages = []) {
  return overages
    .map((o) => `• ${o.current} ${o.noun}, new limit ${o.max} (${o.excess} over)`)
    .join("\n");
}

/**
 * Runs `send(force)`. If the backend says the change leaves the gym over its caps,
 * asks the operator to confirm and resends with force. Returns false when declined.
 */
export async function sendWithOverLimitConfirm(send, confirmFn = window.confirm.bind(window)) {
  try {
    await send(false);
    return true;
  } catch (err) {
    if (err?.code !== OVER_LIMIT_CODE) throw err;
    const lines = describeOverages(err.details?.overages);
    const ok = confirmFn(
      `This change leaves the gym over its plan limits:\n${lines}\n\n` +
        "Nothing is deleted. The gym can't add more until usage is back under the cap. Apply anyway?"
    );
    if (!ok) return false;
    await send(true);
    return true;
  }
}
