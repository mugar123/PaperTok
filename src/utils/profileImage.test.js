import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProfilePhoto,
  validateProfileImageMetadata,
} from './profileImage.js';

test('accepts ordinary profile image metadata', () => {
  assert.doesNotThrow(() => validateProfileImageMetadata({
    type: 'image/jpeg',
    size: 250_000,
  }));
});

test('rejects oversized and non-image profile files', () => {
  assert.throws(
    () => validateProfileImageMetadata({ type: 'application/pdf', size: 20_000 }),
    /PNG, JPEG o WebP/,
  );
  assert.throws(
    () => validateProfileImageMetadata({ type: 'image/svg+xml', size: 20_000 }),
    /PNG, JPEG o WebP/,
  );
  assert.throws(
    () => validateProfileImageMetadata({ type: 'image/png', size: 9 * 1024 * 1024 }),
    /8 MB/,
  );
});

test('only keeps bounded embedded profile images', () => {
  const photo = `data:image/webp;base64,${'a'.repeat(120)}`;
  assert.equal(normalizeProfilePhoto(photo), photo);
  assert.equal(normalizeProfilePhoto('https://tracking.example/avatar.png'), null);
  assert.equal(normalizeProfilePhoto(`data:image/png;base64,${'a'.repeat(300_000)}`), null);
});
