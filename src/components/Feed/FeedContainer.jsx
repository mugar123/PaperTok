import { useRef, useEffect, useLayoutEffect, useCallback, useMemo, useState } from 'react';
import { useFeed } from '../../context/FeedContext';

import PaperCard from './PaperCard';
import SkeletonCard from './SkeletonCard';
import AnimatedAtom from './AnimatedAtom';
import {
  accumulateWheelGesture,
  shouldUseNativeWheelScroll,
} from '../../utils/wheelNavigation';
import './FeedContainer.css';

// Per-surface scroll memory: the Siguiendo feed shares this container with
// Para ti and must not clobber its saved position.
const savedScrollByKey = {};
const WHEEL_GESTURE_RESET_MS = 180;
const SCROLL_IDLE_DELAY_MS = 120;

/**
 * `source` swaps WHERE the papers come from while every interaction (like,
 * save, read, view tracking) keeps flowing into the recommendation profile
 * through useFeed. Shape: { papers, loading, error, hasMore, loadMore,
 * refresh, isRefreshing, emptyState, showFollowReason, onPaperViewed }.
 */
export default function FeedContainer({ onOpenPdf, onSaveToList, source = null, scrollKey = 'forYou' }) {
  const feed = useFeed();
  const {
    trackPdfOpened,
    likedPaperIds, savedPaperIds, readPaperIds, toggleLike, markNotInterested, markAsRead, trackViewTime, trackSkip
  } = feed;
  const papers = source ? source.papers : feed.papers;
  const loading = source ? source.loading : feed.loading;
  const error = source ? source.error : feed.error;
  const hasMore = source ? Boolean(source.hasMore) : feed.hasMore;
  const loadMore = useMemo(
    () => (source ? (source.loadMore || (() => {})) : feed.loadMore),
    [source, feed.loadMore],
  );
  const refreshFeed = useMemo(
    () => (source ? (source.refresh || (() => {})) : feed.refreshFeed),
    [source, feed.refreshFeed],
  );
  const isRefreshing = source ? Boolean(source.isRefreshing) : feed.isRefreshing;

  const handleViewTime = useCallback((paper, seconds) => {
    source?.onPaperViewed?.(paper);
    trackViewTime(paper, seconds);
  }, [source, trackViewTime]);
  const handleSkip = useCallback((paper) => {
    source?.onPaperViewed?.(paper);
    trackSkip(paper);
  }, [source, trackSkip]);
  const feedRef = useRef(null);
  const sentinelRef = useRef(null);
  const [showLoader, setShowLoader] = useState(false);
  const scrollIdleTimerRef = useRef(null);
  const getInteractionState = useCallback((paper) => ({
    isLiked: likedPaperIds.has(paper.id),
    isSaved: savedPaperIds.has(paper.id),
    isRead: readPaperIds?.has(paper.id),
  }), [likedPaperIds, readPaperIds, savedPaperIds]);

  // Restore scroll position instantly before browser paints. Must run only once
  // per mount: re-assigning scrollTop on later papers.length changes (infinite
  // scroll appends) cancels any in-flight momentum and makes scrolling stutter.
  const restoreAttemptedRef = useRef(false);
  useLayoutEffect(() => {
    if (restoreAttemptedRef.current || papers.length === 0) return;
    restoreAttemptedRef.current = true;
    if (feedRef.current && (savedScrollByKey[scrollKey] || 0) > 0) {
      const el = feedRef.current;
      const prevBehavior = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto'; // Force instant jump
      el.scrollTop = savedScrollByKey[scrollKey];

      requestAnimationFrame(() => {
        el.style.scrollBehavior = prevBehavior;
      });
    }
  }, [papers.length, scrollKey]);

  // Only show the atom loader if loading takes more than 1.5s
  useEffect(() => {
    if (papers.length === 0 && loading && !error) {
      const timer = setTimeout(() => setShowLoader(true), 1500);
      return () => clearTimeout(timer);
    }
    const hideTimer = setTimeout(() => setShowLoader(false), 0);
    return () => clearTimeout(hideTimer);
  }, [papers.length, loading, error]);

  // Scroll to top when feed is refreshed manually or mode changes
  useEffect(() => {
    if (isRefreshing && feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isRefreshing]);

  useEffect(() => () => {
    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
  }, []);

  // Infinite scroll: observe sentinel element
  useEffect(() => {
    const root = feedRef.current;
    if (!sentinelRef.current || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      {
        root,
        rootMargin: '0px 0px 500% 0px',
        threshold: 0,
      }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  const isScrollingRef = useRef(false);
  const wheelDeltaRef = useRef(0);
  const wheelResetTimerRef = useRef(null);

  // Implement mouse wheel scroll snapping on desktop
  useEffect(() => {
    const container = feedRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const nestedScroller = e.target instanceof Element ? e.target.closest('.pc-abstract--open') : null;
      if (nestedScroller) {
        const canScrollDown = e.deltaY > 0 && nestedScroller.scrollTop + nestedScroller.clientHeight < nestedScroller.scrollHeight - 1;
        const canScrollUp = e.deltaY < 0 && nestedScroller.scrollTop > 1;
        if (canScrollDown || canScrollUp) return;
      }

      // Trackpads provide pixel-precise, finger-following scrolling. Let the browser
      // handle their momentum instead of competing with it through scrollTo().
      if (shouldUseNativeWheelScroll(e.deltaMode)) {
        return;
      }

      e.preventDefault();

      // If currently scrolling/transitioning, lock wheel
      if (isScrollingRef.current) {
        return;
      }

      const deltaMultiplier = e.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? container.clientHeight
          : 1;
      const normalizedDelta = e.deltaY * deltaMultiplier;
      const gesture = accumulateWheelGesture(wheelDeltaRef.current, normalizedDelta);
      wheelDeltaRef.current = gesture.accumulatedDelta;

      if (wheelResetTimerRef.current) clearTimeout(wheelResetTimerRef.current);
      wheelResetTimerRef.current = setTimeout(() => {
        wheelDeltaRef.current = 0;
      }, WHEEL_GESTURE_RESET_MS);

      if (!gesture.direction) return;

      const direction = gesture.direction;
      const cardHeight = container.clientHeight;
      const currentScroll = container.scrollTop;
      const currentIndex = Math.round(currentScroll / cardHeight);
      const nextIndex = currentIndex + direction;

      if (nextIndex >= 0 && nextIndex < papers.length + (loading ? 1 : 0)) {
        isScrollingRef.current = true;
        container.scrollTo({
          top: nextIndex * cardHeight,
          behavior: 'smooth'
        });

        setTimeout(() => {
          isScrollingRef.current = false;
        }, 700);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (wheelResetTimerRef.current) clearTimeout(wheelResetTimerRef.current);
    };
  }, [papers.length, loading]);

  // Implement keyboard arrow navigation on desktop
  useEffect(() => {
    const handleKeyDown = (e) => {
      const container = feedRef.current;
      if (!container) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (isScrollingRef.current) return;

        const direction = e.key === 'ArrowDown' ? 1 : -1;
        const cardHeight = container.clientHeight;
        const currentScroll = container.scrollTop;
        const currentIndex = Math.round(currentScroll / cardHeight);
        const nextIndex = currentIndex + direction;

        if (nextIndex >= 0 && nextIndex < papers.length + (loading ? 1 : 0)) {
          isScrollingRef.current = true;
          container.scrollTo({
            top: nextIndex * cardHeight,
            behavior: 'smooth'
          });

          setTimeout(() => {
            isScrollingRef.current = false;
          }, 700);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [papers.length, loading]);

  const handleRefresh = useCallback(() => {
    refreshFeed();
  }, [refreshFeed]);

  const handleOpenPdf = useCallback((paper) => {
    trackPdfOpened(paper);
    onOpenPdf(paper);
  }, [onOpenPdf, trackPdfOpened]);

  const handleSaveToList = useCallback((paper) => {
    onSaveToList(paper);
  }, [onSaveToList]);

  const handleScroll = useCallback((event) => {
    const container = event.currentTarget;
    savedScrollByKey[scrollKey] = container.scrollTop;
    container.classList.add('feed-container--scrolling');

    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = setTimeout(() => {
      container.classList.remove('feed-container--scrolling');
    }, SCROLL_IDLE_DELAY_MS);
  }, [scrollKey]);

  if (error && papers.length === 0) {
    return (
      <div className="feed-empty">
        <div className="feed-empty-icon">⚠️</div>
        <h2>Error cargando papers</h2>
        <p>{error}</p>
        <button className="feed-retry-btn" onClick={handleRefresh}>
          Reintentar
        </button>
      </div>
    );
  }

  if (papers.length === 0 && !error) {
    if (loading && !showLoader && !isRefreshing) {
      return (
        <div className="feed-wrapper">
          <div className="feed-container">
            <div className="feed-snap-item"><SkeletonCard /></div>
          </div>
        </div>
      );
    }
    // Alternative sources bring their own empty state; Siguiendo must never
    // fall back to the generic "amplía tus intereses" copy of Para ti.
    if (source?.emptyState && !loading && !isRefreshing) {
      return <div className="feed-empty">{source.emptyState}</div>;
    }
    return (
      <div className="feed-empty">
        <div className="atom-loader">
          <AnimatedAtom size={80} strokeWidth={1} className="atom-loader-icon" />
        </div>
        <h2>{loading || isRefreshing ? 'Sintetizando papers...' : 'Buscando descubrimientos...'}</h2>
        <p>{loading || isRefreshing ? 'Conectando con las fuentes para traer lo último en ciencia' : 'Aún no hay papers en tus categorías. Prueba a ampliar tus intereses.'}</p>
        {!loading && (
          <button className="feed-retry-btn" onClick={handleRefresh}>
            Explorar de nuevo
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="feed-wrapper">
      <div className="feed-container" ref={feedRef} onScroll={handleScroll}>
        {papers.map((paper) => (
          <div key={paper.id} className="feed-snap-item">
            <PaperCard
              paper={paper}
              isLiked={likedPaperIds.has(paper.id)}
              isSaved={savedPaperIds.has(paper.id)}
              isRead={readPaperIds?.has(paper.id)}
              onLike={toggleLike}
              onNotInterested={markNotInterested}
              onMarkAsRead={markAsRead}
              trackViewTime={handleViewTime}
              trackSkip={handleSkip}
              onOpenPdf={handleOpenPdf}
              onSaveToList={handleSaveToList}
              getInteractionState={getInteractionState}
              showFollowReason={Boolean(source?.showFollowReason)}
            />
          </div>
        ))}

        {loading && (
          <div className="feed-snap-item">
            <SkeletonCard />
          </div>
        )}

        {/* Sentinel for infinite scroll */}
        {hasMore && <div ref={sentinelRef} className="feed-sentinel" />}
      </div>
    </div>
  );
}
