/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ParsedVideoInfo {
  provider: 'youtube' | 'vimeo' | 'external' | 'none';
  embedUrl: string | null;
  directUrl: string | null;
  videoId: string | null;
  isSafe: boolean;
}

// Exact canonical hostnames for YouTube
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
]);

// Exact canonical hostnames for Vimeo
const VIMEO_HOSTS = new Set([
  'vimeo.com',
  'www.vimeo.com',
  'player.vimeo.com',
]);

// Strict regex patterns
// YouTube video IDs: exactly 11 characters of [a-zA-Z0-9_-]
const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

// Vimeo video IDs: 6 to 12 decimal digits
const VIMEO_ID_REGEX = /^[0-9]{6,12}$/;

// FQDN validation regex for external links (must have valid domain labels, no spaces/control characters)
const VALID_FQDN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/**
 * Parses and strictly sanitizes video URLs to ensure secure iframe rendering
 * or safe external links without arbitrary code, deceptive hosts, or iframe injection.
 */
export function parseVideoUrl(rawUrl?: string | null): ParsedVideoInfo {
  const rejected: ParsedVideoInfo = {
    provider: 'none',
    embedUrl: null,
    directUrl: null,
    videoId: null,
    isSafe: false,
  };

  if (!rawUrl || typeof rawUrl !== 'string') {
    return rejected;
  }

  const trimmed = rawUrl.trim();

  // 1. Protocol validation: must strictly start with https://
  if (!trimmed.startsWith('https://')) {
    return rejected;
  }

  try {
    const parsed = new URL(trimmed);

    // 2. Strict protocol check
    if (parsed.protocol !== 'https:') {
      return rejected;
    }

    // 3. Reject credentials embedded in URLs (e.g. https://user:pass@domain/...)
    if (parsed.username || parsed.password) {
      return rejected;
    }

    // 4. Reject unexpected non-standard ports (must be default HTTPS port 443 or omitted)
    if (parsed.port && parsed.port !== '443') {
      return rejected;
    }

    const hostname = parsed.hostname.toLowerCase();

    // 5. Detect and reject deceptive / typosquatted hostnames targeting YouTube or Vimeo
    // (e.g. youtube.com.attacker.example, youtu.be.malicious.site, or vimeo-login.com)
    if (!YOUTUBE_HOSTS.has(hostname) && !VIMEO_HOSTS.has(hostname)) {
      if (hostname.includes('youtube') || hostname.includes('youtu') || hostname.includes('vimeo')) {
        return rejected;
      }
    }

    // 6. YouTube validation (exact host allowlist)
    if (YOUTUBE_HOSTS.has(hostname)) {
      let candidateId: string | null = null;

      if (hostname === 'youtu.be') {
        // Path format: /<id>
        const segments = parsed.pathname.split('/').filter(Boolean);
        if (segments.length === 1) {
          candidateId = segments[0];
        }
      } else {
        // Hostnames: youtube.com, www.youtube.com, m.youtube.com, www.youtube-nocookie.com
        if (parsed.pathname === '/watch') {
          candidateId = parsed.searchParams.get('v');
        } else if (parsed.pathname.startsWith('/embed/')) {
          const parts = parsed.pathname.slice('/embed/'.length).split('/');
          candidateId = parts[0] || null;
        } else if (parsed.pathname.startsWith('/v/')) {
          const parts = parsed.pathname.slice('/v/'.length).split('/');
          candidateId = parts[0] || null;
        }
      }

      if (candidateId && YOUTUBE_ID_REGEX.test(candidateId)) {
        return {
          provider: 'youtube',
          embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(candidateId)}?rel=0&modestbranding=1`,
          directUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(candidateId)}`,
          videoId: candidateId,
          isSafe: true,
        };
      }

      // Malformed YouTube path or ID on YouTube domain
      return rejected;
    }

    // 7. Vimeo validation (exact host allowlist)
    if (VIMEO_HOSTS.has(hostname)) {
      let candidateId: string | null = null;

      if (hostname === 'player.vimeo.com') {
        if (parsed.pathname.startsWith('/video/')) {
          const parts = parsed.pathname.slice('/video/'.length).split('/');
          candidateId = parts[0] || null;
        }
      } else {
        const segments = parsed.pathname.split('/').filter(Boolean);
        if (segments.length === 1) {
          candidateId = segments[0];
        } else if (segments.length === 2 && segments[0] === 'video') {
          candidateId = segments[1];
        }
      }

      if (candidateId && VIMEO_ID_REGEX.test(candidateId)) {
        return {
          provider: 'vimeo',
          embedUrl: `https://player.vimeo.com/video/${encodeURIComponent(candidateId)}?title=0&byline=0&portrait=0`,
          directUrl: `https://vimeo.com/${encodeURIComponent(candidateId)}`,
          videoId: candidateId,
          isSafe: true,
        };
      }

      // Malformed Vimeo path or non-numeric ID
      return rejected;
    }

    // 8. Legitimate external HTTPS link fallback (no iframe embed)
    if (VALID_FQDN_REGEX.test(hostname)) {
      return {
        provider: 'external',
        embedUrl: null,
        directUrl: parsed.href,
        videoId: null,
        isSafe: true,
      };
    }

    return rejected;
  } catch {
    return rejected;
  }
}
