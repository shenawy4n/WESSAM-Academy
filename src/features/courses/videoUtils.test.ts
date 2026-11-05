/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoUrl } from './videoUtils';

test('videoUtils - Legitimate YouTube URLs', () => {
  // 1. Standard YouTube watch URL
  const res1 = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.strictEqual(res1.isSafe, true);
  assert.strictEqual(res1.provider, 'youtube');
  assert.strictEqual(res1.videoId, 'dQw4w9WgXcQ');
  assert.strictEqual(res1.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1');

  // 2. youtube.com without www
  const res2 = parseVideoUrl('https://youtube.com/watch?v=dQw4w9WgXcQ');
  assert.strictEqual(res2.isSafe, true);
  assert.strictEqual(res2.provider, 'youtube');
  assert.strictEqual(res2.videoId, 'dQw4w9WgXcQ');

  // 3. Short youtu.be URL
  const res3 = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ');
  assert.strictEqual(res3.isSafe, true);
  assert.strictEqual(res3.provider, 'youtube');
  assert.strictEqual(res3.videoId, 'dQw4w9WgXcQ');

  // 4. youtube-nocookie.com embed URL
  const res4 = parseVideoUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.strictEqual(res4.isSafe, true);
  assert.strictEqual(res4.provider, 'youtube');
  assert.strictEqual(res4.videoId, 'dQw4w9WgXcQ');

  // 5. Mobile YouTube URL
  const res5 = parseVideoUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.strictEqual(res5.isSafe, true);
  assert.strictEqual(res5.provider, 'youtube');
  assert.strictEqual(res5.videoId, 'dQw4w9WgXcQ');
});

test('videoUtils - Legitimate Vimeo URLs', () => {
  // 1. Standard Vimeo video URL
  const res1 = parseVideoUrl('https://vimeo.com/76979871');
  assert.strictEqual(res1.isSafe, true);
  assert.strictEqual(res1.provider, 'vimeo');
  assert.strictEqual(res1.videoId, '76979871');
  assert.strictEqual(res1.embedUrl, 'https://player.vimeo.com/video/76979871?title=0&byline=0&portrait=0');

  // 2. Player Vimeo embed URL
  const res2 = parseVideoUrl('https://player.vimeo.com/video/76979871');
  assert.strictEqual(res2.isSafe, true);
  assert.strictEqual(res2.provider, 'vimeo');
  assert.strictEqual(res2.videoId, '76979871');

  // 3. www.vimeo.com URL
  const res3 = parseVideoUrl('https://www.vimeo.com/76979871');
  assert.strictEqual(res3.isSafe, true);
  assert.strictEqual(res3.provider, 'vimeo');
  assert.strictEqual(res3.videoId, '76979871');
});

test('videoUtils - Rejection of Malicious & Deceptive Hostnames', () => {
  // Subdomain / deceptive hostnames targeting YouTube
  assert.strictEqual(parseVideoUrl('https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ').isSafe, false);
  assert.strictEqual(parseVideoUrl('https://attacker-youtube.com/watch?v=dQw4w9WgXcQ').isSafe, false);
  assert.strictEqual(parseVideoUrl('https://fake-youtube.net/watch?v=dQw4w9WgXcQ').isSafe, false);
  assert.strictEqual(parseVideoUrl('https://youtu.be.malicious.site/watch?v=dQw4w9WgXcQ').isSafe, false);

  // Subdomain / deceptive hostnames targeting Vimeo
  assert.strictEqual(parseVideoUrl('https://vimeo.com.attacker.example/76979871').isSafe, false);
  assert.strictEqual(parseVideoUrl('https://vimeo-login.phishing.org/76979871').isSafe, false);
});

test('videoUtils - Rejection of Insecure Protocols & Schemes', () => {
  // HTTP is strictly rejected
  assert.strictEqual(parseVideoUrl('http://youtube.com/watch?v=dQw4w9WgXcQ').isSafe, false);
  assert.strictEqual(parseVideoUrl('http://vimeo.com/76979871').isSafe, false);

  // JavaScript / Data schemes
  assert.strictEqual(parseVideoUrl('javascript:alert(1)').isSafe, false);
  assert.strictEqual(parseVideoUrl('data:text/html,<script>alert(1)</script>').isSafe, false);
  assert.strictEqual(parseVideoUrl('vbscript:msgbox(1)').isSafe, false);
});

test('videoUtils - Rejection of Embedded Credentials & Unexpected Ports', () => {
  // Embedded user:pass credentials
  assert.strictEqual(parseVideoUrl('https://admin:secret@youtube.com/watch?v=dQw4w9WgXcQ').isSafe, false);
  assert.strictEqual(parseVideoUrl('https://user:pass@vimeo.com/76979871').isSafe, false);

  // Unexpected non-standard ports
  assert.strictEqual(parseVideoUrl('https://youtube.com:8080/watch?v=dQw4w9WgXcQ').isSafe, false);
  assert.strictEqual(parseVideoUrl('https://vimeo.com:3000/76979871').isSafe, false);
});

test('videoUtils - Rejection of Malformed Video IDs', () => {
  // YouTube IDs must be exactly 11 characters
  assert.strictEqual(parseVideoUrl('https://youtube.com/watch?v=tooShort').isSafe, false);
  assert.strictEqual(parseVideoUrl('https://youtube.com/watch?v=wayTooLongIdentifier123').isSafe, false);
  assert.strictEqual(parseVideoUrl('https://youtube.com/watch?v=dQw4w9WgXcQ<script>').isSafe, false);

  // Vimeo IDs must be 6 to 12 decimal digits
  assert.strictEqual(parseVideoUrl('https://vimeo.com/notNumericId').isSafe, false);
  assert.strictEqual(parseVideoUrl('https://vimeo.com/123').isSafe, false); // too short
});

test('videoUtils - Safe External HTTPS Links Fallback', () => {
  const ext = parseVideoUrl('https://wessam-academy.sa/lecture-slides.pdf');
  assert.strictEqual(ext.isSafe, true);
  assert.strictEqual(ext.provider, 'external');
  assert.strictEqual(ext.embedUrl, null);
  assert.strictEqual(ext.directUrl, 'https://wessam-academy.sa/lecture-slides.pdf');
});
