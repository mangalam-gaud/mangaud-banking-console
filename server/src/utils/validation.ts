/**
 * Shared validators used by both the User and Customer schemas.
 *
 * Kept in one place because these two documents mirror each other's identity
 * fields, and a regex that drifts between them produces records that pass
 * validation on write but fail it on update.
 */

/**
 * E.164-ish, but tolerant of how people actually type a number.
 *
 * The previous pattern was `/^[\+]?[1-9][\d]{0,15}$/`, which rejected
 * "+91 98765 43210" and "98765-43210" -- the two formats most Indian users
 * type. Spaces, dashes, dots and parentheses are stripped before matching, so
 * a stored number is always digits with an optional leading `+`.
 */
const PHONE_PATTERN = /^\+?[1-9]\d{6,14}$/;

export const normalisePhone = (phone: string): string => phone.replace(/[\s\-().]/g, '');

export const isValidPhone = (phone: string): boolean => PHONE_PATTERN.test(normalisePhone(phone));

export const phoneMessage = 'Please provide a valid phone number (e.g. +919876543210)';

/** Masks all but the last 4 digits, for display. */
export const maskPhone = (phone: string): string => {
  const clean = normalisePhone(phone);
  return clean.length <= 4 ? clean : `${'•'.repeat(clean.length - 4)}${clean.slice(-4)}`;
};
