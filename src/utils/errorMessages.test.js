import test from 'node:test';
import assert from 'node:assert/strict';
import { getUiErrorMessage } from './errorMessages.js';

test('localizes stable error codes in both supported languages', () => {
  assert.equal(
    getUiErrorMessage('ENTITY_LOAD_FAILED', 'en'),
    'This entity could not be loaded. Check your connection and try again.',
  );
  assert.equal(
    getUiErrorMessage('ENTITY_LOAD_FAILED', 'es'),
    'No se pudo cargar esta entidad. Comprueba tu conexión e inténtalo de nuevo.',
  );
});

test('never exposes an unknown Spanish message in the English interface', () => {
  assert.equal(
    getUiErrorMessage('No se pudo conectar con el proveedor.', 'en', 'FEED_LOAD_FAILED'),
    'Papers could not be loaded. Check your connection and try again.',
  );
});

test('supports provider error objects without exposing their raw message', () => {
  assert.equal(
    getUiErrorMessage({ code: 'auth/popup-blocked', message: 'raw provider copy' }, 'en', 'AUTH_FAILED'),
    'The browser blocked the sign-in window.',
  );
});
