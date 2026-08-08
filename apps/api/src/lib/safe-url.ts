import { lookup } from 'node:dns/promises';
import { AppError } from './errors.js';

function privateAddress(address: string) {
  return address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:') || /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(address);
}

export async function assertSafeTarget(rawUrl: string) {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new AppError('Request URL is invalid', 422, 'INVALID_TARGET_URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost') throw new AppError('Only public HTTPS targets are allowed', 422, 'UNSAFE_TARGET_URL');
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new AppError('Private network targets are not allowed', 422, 'UNSAFE_TARGET_URL');
  return url;
}
