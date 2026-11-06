import { createHash } from 'node:crypto';

export class ApiError extends Error {
  constructor(code, message, status = 400, details) { super(message); this.code = code; this.status = status; this.details = details; }
}
export const fail = (code, message, status, details) => { throw new ApiError(code, message, status, details); };
export function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_ARGUMENT', 'Expected an object');
  return value;
}
export function text(value, max, bytes = max * 4, empty = false) {
  if (typeof value !== 'string' || [...value].length > max || Buffer.byteLength(value) > bytes || !empty && !value.trim()) fail('INVALID_ARGUMENT', 'Invalid text length');
  return value;
}
export const normalize = value => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
export function categoryName(value) {
  const name = text(value, 320).normalize('NFKC').trim().replace(/\s+/gu, ' ');
  text(name, 80, 320);
  if (/[\u0000-\u001f\u007f]/u.test(name)) fail('INVALID_ARGUMENT', 'Category names cannot contain control characters');
  return { name, nameKey: normalize(name) };
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail('INVALID_ARGUMENT', 'Invalid operation or category ID');
  return value.toLowerCase();
}
export function postId(value) {
  if (typeof value !== 'string' || !/^[0-9]{1,25}$/.test(value)) fail('INVALID_ARGUMENT', 'Invalid post ID');
  return value;
}
export function handle(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_]{1,15}$/.test(value)) fail('INVALID_ARGUMENT', 'Invalid account handle');
  return value.toLowerCase();
}
export function revision(value, absent = false) {
  if (absent && value === null) return value;
  if (!Number.isSafeInteger(value) || value < 1) fail('INVALID_ARGUMENT', 'Invalid record revision');
  return value;
}
export function canonicalUrl(value, id) {
  let url; try { url = new URL(text(value, 256, 256)); } catch { fail('INVALID_ARGUMENT', 'Invalid post URL'); }
  const parts = /^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{1,25})$/.exec(url.pathname);
  if (url.protocol !== 'https:' || url.host !== 'x.com' || url.username || url.password || !parts || parts[2] !== id) fail('INVALID_ARGUMENT', 'Post URL does not match its ID');
  return { url: `https://x.com/${parts[1]}/status/${id}`, handle: handle(parts[1]) };
}
export function snapshot(value, author) {
  object(value);
  const authorHandle = handle(value.authorHandle);
  if (authorHandle !== author) fail('INVALID_ARGUMENT', 'Snapshot author does not match the post');
  if (!['complete', 'excerpt', 'unavailable'].includes(value.textState)) fail('INVALID_ARGUMENT', 'Invalid text state');
  if (!Number.isSafeInteger(value.capturedAtMs) || value.capturedAtMs < 0 || value.capturedAtMs > Date.now() + 300000) fail('INVALID_ARGUMENT', 'Invalid capture time');
  const media = object(value.media);
  if (!['none','photo','video','mixed'].includes(media.kind) || !Number.isInteger(media.count) || media.count < 0 || media.count > 16) fail('INVALID_ARGUMENT', 'Invalid media metadata');
  const links = value.links ?? [];
  if (!Array.isArray(links) || links.length > 8) fail('INVALID_ARGUMENT', 'Too many post links');
  const result = {
    authorHandle, authorName: text(value.authorName, 200), text: text(value.text, 8000, 32768, true),
    textState: value.textState, capturedAtMs: value.capturedAtMs, media: {kind:media.kind,count:media.count},
    links: links.map(link => {
      object(link); let url; try { url = new URL(text(link.href, 2048)); } catch { fail('INVALID_ARGUMENT', 'Invalid post link'); }
      if (!['https:','http:'].includes(url.protocol) || url.username || url.password) fail('INVALID_ARGUMENT', 'Unsafe post link');
      return {text:text(link.text, 300),href:url.href};
    }),
    ...(value.quotedPostId === undefined ? {} : {quotedPostId:postId(value.quotedPostId)}),
  };
  if (Buffer.byteLength(JSON.stringify(result)) > 32768) fail('INVALID_ARGUMENT', 'Snapshot exceeds 32 KiB');
  return result;
}
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(stable(value)).digest('hex');
