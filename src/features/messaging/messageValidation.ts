/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const MESSAGE_STORAGE_BUCKET = 'message-attachments';
export const MAX_MESSAGE_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_MESSAGE_BODY_LENGTH = 5000;

export const ALLOWED_MESSAGE_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'zip',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'mp3',
  'wav',
  'm4a',
  'txt',
] as const;

export const ALLOWED_MESSAGE_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-m4a',
  'audio/mp4',
  'text/plain',
] as const;

const DANGEROUS_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'com',
  'msi',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'js',
  'mjs',
  'cjs',
  'ts',
  'jsx',
  'tsx',
  'html',
  'htm',
  'xhtml',
  'svg',
  'xml',
  'php',
  'py',
  'rb',
  'pl',
  'jar',
  'dll',
  'so',
  'scr',
  'vbs',
  'vbe',
  'wsf',
  'hta',
]);

const DANGEROUS_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
  'application/x-msdownload',
  'application/x-dosexec',
  'application/x-sh',
  'application/x-shellscript',
  'application/x-executable',
  'text/xml',
  'application/xml',
]);

const EXTENSION_TO_DEFAULT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  txt: 'text/plain',
};

const EXTENSION_COMPATIBLE_MIMES: Record<string, Set<string>> = {
  pdf: new Set(['application/pdf']),
  doc: new Set(['application/msword']),
  docx: new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip']),
  xls: new Set(['application/vnd.ms-excel']),
  xlsx: new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip']),
  ppt: new Set(['application/vnd.ms-powerpoint']),
  pptx: new Set(['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip']),
  zip: new Set(['application/zip', 'application/x-zip-compressed']),
  jpg: new Set(['image/jpeg']),
  jpeg: new Set(['image/jpeg']),
  png: new Set(['image/png']),
  webp: new Set(['image/webp']),
  mp3: new Set(['audio/mpeg', 'audio/mp3']),
  wav: new Set(['audio/wav']),
  m4a: new Set(['audio/x-m4a', 'audio/mp4']),
  txt: new Set(['text/plain']),
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function extractFileExtension(fileName: string): string {
  const base = fileName.trim().split(/[/\\]/).pop() || '';
  const lastDot = base.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === base.length - 1) {
    return '';
  }
  return base.slice(lastDot + 1).toLowerCase();
}

export function sanitizeStorageFileName(fileName: string): string {
  const baseName = fileName.trim().split(/[/\\]/).pop() || 'attachment';
  const ext = extractFileExtension(baseName);
  const stemRaw = ext ? baseName.slice(0, -(ext.length + 1)) : baseName;
  const cleanStem = stemRaw
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'file';

  return ext ? `${cleanStem}.${ext}` : cleanStem;
}

