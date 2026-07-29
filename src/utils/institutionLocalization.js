function getLocalizedNames(institution = {}) {
  return institution?.localized_names
    || institution?.localizedNames
    || institution?.metadata?.localizedNames
    || {};
}

export function getLocalizedInstitutionName(institution = {}, language = 'es') {
  const safeInstitution = institution || {};
  const localizedNames = getLocalizedNames(institution);
  const languageKey = language === 'en' ? 'en' : 'es';
  const localizedName = String(localizedNames[languageKey] || '').trim();
  const officialName = String(
    safeInstitution.display_name
      || safeInstitution.displayName
      || safeInstitution.name
      || '',
  ).trim();

  return localizedName || officialName;
}
