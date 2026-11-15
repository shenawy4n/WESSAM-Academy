/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDownloadUrl,
  sanitizeDownloadFileName,
  triggerSafeResourceDownload,
  openSafeExternalUrl,
} from './safeDownload';

test('validateDownloadUrl - accepts valid HTTPS and local dev URLs', () => {
  assert.equal(
    validateDownloadUrl('https://xyz.supabase.co/storage/v1/object/sign/learning-resources/test.pdf?token=abc'),
    'https://xyz.supabase.co/storage/v1/object/sign/learning-resources/test.pdf?token=abc'
  );
  assert.equal(
    validateDownloadUrl('http://127.0.0.1:54321/storage/v1/object/sign/learning-resources/test.pdf'),
    'http://127.0.0.1:54321/storage/v1/object/sign/learning-resources/test.pdf'
  );
});

test('validateDownloadUrl - rejects unsafe protocols, empty URLs, and credentials', () => {
  assert.throws(() => validateDownloadUrl(''), /missing or expired/i);
  assert.throws(() => validateDownloadUrl(null), /missing or expired/i);
  assert.throws(() => validateDownloadUrl('javascript:alert(1)'), /Unsafe download URL protocol/);
  assert.throws(() => validateDownloadUrl('data:text/html,<script>alert(1)</script>'), /Unsafe download URL protocol/);
  assert.throws(() => validateDownloadUrl('http://example.com/resource.pdf'), /Unsafe download URL protocol/);
  assert.throws(() => validateDownloadUrl('https://user:pass@example.com/resource.pdf'), /embedded credentials/i);
});

test('sanitizeDownloadFileName - cleans unsafe chars and appends extension when missing', () => {
  assert.equal(sanitizeDownloadFileName('Unit 1: Worksheet', 'pdf'), 'Unit 1 Worksheet.pdf');
  assert.equal(sanitizeDownloadFileName('grammar-notes.pdf', 'pdf'), 'grammar-notes.pdf');
  assert.equal(sanitizeDownloadFileName('ورقة عمل/الدرس 1', 'DOCX'), 'ورقة عمل الدرس 1.docx');
  assert.equal(sanitizeDownloadFileName('   ', 'pdf'), undefined);
});

test('triggerSafeResourceDownload - returns validated URL in non-DOM test environment without window.open', () => {
  const url = 'https://xyz.supabase.co/storage/v1/object/sign/learning-resources/handout.pdf?token=123';
  const result = triggerSafeResourceDownload(url, { fileName: 'Handout', fileType: 'pdf' });
  assert.equal(result, url);
});

test('openSafeExternalUrl - accepts valid HTTPS links and rejects javascript: or embedded credentials', () => {
  const meetingUrl = 'https://zoom.us/j/123456789';
  assert.equal(openSafeExternalUrl(meetingUrl), meetingUrl);
  assert.throws(() => openSafeExternalUrl('javascript:alert(1)'), /Unsafe download URL protocol/);
  assert.throws(() => openSafeExternalUrl('https://user:secret@zoom.us/j/123'), /embedded credentials/i);
});