export function inspectMagicBytes(headerBytes: Uint8Array, ext: string): { valid: boolean; reason?: string } {
  if (!headerBytes || headerBytes.length === 0) {
    return { valid: true };
  }

  // Reject HTML / SVG / script content disguised under benign extensions (e.g. .txt or .jpg)
  const asciiPrefix = Array.from(headerBytes.slice(0, 64))
    .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : ' '))
    .join('')
    .trimStart()
    .toLowerCase();

  if (
    asciiPrefix.startsWith('<!doctype html') ||
    asciiPrefix.startsWith('<html') ||
    asciiPrefix.startsWith('<script') ||
    asciiPrefix.startsWith('<svg')
  ) {
    return { valid: false, reason: 'Executable HTML/SVG content is not allowed in message attachments.' };
  }

  // Check PE/ELF/Mach-O executable binary headers regardless of extension
  if (
    (headerBytes.length >= 2 && headerBytes[0] === 0x4d && headerBytes[1] === 0x5a) || // MZ (.exe/.dll)
    (headerBytes.length >= 4 &&
      headerBytes[0] === 0x7f &&
      headerBytes[1] === 0x45 &&
      headerBytes[2] === 0x4c &&
      headerBytes[3] === 0x46) // ELF
  ) {
    return { valid: false, reason: 'Executable binary payloads are not permitted.' };
  }

  if (ext === 'pdf' && headerBytes.length >= 4) {
    const sig = String.fromCharCode(headerBytes[0], headerBytes[1], headerBytes[2], headerBytes[3]);
    if (sig !== '%PDF') {
      return { valid: false, reason: 'File header does not match PDF format.' };
    }
  }

  if (ext === 'png' && headerBytes.length >= 4) {
    if (!(headerBytes[0] === 0x89 && headerBytes[1] === 0x50 && headerBytes[2] === 0x4e && headerBytes[3] === 0x47)) {
      return { valid: false, reason: 'File header does not match PNG format.' };
    }
  }

  if ((ext === 'jpg' || ext === 'jpeg') && headerBytes.length >= 3) {
    if (!(headerBytes[0] === 0xff && headerBytes[1] === 0xd8 && headerBytes[2] === 0xff)) {
      return { valid: false, reason: 'File header does not match JPEG format.' };
    }
  }

  return { valid: true };
}

export interface FileValidationResult {
  valid: boolean;
  errorEn?: string;
  errorAr?: string;
  sanitizedName?: string;
  extension?: string;
  mimeType?: string;
}

export function validateMessageAttachment(
  file: { name: string; size: number; type?: string },
  headerBytes?: Uint8Array
): FileValidationResult {
  if (!file || !file.name || !file.name.trim()) {
    return {
      valid: false,
      errorEn: 'Invalid file name.',
      errorAr: 'اسم الملف غير صالح.',
    };
  }

  if (file.name.includes('..')) {
    return {
      valid: false,
      errorEn: 'File name contains unsafe path characters.',
      errorAr: 'اسم الملف يحتوي على أحرف مسار غير مسموح بها.',
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      errorEn: `File "${file.name}" is empty (0 bytes).`,
      errorAr: `الملف "${file.name}" فارغ ولا يمكن إرساله.`,
    };
  }

  if (file.size > MAX_MESSAGE_ATTACHMENT_SIZE_BYTES) {
    return {
      valid: false,
      errorEn: `File "${file.name}" exceeds the 10 MB attachment limit.`,
      errorAr: `حجم الملف "${file.name}" يتجاوز الحد الأقصى المسموح به (10 ميجابايت).`,
    };
  }

  const ext = extractFileExtension(file.name);
  if (!ext || DANGEROUS_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      errorEn: `File type ".${ext || 'unknown'}" is not permitted for security reasons.`,
      errorAr: `نوع الملف ".${ext || 'غير معروف'}" محظور لأسباب أمنية.`,
    };
  }

  if (!ALLOWED_MESSAGE_EXTENSIONS.includes(ext as (typeof ALLOWED_MESSAGE_EXTENSIONS)[number])) {
    return {
      valid: false,
      errorEn: `Unsupported file extension ".${ext}". Allowed: PDF, Word, Excel, PowerPoint, images, audio, TXT, ZIP.`,
      errorAr: `امتداد الملف ".${ext}" غير مدعوم. المسموح: PDF، مستندات Office، الصور، الصوتيات، TXT، ZIP.`,
    };
  }

  const rawMime = (file.type || '').trim().toLowerCase();
  if (rawMime && DANGEROUS_MIME_TYPES.has(rawMime)) {
    return {
      valid: false,
      errorEn: `MIME type "${rawMime}" is blocked for security reasons.`,
      errorAr: `نوع المحتوى "${rawMime}" محظور لأسباب أمنية.`,
    };
  }

  const resolvedMime = rawMime || EXTENSION_TO_DEFAULT_MIME[ext] || '';
  if (!ALLOWED_MESSAGE_MIME_TYPES.includes(resolvedMime as (typeof ALLOWED_MESSAGE_MIME_TYPES)[number])) {
    return {
      valid: false,
      errorEn: `Unsupported file MIME type "${resolvedMime || 'unknown'}".`,
      errorAr: `نوع الملف "${resolvedMime || 'غير معروف'}" غير مسموح به.`,
    };
  }

  const allowedForExt = EXTENSION_COMPATIBLE_MIMES[ext];
  if (allowedForExt && !allowedForExt.has(resolvedMime)) {
    return {
      valid: false,
      errorEn: `File extension ".${ext}" does not match MIME type "${resolvedMime}".`,
      errorAr: `امتداد الملف ".${ext}" لا يتطابق مع نوع المحتوى الفعلي.`,
    };
  }

  if (headerBytes) {
    const signatureCheck = inspectMagicBytes(headerBytes, ext);
    if (!signatureCheck.valid) {
      return {
        valid: false,
        errorEn: signatureCheck.reason || 'File contents failed security verification.',
        errorAr: 'فشل فحص محتوى الملف الأمني؛ تأكد من سلامة وصيغة الملف.',
      };
    }
  }

  return {
    valid: true,
    sanitizedName: sanitizeStorageFileName(file.name),
    extension: ext,
    mimeType: resolvedMime,
  };
}

