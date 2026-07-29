import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocalizedInstitutionName } from './institutionLocalization.js';

test('uses a verified ROR label for the active interface language', () => {
  const institution = {
    display_name: 'Universidad de Salamanca',
    localized_names: {
      es: 'Universidad de Salamanca',
      en: 'University of Salamanca',
    },
  };

  assert.equal(getLocalizedInstitutionName(institution, 'en'), 'University of Salamanca');
  assert.equal(getLocalizedInstitutionName(institution, 'es'), 'Universidad de Salamanca');
  assert.equal(institution.display_name, 'Universidad de Salamanca');
});

test('supports localized names stored with a followed institution', () => {
  const follow = {
    type: 'institution',
    displayName: 'Universidad de Salamanca',
    metadata: {
      localizedNames: {
        en: 'University of Salamanca',
      },
    },
  };

  assert.equal(getLocalizedInstitutionName(follow, 'en'), 'University of Salamanca');
});

test('keeps the official name when ROR has no verified translation', () => {
  const institution = { display_name: 'KU Leuven' };

  assert.equal(getLocalizedInstitutionName(institution, 'en'), 'KU Leuven');
  assert.equal(getLocalizedInstitutionName(institution, 'es'), 'KU Leuven');
});

test('returns an empty label while an institution is still loading', () => {
  assert.equal(getLocalizedInstitutionName(null, 'en'), '');
  assert.equal(getLocalizedInstitutionName(undefined, 'es'), '');
});
