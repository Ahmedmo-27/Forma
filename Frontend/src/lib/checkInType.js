export const CHECKIN_TYPE_REQUIRED = 'CHECKIN_TYPE_REQUIRED';

/** True when the server wants the desk to ask which active package / PT the member is attending. */
export function isCheckInTypeRequired(err) {
  return err?.response?.status === 409 && err?.response?.data?.code === CHECKIN_TYPE_REQUIRED;
}
