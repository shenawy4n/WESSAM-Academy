/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceError } from './errors/serviceError';

const SERVICE = 'safeDownload';

/**
 * Validates that a download or signed storage URL uses a safe transport scheme
 * (HTTPS, or localhost HTTP strictly for local Supabase dev environments) and
 * carries no embedded URL credentials.
 */
export function validateDownloadUrl(rawUrl: string | null | undefined): string {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!trimmed) {
    throw new ServiceError({
      category: 'NOT_FOUND',
      message: 'Download URL is missing or expired.',
      service: SERVICE,
      operation: 'validateDownloadUrl',
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ServiceError({
      category: 'VALIDATION_ERROR',
      message: 'Invalid download URL format.',
      service: SERVICE,
      operation: 'validateDownloadUrl',
    });
  }

  const isLocalHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

  if (parsed.protocol !== 'https:' && !isLocalHttp) {
    throw new ServiceError({
      category: 'VALIDATION_ERROR',
      message: `Unsafe download URL protocol rejected: ${parsed.protocol}`,
      service: SERVICE,
      operation: 'validateDownloadUrl',
    });
  }

  if (parsed.username || parsed.password) {
    throw new ServiceError({
      category: 'VALIDATION_ERROR',
      message: 'Download URLs containing embedded credentials are not allowed.',
      service: SERVICE,
      operation: 'validateDownloadUrl',
    });
  }

  return parsed.toString();
}

/**
 * Sanitizes a user-facing resource title into a safe download filename and
 * appends a known file extension if missing.
 */
export function sanitizeDownloadFileName(
  title?: string | null,
  fileType?: string | null
): string | undefined {
  if (!title || typeof title !== 'string') return undefined;

  const withoutControlChars = Array.from(title)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : ch;
    })
    .join('');

  const cleaned = withoutControlChars
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return undefined;

  const cleanExt =
    typeof fileType === 'string'
      ? fileType.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      : '';

  if (cleanExt && !cleaned.toLowerCase().endsWith(`.${cleanExt}`)) {
    return `${cleaned}.${cleanExt}`;
  }

  return cleaned;
}

/**
 * Iframe-safe resource download/open trigger using a temporary anchor element
 * instead of window.open(), matching the academy's attachment download pattern.
 */
export function triggerSafeResourceDownload(
  url: string,
  options?: {
    fileName?: string | null;
    fileType?: string | null;
  }
): string {
  const safeUrl = validateDownloadUrl(url);

  if (typeof document === 'undefined') {
    return safeUrl;
  }

  const suggestedName = sanitizeDownloadFileName(options?.fileName, options?.fileType);
  const link = document.createElement('a');
  link.href = safeUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  if (suggestedName) {
    link.download = suggestedName;
  }

  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }

  return safeUrl;
}

/**
 * Opens an external URL or signed resource link in a new tab using a temporary
 * anchor element instead of window.open(), avoiding sandboxed iframe popup blocks.
 */
export function openSafeExternalUrl(url: string): string {
  const safeUrl = validateDownloadUrl(url);

  if (typeof document === 'undefined') {
    return safeUrl;
  }

  const link = document.createElement('a');
  link.href = safeUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }

  return safeUrl;
}
