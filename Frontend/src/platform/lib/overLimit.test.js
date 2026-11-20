import { describe, it, expect, vi } from 'vitest';
import { sendWithOverLimitConfirm, OVER_LIMIT_CODE } from './overLimit';

const overLimitError = {
  code: OVER_LIMIT_CODE,
  details: { overages: [{ limit: 'maxStaff', noun: 'staff accounts', current: 21, max: 15, excess: 6 }] },
};

describe('sendWithOverLimitConfirm', () => {
  it('sends once when the change fits the plan', async () => {
    const send = vi.fn().mockResolvedValue({});
    const confirm = vi.fn();
    await expect(sendWithOverLimitConfirm(send, confirm)).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('resends with force after the operator confirms', async () => {
    const send = vi.fn().mockRejectedValueOnce(overLimitError).mockResolvedValueOnce({});
    const confirm = vi.fn().mockReturnValue(true);
    await expect(sendWithOverLimitConfirm(send, confirm)).resolves.toBe(true);
    expect(confirm.mock.calls[0][0]).toContain('21 staff accounts, new limit 15 (6 over)');
    expect(send).toHaveBeenLastCalledWith(true);
  });

  it('stops when the operator declines', async () => {
    const send = vi.fn().mockRejectedValueOnce(overLimitError);
    await expect(sendWithOverLimitConfirm(send, () => false)).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rethrows unrelated errors', async () => {
    const send = vi.fn().mockRejectedValue({ code: 'TENANT_NOT_FOUND' });
    await expect(sendWithOverLimitConfirm(send, () => true)).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
  });
});
