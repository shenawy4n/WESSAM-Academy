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

/**
 * Extracts and sanitizes video URLs to ensure secure iframe rendering
 * or safe external links without arbitrary code or iframe injection.
 */
export function parseVideoUrl(rawUrl?: string | null): ParsedVideoInfo {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { provider: 'none', embedUrl: null, directUrl: null, videoId: null, isSafe: false };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('https://')) {
    // Only secure HTTPS URLs are permitted
    return { provider: 'none', embedUrl: null, directUrl: null, videoId: null, isSafe: false };
  }

  try {
    const parsed = new URL(trimmed);

    // 1. YouTube handling
    // Hostnames: youtube.com, www.youtube.com, m.youtube.com, youtu.be, www.youtube-nocookie.com
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtube-nocookie.com')) {
      let videoId = parsed.searchParams.get('v');
      if (!videoId && parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/embed/')[1]?.split('/')[0]?.split('?')[0];
      } else if (!videoId && parsed.pathname.startsWith('/v/')) {
        videoId = parsed.pathname.split('/v/')[1]?.split('/')[0]?.split('?')[0];
      }

      if (videoId && /^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) {
        return {
          provider: 'youtube',
          embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1`,
          directUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
          videoId,
          isSafe: true,
        };
      }
    }

    if (parsed.hostname === 'youtu.be') {
      const videoId = parsed.pathname.slice(1).split('/')[0]?.split('?')[0];
      if (videoId && /^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) {
        return {
          provider: 'youtube',
          embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1`,
          directUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
          videoId,
          isSafe: true,
        };
      }
    }

    // 2. Vimeo handling
    // Hostnames: vimeo.com, player.vimeo.com
    if (parsed.hostname.includes('vimeo.com')) {
      let videoId = parsed.pathname.replace(/^\/video\//, '').replace(/^\//, '').split('/')[0]?.split('?')[0];
      if (videoId && /^[0-9]+$/.test(videoId)) {
        return {
          provider: 'vimeo',
          embedUrl: `https://player.vimeo.com/video/${encodeURIComponent(videoId)}?title=0&byline=0&portrait=0`,
          directUrl: `https://vimeo.com/${encodeURIComponent(videoId)}`,
          videoId,
          isSafe: true,
        };
      }
    }

    // 3. Other HTTPS external URL
    return {
      provider: 'external',
      embedUrl: null,
      directUrl: parsed.href,
      videoId: null,
      isSafe: true,
    };
  } catch {
    return { provider: 'none', embedUrl: null, directUrl: null, videoId: null, isSafe: false };
  }
}
