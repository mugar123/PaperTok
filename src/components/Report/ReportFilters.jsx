import { useState, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CATEGORIES } from '../../data/categories';
import { COUNTRIES, searchCountries } from '../../data/countries';
import { Filter, Search, X, MapPin, ChevronDown } from 'lucide-react';
import WorldMap from './WorldMap';
import './ReportFilters.css';

const EASE = [0.16, 1, 0.3, 1];

/** Smooth expand/collapse for a block of content. */
function Collapse({ isOpen, children, reduced, id }) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          id={id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={reduced ? { duration: 0 } : { height: { duration: 0.32, ease: EASE }, opacity: { duration: 0.22 } }}
          style={{ overflow: 'hidden' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Chevron({ isOpen, size = 16, reduced }) {
  return (
    <motion.span
      className="rf-chevron"
      animate={{ rotate: isOpen ? 180 : 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.25, ease: EASE }}
      aria-hidden="true"
    >
      <ChevronDown size={size} />
    </motion.span>
  );
}

export default function ReportFilters({ filters, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCountryOpen, setIsCountryOpen] = useState(() => (filters.countries?.length || 0) > 0);
  const [countrySearch, setCountrySearch] = useState('');
  const reduced = useReducedMotion();

  const areaKeys = Object.keys(CATEGORIES);

  const searchResults = useMemo(() => {
    return searchCountries(countrySearch);
  }, [countrySearch]);

  const toggleCategory = (key) => {
    const current = filters.categories || [];
    const next = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key];
    onChange({ ...filters, categories: next });
  };

  const toggleCountry = (code) => {
    const current = filters.countries || [];
    const next = current.includes(code)
      ? current.filter(c => c !== code)
      : [...current, code];
    onChange({ ...filters, countries: next });
    setCountrySearch('');
  };

  const clearAll = () => {
    onChange({ categories: [], countries: [] });
  };

  const activeCategories = filters.categories || [];
  const activeCountries = filters.countries || [];
  const activeCount = activeCategories.length + activeCountries.length;

  return (
    <div className="rf">
      {/* Toggle button */}
      <button
        className={`rf-toggle ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="rf-panel"
      >
        <div className="rf-toggle-left">
          <Filter size={14} />
          <span>Filtros</span>
          <AnimatePresence>
            {activeCount > 0 && (
              <motion.span
                className="rf-badge"
                initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={reduced ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {activeCount}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <Chevron isOpen={isOpen} reduced={reduced} />
      </button>

      {/* Active filters at a glance while the panel is closed */}
      <AnimatePresence initial={false}>
        {!isOpen && activeCount > 0 && (
          <motion.div
            className="rf-active-row"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.25, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <div className="rf-active-chips">
              {activeCategories.map(key => (
                <button key={key} className="rf-active-chip" onClick={() => toggleCategory(key)} title="Quitar filtro">
                  {CATEGORIES[key]?.label || key} <X size={10} />
                </button>
              ))}
              {activeCountries.map(code => (
                <button key={code} className="rf-active-chip" onClick={() => toggleCountry(code)} title="Quitar filtro">
                  {COUNTRIES[code] || code} <X size={10} />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expandable panel */}
      <Collapse isOpen={isOpen} reduced={reduced} id="rf-panel">
        <div className="rf-panel">
          {/* Category filters */}
          <div className="rf-section">
            <span className="rf-section-label">Disciplina</span>
            <motion.div
              className="rf-pills"
              initial={reduced ? false : 'hidden'}
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.015 } } }}
            >
              {areaKeys.map(key => {
                const area = CATEGORIES[key];
                const Icon = area.icon;
                const isActive = activeCategories.includes(key);
                return (
                  <motion.button
                    key={key}
                    className={`rf-pill ${isActive ? 'active' : ''}`}
                    onClick={() => toggleCategory(key)}
                    style={isActive ? { background: area.gradient, borderColor: 'transparent' } : {}}
                    variants={{
                      hidden: { opacity: 0, y: 6 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
                    }}
                    whileTap={reduced ? undefined : { scale: 0.95 }}
                  >
                    <Icon size={13} />
                    {area.label}
                  </motion.button>
                );
              })}
            </motion.div>
          </div>

          {/* Country filters */}
          <div className="rf-section">
            <button
              className="rf-country-toggle"
              type="button"
              aria-expanded={isCountryOpen}
              aria-controls="rf-country-controls"
              onClick={() => setIsCountryOpen(open => !open)}
            >
              <span><MapPin size={13} /> País de origen{activeCountries.length ? ` (${activeCountries.length})` : ''}</span>
              <Chevron isOpen={isCountryOpen} size={15} reduced={reduced} />
            </button>

            {/* The map expands and folds with the section instead of popping. */}
            <Collapse isOpen={isCountryOpen} reduced={reduced} id="rf-country-controls">
              <div className="rf-country-controls">
                {/* Search */}
                <div className="rf-search-wrap">
                  <Search size={14} className="rf-search-icon" />
                  <input
                    className="rf-search"
                    type="text"
                    placeholder="Buscar país..."
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                  />
                  {countrySearch && (
                    <button className="rf-search-clear" onClick={() => setCountrySearch('')}>
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Search results dropdown */}
                <AnimatePresence>
                  {searchResults.length > 0 && (
                    <motion.div
                      className="rf-search-results"
                      initial={reduced ? false : { opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.18, ease: EASE }}
                    >
                      {searchResults.map(({ code, name }) => (
                        <button
                          key={code}
                          className={`rf-search-result ${activeCountries.includes(code) ? 'selected' : ''}`}
                          onClick={() => toggleCountry(code)}
                        >
                          <span>{name}</span>
                          <span className="rf-country-code">{code}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* World Map */}
                <motion.div
                  className="rf-map-wrap"
                  initial={reduced ? false : { opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: EASE, delay: reduced ? 0 : 0.08 }}
                >
                  <WorldMap
                    selectedCountries={activeCountries}
                    onToggleCountry={toggleCountry}
                  />
                  <p className="rf-map-hint">Toca un país del mapa para filtrar la edición.</p>
                </motion.div>

                {/* Selected countries pills */}
                <div className="rf-selected-countries">
                  <AnimatePresence>
                    {activeCountries.map(code => (
                      <motion.span
                        key={code}
                        className="rf-country-pill"
                        initial={reduced ? false : { opacity: 0, scale: 0.8, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 5 }}
                        transition={{ duration: 0.2 }}
                      >
                        {COUNTRIES[code] || code}
                        <button onClick={() => toggleCountry(code)}><X size={10} /></button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </Collapse>
          </div>

          {/* Clear all */}
          <AnimatePresence>
            {activeCount > 0 && (
              <motion.button
                className="rf-clear"
                onClick={clearAll}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <X size={12} /> Limpiar filtros
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </Collapse>
    </div>
  );
}
