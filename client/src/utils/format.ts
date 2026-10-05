/**
 * Formatting helpers.
 *
 * Indian numbering is used throughout (1,23,456.78) rather than the Western
 * 1,234,567.78, and all currency goes through `Intl` with `en-IN`.
 */

// ---------------------------------------------------------------- currency

export function formatCurrency(amount: number, currency = 'INR'): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Compact Indian form: ₹1.25 Cr / ₹4.30 L / ₹45,000. */
export function formatCompactCurrency(amount: number, currency = 'INR'): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  const units: Array<[number, string]> = [
    [1e7, ' Cr'],
    [1e5, ' L'],
    [1e3, 'K'],
  ];

  for (const [divisor, suffix] of units) {
    if (abs >= divisor) {
      const scaled = abs / divisor;
      return `${sign}₹${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(2).replace(/\.00$/, '')}${suffix}`;
    }
  }
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatNumber(amount: number, decimals = 2): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** 1250000 -> "12,50,000" (plain Indian grouping, no symbol). */
export function formatIndianNumber(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN').format(value);
}

/** Masks a PAN-like identifier: ABCDE1234F -> ABCDE****F */
export function maskIdentifier(value?: string | null, visibleStart = 5, visibleEnd = 1): string {
  if (!value) return '—';
  if (value.length <= visibleStart + visibleEnd) return value;
  return `${value.slice(0, visibleStart)}${'•'.repeat(Math.max(3, value.length - visibleStart - visibleEnd))}${value.slice(-visibleEnd)}`;
}

export function maskAccountNumber(accountNumber?: string | null): string {
  if (!accountNumber) return '—';
  if (accountNumber.length <= 4) return accountNumber;
  return `•••• ${accountNumber.slice(-4)}`;
}

// ------------------------------------------------------------------ dates

const safeDate = (date: string | Date | null | undefined): Date | null => {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return Number.isNaN(d.getTime()) ? null : d;
};

export function formatDate(date: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const d = safeDate(date);
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(d);
}

export function formatDateTime(date: string | Date | null | undefined): string {
  const d = safeDate(date);
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function formatTime(date: string | Date | null | undefined): string {
  const d = safeDate(date);
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
  const d = safeDate(date);
  if (!d) return '—';

  const diffMs = Date.now() - d.getTime();
  const future = diffMs < 0;
  const secs = Math.floor(Math.abs(diffMs) / 1000);

  const phrase = (n: number, unit: string) => (future ? `in ${n}${unit}` : `${n}${unit} ago`);

  if (secs < 45) return future ? 'in a moment' : 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return phrase(mins, 'm');
  const hours = Math.floor(mins / 60);
  if (hours < 24) return phrase(hours, 'h');
  const days = Math.floor(hours / 24);
  if (days < 7) return phrase(days, 'd');
  return formatDate(d);
}

// ------------------------------------------------------------ transactions

const TYPE_COLORS: Record<string, string> = {
  DEPOSIT: 'text-success-700 bg-success-50 border-success-100',
  OPENING_DEPOSIT: 'text-success-700 bg-success-50 border-success-100',
  WITHDRAWAL: 'text-danger-700 bg-danger-50 border-danger-100',
  TRANSFER_IN: 'text-primary-600 bg-primary-50 border-primary-100',
  TRANSFER_OUT: 'text-brass-700 bg-brass-50 border-brass-100',
  LOAN_DISBURSEMENT: 'text-primary-700 bg-primary-50 border-primary-100',
  LOAN_REPAYMENT: 'text-primary-600 bg-primary-50 border-primary-100',
  INTEREST: 'text-success-700 bg-success-50 border-success-100',
  BALANCE_ADJUSTMENT: 'text-muted bg-paper border-border',
};

export function getTransactionTypeColor(type: string): string {
  return TYPE_COLORS[type] || 'text-muted bg-paper border-border';
}

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Deposit',
  OPENING_DEPOSIT: 'Opening deposit',
  WITHDRAWAL: 'Withdrawal',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
  LOAN_DISBURSEMENT: 'Loan disbursed',
  LOAN_REPAYMENT: 'Loan repayment',
  INTEREST: 'Interest',
  BALANCE_ADJUSTMENT: 'Adjustment',
  FEE: 'Fee',
  REFUND: 'Refund',
};

export function getTransactionTypeLabel(type: string): string {
  return TRANSACTION_TYPE_LABELS[type] || type.replace(/_/g, ' ');
}

/** + for money in, − for money out. */
export function isCredit(type: string): boolean {
  return ['DEPOSIT', 'OPENING_DEPOSIT', 'TRANSFER_IN', 'LOAN_DISBURSEMENT', 'INTEREST', 'REFUND'].includes(
    type
  );
}

// ---------------------------------------------------------------- strings

export function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export function maskAccountNumberLabel(value?: string | null): string {
  return maskAccountNumber(value);
}

export function initials(first?: string, last?: string): string {
  const a = (first || '').trim().charAt(0);
  const b = (last || '').trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}

export function fullName(person?: { firstName?: string; lastName?: string } | null): string {
  if (!person) return '—';
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || '—';
}

// -------------------------------------------------------------- validation

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
  return /^[\+]?[1-9][\d]{0,15}$/.test(phone);
}

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Password must be at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must contain at least one special character');
  return { valid: errors.length === 0, errors };
}

// ------------------------------------------------------------------ export

/** Builds a CSV string and triggers a browser download. */
export function downloadCSV(
  filename: string,
  rows: Array<Record<string, unknown>>
): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');

  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateReference(prefix: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${timestamp}${random}`;
}
