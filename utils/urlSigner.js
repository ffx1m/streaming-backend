import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * Signs a URL for the media worker if it matches the worker origin.
 * @param {string} videoUrl - The original video URL.
 * @returns {string} - The signed URL or the original URL if no signing is needed.
 */
export const signWorkerUrl = (videoUrl) => {
  if (!videoUrl || !env.mediaWorkerOrigin || !env.mediaSigningSecret) {
    return videoUrl;
  }

  try {
    const url = new URL(videoUrl);
    const workerOrigin = new URL(env.mediaWorkerOrigin).origin;

    // Only sign if the URL matches our media worker origin
    if (url.origin !== workerOrigin) {
      return videoUrl;
    }

    // Only sign .m3u8 files
    if (!url.pathname.toLowerCase().endsWith('.m3u8')) {
      return videoUrl;
    }

    const expiry = Math.floor(Date.now() / 1000) + env.mediaSignedUrlTtl;
    const pathname = url.pathname;

    // Create HMAC signature: pathname:expiry
    const data = `${pathname}:${expiry}`;
    const signature = crypto
      .createHmac('sha256', env.mediaSigningSecret)
      .update(data)
      .digest('hex');

    // Return the signed URL
    return `${workerOrigin}${pathname}?exp=${expiry}&sig=${signature}`;
  } catch (error) {
    console.error('Error signing worker URL:', error);
    return videoUrl;
  }
};
