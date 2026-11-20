export const CHECKIN_TYPE_REQUIRED = 'CHECKIN_TYPE_REQUIRED';

/** True when the server wants the desk to ask the member what they are attending (gym or PT). */
export function isCheckInTypeRequired(err) {
  return err?.response?.status === 409 && err?.response?.data?.code === CHECKIN_TYPE_REQUIRED;
}
