import { useEffect, useRef, useState } from 'react';
import { Input } from './ui';
import { checkUsernameAvailable } from '../api/endpoints';
import { useI18n } from '../i18n/useI18n';

const USERNAME_RE = /^[a-z0-9._]+$/;

export function normalizeUsernameInput(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateUsernameClient(value, t) {
  const username = normalizeUsernameInput(value);
  if (!username) return null;
  if (username.length < 3 || username.length > 30) {
    return t('Username must be 3–30 characters');
  }
  if (!USERNAME_RE.test(username)) {
    return t('Use letters, numbers, periods, and underscores only');
  }
  if (username.startsWith('.') || username.endsWith('.')) {
    return t('Username cannot start or end with a period');
  }
  if (username.includes('..')) {
    return t('Username cannot contain consecutive periods');
  }
  return null;
}

/**
 * Instagram-style username input with live availability check.
 * Leave blank to let the server auto-generate (when optional).
 */
export default function UsernameField({
  value,
  onChange,
  error,
  required = false,
  optionalHint = true,
  currentUsername = '',
  disabled = false,
  label,
  onAvailabilityChange,
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState('idle'); // idle | checking | available | taken | invalid
  const [serverMessage, setServerMessage] = useState('');
  const requestId = useRef(0);

  const publishStatus = (next) => {
    setStatus(next);
    onAvailabilityChange?.(next);
  };

  useEffect(() => {
    const username = normalizeUsernameInput(value);
    const own = normalizeUsernameInput(currentUsername);

    if (!username) {
      publishStatus('idle');
      setServerMessage('');
      return undefined;
    }

    const localError = validateUsernameClient(username, t);
    if (localError) {
      publishStatus('invalid');
      setServerMessage(localError);
      return undefined;
    }

    if (own && username === own) {
      publishStatus('available');
      setServerMessage(t('This is your current username'));
      return undefined;
    }

    const id = ++requestId.current;
    publishStatus('checking');
    setServerMessage(t('Checking availability…'));

    const timer = setTimeout(() => {
      checkUsernameAvailable(username)
        .then((res) => {
          if (requestId.current !== id) return;
          if (res.data?.available) {
            publishStatus('available');
            setServerMessage(t('Username is available'));
          } else {
            publishStatus(res.data?.reason === 'invalid' ? 'invalid' : 'taken');
            setServerMessage(res.data?.message || t('This username is already taken'));
          }
        })
        .catch(() => {
          if (requestId.current !== id) return;
          publishStatus('idle');
          setServerMessage('');
        });
    }, 350);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publish via latest callback
  }, [value, currentUsername, t]);

  const hintColor =
    status === 'available' ? 'var(--green, #16a34a)'
      : status === 'taken' || status === 'invalid' ? 'var(--red)'
        : 'var(--t4)';

  const showHint = serverMessage || (optionalHint && !required && !value);
  const hintText = serverMessage
    || (optionalHint && !required && !value
      ? t('Leave blank to auto-generate from the name')
      : '');

  return (
    <div>
      <Input
        label={label || (required ? t('Username *') : t('Username'))}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\s/g, '').toLowerCase())}
        error={error}
        disabled={disabled}
        placeholder={t('e.g. ahmed.hassan')}
        dir="ltr"
        autoComplete="username"
      />
      {showHint && !error && (
        <p style={{ fontSize: 11, color: hintColor, marginTop: 4, marginBottom: 0 }}>
          {hintText}
        </p>
      )}
    </div>
  );
}

export function usernameFieldBlocksSubmit(value, { required = false, status } = {}) {
  const username = normalizeUsernameInput(value);
  if (!username) return Boolean(required);
  if (status === 'taken' || status === 'invalid' || status === 'checking') return true;
  return false;
}
