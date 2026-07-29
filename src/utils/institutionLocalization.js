function getLocalizedNames(institution = {}) {
  return institution.localized_names
    || institution.localizedNames
    || institution.metadata?.localizedNames
    || {};
}

export function getLocalizedInstitutionName(institution = {}, language = 'es') {
  const localizedNames = getLocalizedNames(institution);
  const languageKey = language === 'en' ? 'en' : 'es';
  const localizedName = String(localizedNames[languageKey] || '').trim();
  const officialName = String(
    institution.display_name
      || institution.displayName
      || institution.name
      || '',
  ).trim();

  return localizedName || officialName;
}
