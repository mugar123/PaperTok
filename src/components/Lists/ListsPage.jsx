import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { IS_DEMO, db } from '../../services/firebase';
import {
  collection,
  getDocs,
  getDocsFromCache,
  query,
  where,
  documentId,
  doc,
  deleteDoc,
  updateDoc,
  arrayRemove,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useFeed } from '../../context/FeedContext';
import { useLanguage } from '../../context/LanguageContext';
import { getCategoryLabel } from '../../data/categories';
import { getIcon } from '../../utils/icons';
import { paperLegacyAdapter } from '../../models/Paper';
import { Download, Pencil, X } from 'lucide-react';
import { downloadCitationFile } from '../../utils/readingLibrary';
import { settleWithin } from '../../utils/asyncTiming';
import { getUiErrorMessage } from '../../utils/errorMessages';
import './ListsPage.css';

const LISTS_LOAD_DEADLINE_MS = 2_500;
const PAPER_METADATA_LOAD_DEADLINE_MS = 4_000;
const PAPER_METADATA_BATCH_SIZE = 10;

function demoGet(key, fallback) {
  try { const v = localStorage.getItem(`papertok_${key}`); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function demoSet(key, value) {
  try { localStorage.setItem(`papertok_${key}`, JSON.stringify(value)); }
  catch (err) { console.error('Error in demoSet', err); }
}



export default function ListsPage({ onOpenPdf, onEditPaper }) {
  const { user } = useAuth();
  const { language, isEnglish } = useLanguage();
  const {
    unmarkAsRead,
    toggleLike,
    personalLibrary,
    toggleReadLater,
    likedPaperIds,
    readPaperIds,
  } = useFeed();
  const [lists, setLists] = useState([]);
  const [savedPapers, setSavedPapers] = useState({});
  const [expandedList, setExpandedList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [metadataLoadingListId, setMetadataLoadingListId] = useState(null);
  const [metadataError, setMetadataError] = useState(null);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const metadataRequestId = useRef(0);
  const failedMetadataRequests = useRef(new Map());

  const displayLists = useMemo(() => {
    const favoriteIds = Array.from(likedPaperIds || []);
    const readIds = Array.from(readPaperIds || [])
      .sort((a, b) => new Date(personalLibrary[b]?.readAt || 0) - new Date(personalLibrary[a]?.readAt || 0));
    const readLaterIds = Object.values(personalLibrary)
      .filter((record) => record.readLater)
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .map((record) => record.paperId);
    return [
      { id: '__favorites__', name: isEnglish ? 'Favorites' : 'Favoritos', emoji: 'Heart', paperIds: favoriteIds, createdAt: 'default' },
      { id: '__read_later__', name: isEnglish ? 'Read later' : 'Leer después', emoji: 'BookOpen', paperIds: readLaterIds, createdAt: 'default' },
      { id: '__read__', name: isEnglish ? 'Reading history' : 'Historial de lectura', emoji: 'Eye', paperIds: readIds, createdAt: 'default' },
      ...lists,
    ];
  }, [isEnglish, likedPaperIds, lists, personalLibrary, readPaperIds]);

  const getPaper = (paperId) => savedPapers[paperId] || personalLibrary[paperId]?.paper;

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      if (!user) {
        if (active) setLists([]);
        if (active) setLoading(false);
        return;
      }
      if (active) {
        setLoading(true);
        setError(null);
      }
      const applySnapshot = (snapshot) => {
        if (!active) return;
        const customLists = [];
        snapshot.forEach((item) => customLists.push({ id: item.id, ...item.data() }));
        setLists(customLists);
      };

      try {
        if (IS_DEMO) {
          if (active) setLists(demoGet('lists', []));
          return;
        }

        const listsRef = collection(db, 'users', user.uid, 'lists');

        // FeedContext already owns Favorites, Read and Read later. Custom lists
        // paint from IndexedDB first while one network refresh runs behind them.
        try {
          const cached = await getDocsFromCache(listsRef);
          applySnapshot(cached);
        } catch {
          // First visit on this device: nothing cached yet.
        }

        const networkRequest = getDocs(listsRef);
        const snapshot = await settleWithin(networkRequest, LISTS_LOAD_DEADLINE_MS);
        if (snapshot.status !== 'fulfilled') {
          if (snapshot.status === 'timed_out') {
            // Keep the original request alive. A late response can still refresh
            // the cards without making the user press Retry.
            networkRequest.then((lateSnapshot) => {
              if (!active) return;
              applySnapshot(lateSnapshot);
              setError(null);
            }).catch(() => {});
          }
          throw snapshot.status === 'timed_out'
            ? new Error('The list request exceeded its deadline.')
            : (snapshot.reason || new Error('Custom lists could not be loaded.'));
        }
        applySnapshot(snapshot.value);
        if (active) setError(null);
      } catch (err) {
        console.error('Error loading lists:', err);
        if (active) setError('LISTS_LOAD_FAILED');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();
    return () => { active = false; };
  }, [user, reloadToken]);

  const openList = useCallback(async (list, retryFailedOnly = false) => {
    const requestId = ++metadataRequestId.current;
    setExpandedList(list.id);
    setMetadataError(null);

    const paperIds = [...new Set(
      (list.paperIds || []).filter((paperId) => typeof paperId === 'string' && paperId),
    )];
    const missingIds = paperIds.filter(
      (paperId) => !savedPapers[paperId] && !personalLibrary[paperId]?.paper,
    );
    if (missingIds.length === 0) {
      failedMetadataRequests.current.delete(list.id);
      setMetadataLoadingListId(null);
      return;
    }

    if (IS_DEMO) {
      const demoPapers = demoGet('savedPapersData', {});
      const requestedPapers = {};
      missingIds.forEach((paperId) => {
        if (demoPapers[paperId]) {
          requestedPapers[paperId] = paperLegacyAdapter({ id: paperId, ...demoPapers[paperId] });
        }
      });
      setSavedPapers((current) => ({ ...current, ...requestedPapers }));
      failedMetadataRequests.current.delete(list.id);
      setMetadataLoadingListId(null);
      return;
    }

    if (!user) {
      setMetadataLoadingListId(null);
      return;
    }
    setMetadataLoadingListId(list.id);

    try {
      const missingIdSet = new Set(missingIds);
      const retryRequests = retryFailedOnly
        ? (failedMetadataRequests.current.get(list.id) || [])
        : [];
      failedMetadataRequests.current.delete(list.id);

      const requestDefinitions = retryRequests.length > 0
        ? retryRequests
          .map((request) => ({
            ...request,
            paperIds: request.paperIds.filter((paperId) => missingIdSet.has(paperId)),
          }))
          .filter((request) => request.paperIds.length > 0)
        : (() => {
            const batches = [];
            for (let index = 0; index < missingIds.length; index += PAPER_METADATA_BATCH_SIZE) {
              batches.push(missingIds.slice(index, index + PAPER_METADATA_BATCH_SIZE));
            }
            return batches.flatMap((paperIds) => [
              { source: 'interaction', paperIds },
              { source: 'saved', paperIds },
            ]);
          })();

      const resolvedIds = new Set();
      const mergeSnapshot = (source, snapshot) => {
        if (metadataRequestId.current !== requestId) return;
        const loadedPapers = {};
        snapshot.forEach((item) => {
          const data = item.data();
          const rawPaper = source === 'saved'
            ? { id: item.id, ...data }
            : data.paper
              ? { id: item.id, ...data.paper }
              : {
                  id: item.id,
                  title: data.paperTitle || item.id,
                  authors: data.paperAuthors || [],
                  primaryCategory: data.paperCategory || '',
                  published: data.timestamp,
                  arxivId: item.id,
                };
          const paper = paperLegacyAdapter(rawPaper);
          loadedPapers[item.id] = paper;
          if (paper.title && paper.title !== item.id) {
            resolvedIds.add(item.id);
          }
        });

        if (Object.keys(loadedPapers).length === 0) return;
        setSavedPapers((current) => {
          const next = { ...current };
          Object.entries(loadedPapers).forEach(([paperId, paper]) => {
            // savedPapers contains the canonical document and must win even if
            // the lighter interaction record finishes later.
            if (source === 'saved' || !next[paperId]) {
              next[paperId] = paper;
            }
          });
          return next;
        });
      };

      const runRequest = async (requestDefinition) => {
        const sourceCollection = requestDefinition.source === 'saved'
          ? 'savedPapers'
          : 'interactions';
        const metadataQuery = query(
          collection(db, 'users', user.uid, sourceCollection),
          where(documentId(), 'in', requestDefinition.paperIds),
        );

        const cachedRequest = settleWithin(
          getDocsFromCache(metadataQuery),
          500,
        ).then((cachedResult) => {
          if (cachedResult.status === 'fulfilled') {
            mergeSnapshot(requestDefinition.source, cachedResult.value);
          }
        });

        const networkRequest = getDocs(metadataQuery);
        const networkResultRequest = settleWithin(
          networkRequest,
          PAPER_METADATA_LOAD_DEADLINE_MS,
        ).then((networkResult) => {
          if (networkResult.status === 'fulfilled') {
            mergeSnapshot(requestDefinition.source, networkResult.value);
            return networkResult;
          }

          if (networkResult.status === 'timed_out') {
            networkRequest.then((lateSnapshot) => {
              mergeSnapshot(requestDefinition.source, lateSnapshot);
              if (
                metadataRequestId.current === requestId
                && missingIds.every((paperId) => resolvedIds.has(paperId))
              ) {
                failedMetadataRequests.current.delete(list.id);
                setMetadataError(null);
              }
            }).catch(() => {});
          }
          return networkResult;
        });

        const [, networkOutcome] = await Promise.allSettled([
          cachedRequest,
          networkResultRequest,
        ]);
        if (networkOutcome.status === 'rejected') {
          throw networkOutcome.reason;
        }
        return networkOutcome.value;
      };

      // Every source/batch has its own deadline and paints as soon as it
      // resolves. One slow Firestore query can no longer hold back the others.
      const requestResults = await Promise.allSettled(
        requestDefinitions.map((requestDefinition) => runRequest(requestDefinition)),
      );
      if (metadataRequestId.current !== requestId) return;

      const failedRequests = requestResults.flatMap((result, index) => {
        if (result.status === 'rejected' || result.value?.status !== 'fulfilled') {
          return [requestDefinitions[index]];
        }
        return [];
      });
      const unresolvedIds = missingIds.filter((paperId) => !resolvedIds.has(paperId));

      if (failedRequests.length > 0 && unresolvedIds.length > 0) {
        failedMetadataRequests.current.set(list.id, failedRequests);
        setMetadataError('LIST_METADATA_LOAD_FAILED');
      } else {
        failedMetadataRequests.current.delete(list.id);
        setMetadataError(null);
      }
    } catch (metadataLoadError) {
      console.error('Error loading list paper metadata:', metadataLoadError);
      if (metadataRequestId.current === requestId) {
        setMetadataError('LIST_METADATA_LOAD_FAILED');
      }
    } finally {
      if (metadataRequestId.current === requestId) {
        setMetadataLoadingListId(null);
      }
    }
  }, [personalLibrary, savedPapers, user]);

  const closeExpandedList = () => {
    metadataRequestId.current += 1;
    setExpandedList(null);
    setMetadataLoadingListId(null);
    setMetadataError(null);
  };

  const handleDeleteList = async (listId) => {
    if (listId === '__favorites__' || listId === '__read__' || listId === '__read_later__') return;
    if (IS_DEMO) {
      const allLists = demoGet('lists', []).filter((l) => l.id !== listId);
      localStorage.setItem('papertok_lists', JSON.stringify(allLists));
    } else {
      await deleteDoc(doc(db, 'users', user.uid, 'lists', listId));
    }
    setLists((prev) => prev.filter((l) => l.id !== listId));
    if (expandedList === listId) setExpandedList(null);
  };

  const handleUnmarkAsRead = (e, paperId) => {
    e.stopPropagation();
    unmarkAsRead(paperId);
    setLists((prev) => prev.map((list) => {
      if (list.id === '__read__') {
        return { ...list, paperIds: list.paperIds.filter((id) => id !== paperId) };
      }
      return list;
    }));
  };

  const handleUnlike = async (e, paperId, paper) => {
    e.stopPropagation();
    await toggleLike(paper);
    setLists((prev) => prev.map((list) => {
      if (list.id === '__favorites__') {
        return { ...list, paperIds: list.paperIds.filter((id) => id !== paperId) };
      }
      return list;
    }));
  };

  const handleRemoveFromCustomList = async (e, listId, paperId) => {
    e.stopPropagation();
    if (IS_DEMO) {
      const allLists = demoGet('lists', []);
      const idx = allLists.findIndex((l) => l.id === listId);
      if (idx !== -1) {
        allLists[idx].paperIds = (allLists[idx].paperIds || []).filter((id) => id !== paperId);
        demoSet('lists', allLists);
      }
    } else {
      try {
        const listRef = doc(db, 'users', user.uid, 'lists', listId);
        await updateDoc(listRef, { paperIds: arrayRemove(paperId) });
      } catch (err) {
        console.error('Error removing paper from custom list:', err);
      }
    }
    setLists((prev) => prev.map((list) => {
      if (list.id === listId) {
        return { ...list, paperIds: list.paperIds.filter((id) => id !== paperId) };
      }
      return list;
    }));
  };
  return (
    <div className="lists-page">
      <div className="lists-header"><h1>{isEnglish ? 'My lists' : 'Mis listas'}</h1></div>
      {loading && (
        <div className="lists-inline-status" aria-live="polite">
          <div className="lists-loading-spinner" />
          <span>{isEnglish ? 'Updating personal lists...' : 'Actualizando listas personales...'}</span>
        </div>
      )}
      {error && (
        <div className="lists-inline-status is-error" role="alert">
          <span>{getUiErrorMessage(error, language, 'LISTS_LOAD_FAILED')}</span>
          <button className="lists-retry-btn" onClick={() => setReloadToken(token => token + 1)}>
            {isEnglish ? 'Try again' : 'Reintentar'}
          </button>
        </div>
      )}

      {expandedList ? (
        <div className="lists-expanded">
          <button className="lists-back-btn" onClick={closeExpandedList}>
            {isEnglish ? '← Back to lists' : '← Volver a listas'}
          </button>
          {(() => {
            const list = displayLists.find((l) => l.id === expandedList);
            if (!list) return null;
            const exportPapers = (list.paperIds || []).map(getPaper).filter(Boolean);
            return (
              <>
                <div className="lists-expanded-heading">
                  <h2 className="lists-expanded-title">
                    {(() => {
                      const Icon = getIcon(list.emoji);
                      return <Icon size={24} strokeWidth={2} />;
                    })()}
                    {list.name}
                  </h2>
                  {exportPapers.length > 0 && (
                    <div className="lists-export-actions">
                      <button onClick={() => downloadCitationFile(exportPapers, 'bibtex', `papertok-${list.name}`)}><Download size={16} /> BibTeX</button>
                      <button onClick={() => downloadCitationFile(exportPapers, 'ris', `papertok-${list.name}`)}><Download size={16} /> RIS</button>
                    </div>
                  )}
                </div>
                {metadataLoadingListId === list.id && (
                  <div className="lists-metadata-status" aria-live="polite">
                    <div className="lists-loading-spinner" />
                    <span>{isEnglish ? 'Loading papers in this list...' : 'Cargando los papers de esta lista...'}</span>
                  </div>
                )}
                {metadataError && (
                  <div className="lists-metadata-status is-error" role="alert">
                    <span>{getUiErrorMessage(metadataError, language, 'LIST_METADATA_LOAD_FAILED')}</span>
                    <button className="lists-retry-btn" onClick={() => openList(list, true)}>
                      {isEnglish ? 'Try again' : 'Reintentar'}
                    </button>
                  </div>
                )}
                <div className="lists-expanded-papers">
                  {(list.paperIds || []).map((paperId) => {
                    const paper = getPaper(paperId);
                    const record = personalLibrary[paperId];
                    if (!paper) return (
                      <div key={paperId} className="lists-paper-item">
                        <p className="lists-paper-title lists-paper-placeholder">
                          {metadataLoadingListId === list.id
                            ? (isEnglish ? 'Loading paper details...' : 'Cargando datos del paper...')
                            : paperId}
                        </p>
                      </div>
                    );
                    return (
                      <div key={paperId} className="lists-paper-item"
                        onClick={() => onOpenPdf({ ...paper, arxivId: paper.arxivId || paper.id })}>
                        <div className="lists-paper-item-content">
                          {paper.categories && paper.categories.length > 0 && (
                            <span className="lists-paper-cat">{getCategoryLabel(paper.categories[0], language)}</span>
                          )}
                          <p className="lists-paper-title">{paper.title}</p>
                          {paper.authors && (
                            <p className="lists-paper-authors">
                              {paper.authors.slice(0, 3).map(a => typeof a === 'string' ? a : a.name).filter(Boolean).join(', ')}{paper.authors.length > 3 && ' et al.'}
                            </p>
                          )}
                          {paper.year && <span className="lists-paper-date">{paper.year}</span>}
                          {record?.tags?.length > 0 && (
                            <div className="lists-paper-tags">
                              {record.tags.map((tag) => <span key={tag}>{tag}</span>)}
                            </div>
                          )}
                          {record?.note && <p className="lists-paper-note">{record.note}</p>}
                        </div>
                        <div className="lists-paper-actions">
                          <button className="lists-paper-edit-btn" onClick={(e) => { e.stopPropagation(); onEditPaper?.(paper); }} title={isEnglish ? 'Edit note and tags' : 'Editar nota y etiquetas'}>
                            <Pencil size={17} />
                          </button>
                          <button
                            className="lists-paper-unmark-btn"
                            onClick={(e) => {
                              if (list.id === '__read__') {
                                handleUnmarkAsRead(e, paperId);
                              } else if (list.id === '__favorites__') {
                                handleUnlike(e, paperId, paper);
                              } else if (list.id === '__read_later__') {
                                e.stopPropagation();
                                toggleReadLater(paper);
                              } else {
                                handleRemoveFromCustomList(e, list.id, paperId);
                              }
                            }}
                            title={isEnglish ? 'Remove from list' : 'Quitar de la lista'}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {(!list.paperIds || list.paperIds.length === 0) && (
                    <p className="lists-empty-text">{isEnglish ? 'This list is empty' : 'Esta lista está vacía'}</p>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      ) : displayLists.length === 0 ? (
        <div className="lists-empty-state">
          <div className="lists-empty-state-icon">📚</div>
          <h3>{isEnglish ? 'You do not have any lists yet' : 'Aún no tienes listas'}</h3>
          <p>{isEnglish
            ? 'Save papers or mark them as read to organize them here.'
            : 'Guarda papers o marca algunos como leídos para organizarlos aquí.'}</p>
        </div>
      ) : (
        <div className="lists-grid">
          {displayLists.map((list, idx) => (
            <div key={list.id} className="list-card glass" onClick={() => openList(list)} style={{ '--stagger-index': idx }}>
              <div className="list-card-top">
                <span className="list-card-emoji">
                  {(() => {
                    const Icon = getIcon(list.emoji);
                    return <Icon size={32} strokeWidth={1.5} />;
                  })()}
                </span>
                {!['__favorites__', '__read__', '__read_later__'].includes(list.id) && (
                  <button className="list-card-delete" onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id); }}
                    title={isEnglish ? 'Delete list' : 'Eliminar lista'}>✕</button>
                )}
              </div>
              <h3 className="list-card-name">{list.name}</h3>
              <span className="list-card-count">{list.paperIds?.length || 0} papers</span>
              {list.paperIds?.some((paperId) => getPaper(paperId)) && (
                <div className="list-card-preview">
                  {list.paperIds
                    .map((paperId) => getPaper(paperId))
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((paper) => <p key={paper.id} className="list-card-preview-title">{paper.title}</p>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
