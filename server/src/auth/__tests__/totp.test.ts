import { describe, it, expect } from 'vitest';
import { generateTotpSecret, generateTotp, verifyTotp, formatSecretForDisplay } from '../totp.js';

describe('TOTP (RFC 6238)', () => {
  it('генерирует base32-секрет без посторонних символов', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThan(0);
  });

  it('verifyTotp принимает код, сгенерированный для того же момента времени', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = generateTotp(secret, now);
    expect(verifyTotp(secret, code, 1, now)).toBe(true);
  });

  it('verifyTotp отбивает код от другого секрета', () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const now = Date.now();
    const code = generateTotp(secretA, now);
    expect(verifyTotp(secretB, code, 1, now)).toBe(false);
  });

  it('verifyTotp допускает дрейф на 1 шаг (±30с), но не на 2', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const codeNextStep = generateTotp(secret, now + 30_000);
    expect(verifyTotp(secret, codeNextStep, 1, now)).toBe(true);
    const codeTwoStepsAhead = generateTotp(secret, now + 60_000);
    expect(verifyTotp(secret, codeTwoStepsAhead, 1, now)).toBe(false);
  });

  it('verifyTotp отбивает нечисловой/неправильной длины код', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    expect(verifyTotp(secret, '12345')).toBe(false);
  });

  it('formatSecretForDisplay группирует по 4 символа', () => {
    expect(formatSecretForDisplay('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
  });
});
