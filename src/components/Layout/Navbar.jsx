import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFeed } from '../../context/FeedContext';
import { useFollowingUpdates } from '../../context/FollowingUpdatesContext';
import { Bookmark, LogOut, Settings2, RotateCw, Search } from 'lucide-react';
import './Navbar.css';

export default function Navbar() {
  const { user, profilePhoto, signOut } = useAuth();
  const { feedMode, setFeedMode, refreshFeed, isRefreshing } = useFeed();
  const { refresh: refreshFollowing, refreshing: isFollowingRefreshing } = useFollowingUpdates();
  const navigate = useNavigate();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [isReportRefreshing, setIsReportRefreshing] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const onStart = () => setIsReportRefreshing(true);
    const onEnd = () => setIsReportRefreshing(false);
    window.addEventListener('reportLoadingStart', onStart);
    window.addEventListener('reportLoadingEnd', onEnd);
    return () => {
      window.removeEventListener('reportLoadingStart', onStart);
      window.removeEventListener('reportLoadingEnd', onEnd);
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isFollowingActive = location.pathname === '/following';
  const isResearchActive = location.pathname === '/research' || location.pathname === '/report';
  const isHomeActive = location.pathname === '/';

  let sliderTransform = 'translateX(0)';
  if (isResearchActive) {
    sliderTransform = 'translateX(100%)';
  } else if (isFollowingActive) {
    sliderTransform = 'translateX(200%)';
  }

  const showReloadButton = isHomeActive || isResearchActive || isFollowingActive;
  const reloadSpinning = (isHomeActive && isRefreshing)
    || (isResearchActive && isReportRefreshing)
    || (isFollowingActive && isFollowingRefreshing);

  const handleReload = () => {
    if (isHomeActive) refreshFeed();
    else if (isResearchActive) window.dispatchEvent(new Event('refreshScientificReport'));
    else if (isFollowingActive) refreshFollowing();
  };

  return (
    <>
      <nav className="navbar glass-strong">
        <div className="navbar-left">
          {showReloadButton && (
            <button
              className={`navbar-action-btn ${reloadSpinning ? 'spinning' : ''}`}
              onClick={handleReload}
              title="Recargar"
            >
              <RotateCw size={20} />
            </button>
          )}
        </div>

        <div className="navbar-center-pill">
          <button
            className={`navbar-tab ${isHomeActive && feedMode === 'top' ? 'active' : ''}`}
            onClick={() => {
              if (location.pathname !== '/') navigate('/');
              setFeedMode('top');
            }}
          >
            Para ti
          </button>

          <NavLink
            to="/research"
            className={`navbar-tab ${isResearchActive ? 'active' : ''}`}
          >
            Research
          </NavLink>

          <NavLink
            to="/following"
            className={`navbar-tab ${isFollowingActive ? 'active' : ''}`}
          >
            Siguiendo
          </NavLink>

          {/* Slider indicator */}
          <div
            className={`navbar-slider ${!isHomeActive && !isResearchActive && !isFollowingActive ? 'is-hidden' : ''}`}
            style={{
              transform: sliderTransform
            }}
          />
        </div>

        <div className="navbar-right">
          <button
            className="navbar-action-btn"
            onClick={() => navigate('/search')}
            title="Buscar"
          >
            <Search size={20} />
          </button>

          {user && (
            <div className="navbar-profile" ref={dropdownRef}>
              <button
                className={`navbar-avatar-btn ${location.pathname === '/settings' ? 'active' : ''}`}
                aria-label="Abrir menú de usuario"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDropdown(!showDropdown);
                }}
              >
                {profilePhoto || user.photoURL ? (
                  <img src={profilePhoto || user.photoURL} alt="Profile" className="navbar-avatar" referrerPolicy="no-referrer" />
                ) : (
                  <div className="navbar-avatar navbar-avatar--fallback">
                    {user.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
              </button>

              {showDropdown && (
                <div className="navbar-dropdown">
                  <div className="navbar-dropdown-header">
                    <p className="navbar-dropdown-name">{user?.displayName}</p>
                    <p className="navbar-dropdown-email">{user?.email}</p>
                  </div>
                  <div className="navbar-dropdown-divider" />
                  <button
                    className="navbar-dropdown-item"
                    onClick={() => { navigate('/lists'); setShowDropdown(false); }}
                  >
                    <Bookmark size={16} strokeWidth={2} style={{ display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '8px' }} />
                    Mis listas
                  </button>
                  <button
                    className="navbar-dropdown-item"
                    onClick={() => { navigate('/settings'); setShowDropdown(false); }}
                  >
                    <Settings2 size={16} strokeWidth={2} style={{ display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '8px' }} />
                    Ajustes
                  </button>
                  <button
                    className="navbar-dropdown-item navbar-dropdown-item--danger"
                    onClick={handleSignOut}
                  >
                    <LogOut size={16} strokeWidth={2} style={{ display: 'inline-block', verticalAlign: 'text-bottom', marginRight: '8px' }} />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

    </>
  );
}
