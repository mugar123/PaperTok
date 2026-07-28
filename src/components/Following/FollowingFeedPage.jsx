import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, CheckCheck, Search } from 'lucide-react';
import FeedContainer from '../Feed/FeedContainer';
import { useFollowing } from '../../context/FollowingContext';
import { useFollowingUpdates } from '../../context/FollowingUpdatesContext';
import { orderFollowingFeedPapers } from '../../utils/followingFeed';
import './FollowingFeedPage.css';

/**
 * The Siguiendo feed: the exact Para ti experience (vertical cards, gestures,
 * actions, AI explanation) fed EXCLUSIVELY with papers proven to belong to a
 * followed author, topic, institution or project. Content selection lives in
 * followingUpdatesService (stable-id matching, dedupe across entities); this
 * page applies one relevance-and-diversity ranking across every follow and
 * hands it to the shared container, so no feed mechanics are duplicated.
 */
export default function FollowingFeedPage({ onOpenPdf, onSaveToList }) {
  const navigate = useNavigate();
  const { followedEntities } = useFollowing();
  const { items, seenIds, loading, refreshing, error, refresh, markSeen } = useFollowingUpdates();

  // Ranking captures the seen-set only when the item list itself changes:
  // marking cards as seen mid-scroll must never reshuffle under the thumb.
  const [orderedPapers, setOrderedPapers] = useState([]);
  const lastItemsRef = useRef(null);
  useEffect(() => {
    if (lastItemsRef.current === items) return;
    lastItemsRef.current = items;
    setOrderedPapers(orderFollowingFeedPapers(items, seenIds));
  }, [items, seenIds]);

  const hasFollows = followedEntities.length > 0;

  const emptyState = useMemo(() => hasFollows ? (
    <div className="ff-empty" role="status">
      <CheckCheck size={30} aria-hidden="true" />
      <h2>No hay publicaciones nuevas de tus seguimientos</h2>
      <p>La bandeja recoge trabajos recientes de lo que sigues y se actualizará cuando aparezcan.</p>
      <button className="feed-retry-btn" onClick={() => refresh()}>Buscar novedades</button>
    </div>
  ) : (
    <div className="ff-empty" role="status">
      <BellRing size={30} aria-hidden="true" />
      <h2>Aún no sigues autores, temas, instituciones o proyectos</h2>
      <p>Sigue cualquier entidad desde un paper o desde su página y sus publicaciones aparecerán aquí.</p>
      <div className="ff-empty-actions">
        <button className="feed-retry-btn" onClick={() => navigate('/')}>Descubrir papers</button>
        <button className="feed-retry-btn ff-empty-secondary" onClick={() => navigate('/search')}>
          <Search size={15} aria-hidden="true" /> Buscar entidades
        </button>
      </div>
    </div>
  ), [hasFollows, navigate, refresh]);

  const source = useMemo(() => ({
    papers: orderedPapers,
    loading,
    error: error && orderedPapers.length === 0 ? 'No se han podido consultar tus seguimientos.' : null,
    hasMore: false,
    loadMore: () => {},
    refresh,
    isRefreshing: refreshing,
    emptyState,
    showFollowReason: true,
    onPaperViewed: markSeen,
  }), [orderedPapers, loading, error, refresh, refreshing, emptyState, markSeen]);

  return (
    <FeedContainer
      onOpenPdf={onOpenPdf}
      onSaveToList={onSaveToList}
      source={source}
      scrollKey="following"
    />
  );
}
