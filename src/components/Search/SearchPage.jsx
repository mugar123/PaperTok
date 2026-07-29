import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, FileText, Users, ArrowLeft, Building2, Lightbulb, Briefcase, Sparkles, Compass, TrendingUp, Check, LoaderCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  searchAuthors,
  searchInstitutions,
  searchConcepts,
  searchLocalTopics,
  searchSources,
} from '../../services/openAlexService';
import { searchProjects } from '../../services/openAireService';
import { OpenAlexAdapter } from '../../services/adapters/OpenAlexAdapter';
import { PaperBuilder } from '../../services/PaperBuilder';
import { useFollowing } from '../../context/FollowingContext';
import { useFeed } from '../../context/FeedContext';
import { useLanguage } from '../../context/LanguageContext';
import PaperCard from '../Feed/PaperCard';
import PDFViewer from '../PDF/PDFViewer';
import ScientificText from '../ScientificText';
import { getLocalizedInstitutionName } from '../../utils/institutionLocalization';

import './SearchPage.css';

const paperSearchAdapter = new OpenAlexAdapter();
const SEARCH_DEBOUNCE_MS = 260;
const SEARCH_TIMEOUT_MS = 6000;

function withTimeout(promise, fallback = [], timeoutMs = SEARCH_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(value);
    };
    const timeoutId = setTimeout(() => finish(fallback), timeoutMs);
    Promise.resolve(promise).then(finish).catch(() => finish(fallback));
  });
}

function FollowButton({ entity, isFollowing, isPending, onToggle }) {
  const { isEnglish } = useLanguage();
  const following = isFollowing(entity);
  const pending = isPending(entity);

  return (
    <button
      className={`search-follow-btn ${following ? 'following' : ''} ${pending ? 'is-pending' : ''}`}
      onClick={(event) => onToggle(event, entity)}
      disabled={pending}
      aria-pressed={following}
    >
      {following && <Check size={14} />}
      <span>{following
        ? (isEnglish ? 'Following' : 'Siguiendo')
        : (isEnglish ? 'Follow' : 'Seguir')}</span>
    </button>
  );
}

function formatPaperDate(paper, locale) {
  const dateValue = paper.published || paper.publishedDate;
  if (dateValue) {
    const date = new Date(dateValue);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString(locale);
  }
  return paper.year ? String(paper.year) : null;
}