export function validateMessageDraft(
  body: string,
  attachmentCount: number
): { valid: boolean; errorEn?: string; errorAr?: string } {
  const trimmed = body.trim();
  if (trimmed.length > MAX_MESSAGE_BODY_LENGTH) {
    return {
      valid: false,
      errorEn: `Message exceeds maximum length of ${MAX_MESSAGE_BODY_LENGTH} characters.`,
      errorAr: `تتجاوز الرسالة الحد الأقصى (${MAX_MESSAGE_BODY_LENGTH} حرف).`,
    };
  }
  if (attachmentCount > MAX_ATTACHMENTS_PER_MESSAGE) {
    return {
      valid: false,
      errorEn: `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`,
      errorAr: `الحد الأقصى هو ${MAX_ATTACHMENTS_PER_MESSAGE} مرفقات في الرسالة الواحدة.`,
    };
  }
  if (!trimmed && attachmentCount === 0) {
    return {
      valid: false,
      errorEn: 'Please enter a message or attach a file before sending.',
      errorAr: 'يرجى كتابة رسالة أو إرفاق ملف قبل الإرسال.',
    };
  }
  return { valid: true };
}

export function buildSafeStorageObjectPath(
  conversationId: string,
  uploaderId: string,
  originalFileName: string,
  uniqueToken?: string
): string {
  if (!UUID_REGEX.test(conversationId) || !UUID_REGEX.test(uploaderId)) {
    throw new Error('Invalid conversation or uploader identifier for storage path.');
  }

  const sanitizedName = sanitizeStorageFileName(originalFileName);
  const nonce =
    uniqueToken ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10));

  return `${conversationId}/${uploaderId}/${Date.now()}_${nonce}_${sanitizedName}`;
}

export function isSafeStorageObjectPath(path: string): boolean {
  if (!path || path.includes('..') || path.startsWith('/')) {
    return false;
  }
  const parts = path.split('/');
  return parts.length >= 3 && UUID_REGEX.test(parts[0]) && UUID_REGEX.test(parts[1]) && parts[2].trim().length > 0;
}

export function parseMessageActionUrl(actionUrl: string | null | undefined): string | null {
  if (!actionUrl || typeof actionUrl !== 'string') return null;
  const trimmed = actionUrl.trim();
  if (!trimmed.startsWith('/messages/')) return null;
  const candidate = trimmed.slice('/messages/'.length).split(/[?#]/)[0];
  return UUID_REGEX.test(candidate) ? candidate : null;
}

export function isImageAttachment(mimeType: string, extension: string): boolean {
  return mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp'].includes(extension.toLowerCase());
}