export default function SearchPage({ onSaveToList = () => {} }) {
  const navigate = useNavigate();
  const { language, isEnglish, locale } = useLanguage();
  const { isFollowing, isFollowPending, toggleFollow } = useFollowing();
  const {
    likedPaperIds, savedPaperIds, readPaperIds,
    toggleLike, markNotInterested, markAsRead, trackViewTime, trackSkip,
  } = useFeed();
  
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  const [paperResults, setPaperResults] = useState([]);
  const [authorResults, setAuthorResults] = useState([]);
  const [institutionResults, setInstitutionResults] = useState([]);
  const [conceptResults, setConceptResults] = useState([]);
  const [sourceResults, setSourceResults] = useState([]);
  const [projectResults, setProjectResults] = useState([]);
  
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [pdfPaper, setPdfPaper] = useState(null);
  
  const timeoutRef = useRef(null);
  const requestAbortRef = useRef(null);
  const searchIdRef = useRef(0);
  const getInteractionState = useCallback((paper) => ({
    isLiked: likedPaperIds.has(paper.id),
    isSaved: savedPaperIds.has(paper.id),
    isRead: readPaperIds.has(paper.id),
  }), [likedPaperIds, readPaperIds, savedPaperIds]);

  const performSearch = useCallback(async (searchTerm) => {
    const searchId = ++searchIdRef.current;
    requestAbortRef.current?.abort();
    const requestController = new AbortController();
    requestAbortRef.current = requestController;
    const localTopics = searchLocalTopics(searchTerm, language, 8);

    setIsSearching(true);
    setHasSearched(true);
    setConceptResults(localTopics);

    const publish = (setter) => (results) => {
      if (searchId === searchIdRef.current && !requestController.signal.aborted) {
        setter(results);
      }
      return results;
    };

    const tasks = [
      withTimeout(
        paperSearchAdapter.search(searchTerm, 1)
          .then(result => PaperBuilder.deduplicate(result.papers || []).slice(0, 10)),
      ).then(publish(setPaperResults)),
      withTimeout(searchAuthors(searchTerm), [], 5000).then(publish(setAuthorResults)),
      withTimeout(
        searchInstitutions(searchTerm, { signal: requestController.signal }),
        [],
        4500,
      ).then(publish(setInstitutionResults)),
      withTimeout(
        searchConcepts(searchTerm, { language, limit: 8 }),
        localTopics,
        4500,
      ).then(publish(setConceptResults)),
      withTimeout(searchSources(searchTerm), [], 5000).then(publish(setSourceResults)),
      withTimeout(searchProjects(searchTerm).then(result => result.projects || []))
        .then(publish(setProjectResults)),
    ];

    await Promise.allSettled(tasks);
    if (searchId === searchIdRef.current) {
      setIsSearching(false);
      if (requestAbortRef.current === requestController) {
        requestAbortRef.current = null;
      }
    }
  }, [language]);

  useEffect(() => {
    if (!query.trim()) {
      requestAbortRef.current?.abort();
      searchIdRef.current += 1;
      const resetStateTimeout = setTimeout(() => {
        setPaperResults([]);
        setAuthorResults([]);
        setInstitutionResults([]);
        setConceptResults([]);
        setSourceResults([]);
        setProjectResults([]);
        setIsSearching(false);
        setHasSearched(false);
      }, 0);
      return () => clearTimeout(resetStateTimeout);
    }

    requestAbortRef.current?.abort();
    searchIdRef.current += 1;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    timeoutRef.current = setTimeout(() => {
      performSearch(query.trim());
    }, SEARCH_DEBOUNCE_MS);
    
    return () => {
      clearTimeout(timeoutRef.current);
      requestAbortRef.current?.abort();
    };
  }, [query, performSearch]);

  const handleToggleFollow = async (e, entity) => {
    e.stopPropagation();
    try {
      await toggleFollow(entity);
    } catch (err) {
      console.error(err);
    }
  };

  const orcidMatch = query.match(/\b(\d{4}-\d{4}-\d{4}-\d{3}[\dX])\b/i);
  const cleanOrcid = orcidMatch ? orcidMatch[1].toUpperCase() : null;

  const hasResults = paperResults.length > 0
    || authorResults.length > 0
    || institutionResults.length > 0
    || conceptResults.length > 0
    || sourceResults.length > 0
    || projectResults.length > 0
    || !!cleanOrcid;

  const suggestedQueries = [
    {
      label: isEnglish ? 'Cosmology' : 'Cosmología',
      icon: <Lightbulb size={14} />,
      query: isEnglish ? 'Cosmology' : 'Cosmología',
    },
    {
      label: 'MIT',
      icon: <Building2 size={14} />,
      query: 'Massachusetts Institute of Technology',
    },
    {
      label: 'CRISPR Cas9',
      icon: <FileText size={14} />,
      query: 'CRISPR Cas9',
    },
    {
      label: isEnglish ? 'Horizon projects' : 'Proyectos Horizon',
      icon: <Briefcase size={14} />,
      query: 'Horizon',
    },
    {
      label: 'Geoffrey Hinton',
      icon: <Users size={14} />,
      query: 'Geoffrey Hinton',
    },
    {
      label: isEnglish ? 'Quantum computing' : 'Computación cuántica',
      icon: <TrendingUp size={14} />,
      query: 'Quantum computing',
    },
  ];

  const handleSuggestedSearch = (suggestion) => {
    setQuery(suggestion.query);
  };

  const clearSearch = () => {
    setQuery('');
  };

  return (
    <div className="search-page-container">
      <div className="search-header">
        <button
          type="button"
          className="search-back-btn"
          onClick={() => navigate('/')}
          aria-label={isEnglish ? 'Back' : 'Volver'}
        >
          <ArrowLeft size={22} />
        </button>
        <div className={`search-input-wrapper ${isSearching ? 'is-searching' : ''}`}>
          <Search className="search-icon" size={18} />
          <input
            type="search"
            className="search-input"
            placeholder={isEnglish
              ? 'Search papers, topics, authors, institutions...'
              : 'Buscar papers, temas, autores, instituciones...'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) clearSearch();
            }}
            autoComplete="off"
            autoFocus
          />
          {isSearching && (
            <span
              className="search-input-loader"
              role="status"
              aria-label={isEnglish ? 'Searching' : 'Buscando'}
            >
              <LoaderCircle size={17} aria-hidden="true" />
            </span>
          )}
        </div>
      </div>

      <div className="search-results custom-scrollbar">
        <div className="search-results-list" aria-busy={isSearching}>
            {!query && !isSearching && (
              <div className="search-initial-state">
                <div className="search-initial-hero">
                  <Compass size={48} className="search-initial-icon" />
                  <h2>{isEnglish ? 'Explore knowledge' : 'Explora el conocimiento'}</h2>
                  <p>{isEnglish
                    ? 'Search papers, researchers, topics, institutions, and funded projects.'
                    : 'Busca papers, investigadores, temas, universidades y proyectos financiados.'}</p>
                </div>
                
                <div className="search-suggestions">
                  <h3 className="search-suggestions-title"><Sparkles size={16} /> {isEnglish ? 'Suggested searches' : 'Búsquedas sugeridas'}</h3>
                  <div className="search-suggestions-grid">
                    {suggestedQueries.map(item => (
                      <button
                        type="button"
                        key={item.label}
                        onClick={() => handleSuggestedSearch(item)}
                        className="search-suggestion-chip"
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!hasResults && query && hasSearched && !isSearching && (
              <div className="search-empty">
                <Search size={40} className="search-empty-icon" />
                <p>{isEnglish ? `No results found for "${query}"` : `No se encontraron resultados para "${query}"`}</p>
                <span>{isEnglish ? 'Try a different search term' : 'Intenta con otros términos o busca en inglés'}</span>
              </div>
            )}

            {/* Direct ORCID */}
            {cleanOrcid && (
              <div className="search-section">
                <h3 className="search-section-title">{isEnglish ? 'Direct ORCID search' : 'Búsqueda directa ORCID'}</h3>
                <div className="search-item" onClick={() => navigate(`/explorer/author/https%3A%2F%2Forcid.org%2F${cleanOrcid}`)}>
                  <div className="search-item-icon" style={{ background: '#a6ce39', color: 'white' }}>
                    <Users size={22} />
                  </div>
                  <div className="search-item-info">
                    <h4 style={{ color: '#a6ce39' }}>{isEnglish ? 'View ORCID profile' : 'Ver perfil ORCID'} {cleanOrcid}</h4>
                    <p>{isEnglish
                      ? 'Explore the author and their work through a verified unique identifier'
                      : 'Explorar autor e historial mediante su identificador único verificado'}</p>
                  </div>
                </div>
              </div>
            )}

            {institutionResults.length > 0 && (
              <div className="search-section">
                <h3 className="search-section-title">{isEnglish ? 'Universities and institutions' : 'Universidades e instituciones'}</h3>
                {institutionResults.map((inst, index) => {
                  const localizedName = getLocalizedInstitutionName(inst, language);
                  return (
                    <div
                      key={inst.id}
                      className="search-item search-item-enter"
                      style={{ '--search-item-index': index }}
                      onClick={() => navigate(`/explorer/institution/${inst.id.split('/').pop()}`)}
                    >
                      <div className="search-item-icon"><Building2 size={22} /></div>
                      <div className="search-item-info">
                        <h4>{localizedName}</h4>
                        <p>{inst.country_code || (isEnglish ? 'Unknown country' : 'País desconocido')} • {isEnglish ? 'Academic institution' : 'Institución académica'}</p>
                      </div>
                      <FollowButton
                        entity={{
                          type: 'institution',
                          id: inst.id,
                          displayName: inst.display_name,
                          source: inst._metadataSource || 'ror',
                          externalIds: { ror: inst.ror || inst.id },
                          metadata: { localizedNames: inst.localized_names },
                        }}
                        isFollowing={isFollowing}
                        isPending={isFollowPending}
                        onToggle={handleToggleFollow}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {projectResults.length > 0 && (
              <div className="search-section">
                <h3 className="search-section-title">{isEnglish ? 'Research projects' : 'Proyectos de investigación'}</h3>
                {projectResults.map(project => (
                  <div key={project.id} className="search-item" onClick={() => navigate(`/explorer/project/${project.id}?name=${encodeURIComponent(project.acronym || project.title)}&funder=${encodeURIComponent(project.funder)}`)}>
                    <div className="search-item-icon"><Briefcase size={22} /></div>
                    <div className="search-item-info">
                      <h4>{project.acronym ? `${project.acronym}: ${project.title}` : project.title}</h4>
                      <p>{project.funder}{project.budget > 0 ? (() => { try { return ` • ${new Intl.NumberFormat(locale, { style: 'currency', currency: project.currency, maximumFractionDigits: 0 }).format(project.budget)}`; } catch { return ` • ${project.budget.toLocaleString(locale)} €`; } })() : ''}</p>
                    </div>
                    <FollowButton
                      entity={{ type: 'project', id: project.id, displayName: project.acronym || project.title, source: 'openaire', metadata: { funder: project.funder } }}
                      isFollowing={isFollowing}
                      isPending={isFollowPending}
                      onToggle={handleToggleFollow}
                    />
                  </div>
                ))}
              </div>
            )}

            {conceptResults.length > 0 && (
              <div className="search-section">
                <h3 className="search-section-title">{isEnglish ? 'Topics and areas' : 'Temas y áreas'}</h3>
                {conceptResults.map(concept => (
                  <div
                    key={concept.id}
                    className="search-item search-topic-item"
                    onClick={() => navigate(`/explorer/topic/${encodeURIComponent(String(concept.id).split('/').pop())}`)}
                  >
                    <div className="search-item-icon search-topic-icon"><Lightbulb size={22} /></div>
                    <div className="search-item-info">
                      <h4>{concept.display_name}</h4>
                      <p>
                        {concept._localTopic && concept.level === 0
                          ? `${concept.subcategoryCount || 0} ${isEnglish ? 'related topics' : 'temas relacionados'}`
                          : concept._localTopic
                            ? `${isEnglish ? 'Topic in' : 'Tema de'} ${concept.parent_display_name || (isEnglish ? 'PaperTok taxonomy' : 'la taxonomía de PaperTok')}`
                            : [
                                concept.field_display_name || (isEnglish ? 'OpenAlex topic' : 'Tema de OpenAlex'),
                                Number.isFinite(concept.works_count)
                                  ? `${concept.works_count.toLocaleString(locale)} ${isEnglish ? 'works' : 'trabajos'}`
                                  : '',
                              ].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                    <FollowButton
                      entity={{
                        type: 'topic',
                        id: concept.id,
                        displayName: concept.display_name,
                        source: concept._localTopic ? 'papertok' : 'openalex',
                        metadata: {
                          categoryIds: concept.categoryIds,
                          labelEs: concept.labelEs,
                          labelEn: concept.labelEn,
                        },
                      }}
                      isFollowing={isFollowing}
                      isPending={isFollowPending}
                      onToggle={handleToggleFollow}
                    />
                  </div>
                ))}
              </div>
            )}

            {sourceResults.length > 0 && (
              <div className="search-section">
                <h3 className="search-section-title">{isEnglish ? 'Journals and publications' : 'Revistas y publicaciones'}</h3>
                {sourceResults.map(source => (
                  <div key={source.id} className="search-item" onClick={() => navigate(`/explorer/source/${source.id.split('/').pop()}`)}>
                    <div className="search-item-icon"><FileText size={22} /></div>
                    <div className="search-item-info">
                      <h4>{source.display_name}</h4>
                      <p>{source.host_organization_name ? `${source.host_organization_name} • ` : ''}{source.works_count?.toLocaleString(locale)} {isEnglish ? 'related works' : 'obras relacionadas'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {authorResults.length > 0 && (
              <div className="search-section">
                <h3 className="search-section-title">{isEnglish ? 'Authors' : 'Autores'}</h3>
                {authorResults.map(author => {
                  const authorFollow = { type: 'author', id: author.id, displayName: author.display_name, source: 'openalex', externalIds: { orcid: author.orcid } };
                  return (
                    <div key={author.id} className="search-item" onClick={() => navigate(`/explorer/author/${author.id.split('/').pop()}`)}>
                      <div className="search-item-avatar">
                        {author.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="search-item-info">
                        <h4>{author.display_name}</h4>
                        <p>{author.institution || (isEnglish ? 'Unknown institution' : 'Institución desconocida')}</p>
                      </div>
                      <FollowButton
                        entity={authorFollow}
                        isFollowing={isFollowing}
                        isPending={isFollowPending}
                        onToggle={handleToggleFollow}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {paperResults.length > 0 && (
              <div className="search-section">
                <h3 className="search-section-title">{isEnglish ? 'Publications' : 'Publicaciones'}</h3>
                {paperResults.map(paper => {
                  const authors = (paper.authors || []).map(author => author.name || author);
                  return (
                    <div key={paper.id} className="search-item paper-item" onClick={() => setSelectedPaper(paper)}>
                      <div className="search-item-icon"><FileText size={22} /></div>
                      <div className="search-item-info">
                        <h4><ScientificText>{paper.title}</ScientificText></h4>
                        <p className="search-item-authors">{authors.slice(0, 3).join(', ')}{authors.length > 3 ? ` +${authors.length - 3}` : ''}</p>
                        <span className="search-item-meta">
                          {formatPaperDate(paper, locale) || (isEnglish ? 'Unknown date' : 'Fecha desconocida')} • {paper.primaryCategory || paper.journal || 'Paper'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      </div>

      {/* Paper Card Overlay */}
      {selectedPaper && !pdfPaper && (
        <div className="search-overlay">
          <button 
            className="search-back-btn" 
            onClick={() => setSelectedPaper(null)}
            style={{ position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', left: '16px', zIndex: 1200, background: 'rgba(255,255,255,0.1)', width: '40px', height: '40px' }}
          >
            <ArrowLeft size={22} />
          </button>
          <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
            <PaperCard 
              paper={selectedPaper} 
              isLiked={likedPaperIds.has(selectedPaper.id)}
              isSaved={savedPaperIds.has(selectedPaper.id)}
              isRead={readPaperIds.has(selectedPaper.id)}
              onLike={toggleLike}
              onNotInterested={(paper) => { markNotInterested(paper); setSelectedPaper(null); }}
              onMarkAsRead={markAsRead}
              onOpenPdf={(paper) => setPdfPaper(paper)}
              onSaveToList={onSaveToList}
              getInteractionState={getInteractionState}
              trackViewTime={trackViewTime}
              trackSkip={trackSkip}
            />
          </div>
        </div>
      )}

      {/* PDF Viewer */}
      {pdfPaper && (
        <div className="search-overlay" style={{ zIndex: 1200 }}>
          <PDFViewer paper={pdfPaper} onClose={() => setPdfPaper(null)} />
        </div>
      )}
    </div>
  );
}
