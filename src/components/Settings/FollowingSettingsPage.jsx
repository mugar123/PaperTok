import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Building2,
  BriefcaseBusiness,
  ChevronRight,
  Compass,
  LoaderCircle,
  Tag,
  UserMinus,
  UserRound,
} from 'lucide-react';
import { useFollowing } from '../../context/FollowingContext';
import { getFollowedEntityPath } from '../../utils/followingNavigation';
import './FollowingSettingsPage.css';

const FOLLOW_TABS = [
  { type: 'author', label: 'Autores', singular: 'autor', Icon: UserRound },
  { type: 'topic', label: 'Temas', singular: 'tema', Icon: Tag },
  { type: 'institution', label: 'Instituciones', singular: 'institución', Icon: Building2 },
  { type: 'project', label: 'Proyectos', singular: 'proyecto', Icon: BriefcaseBusiness },
];

const SOURCE_LABELS = {
  openalex: 'OpenAlex',
  openaire: 'OpenAIRE',
  papertok: 'PaperTok',
  legacy: 'Perfil anterior',
};

export default function FollowingSettingsPage() {
  const navigate = useNavigate();
  const {
    followedEntities,
    followedByType,
    loading,
    isFollowPending,
    toggleFollow,
  } = useFollowing();
  const [selectedType, setSelectedType] = useState(null);
  const [actionError, setActionError] = useState('');

  const activeType = selectedType
    || FOLLOW_TABS.find(tab => followedByType[tab.type]?.length > 0)?.type
    || 'author';
  const activeTab = FOLLOW_TABS.find(tab => tab.type === activeType) || FOLLOW_TABS[0];
  const visibleEntities = useMemo(
    () => [...(followedByType[activeType] || [])]
      .sort((left, right) => left.displayName.localeCompare(right.displayName, 'es')),
    [activeType, followedByType],
  );

  const handleUnfollow = async (entity) => {
    setActionError('');
    try {
      await toggleFollow(entity);
    } catch {
      setActionError(`No se pudo dejar de seguir a ${entity.displayName}.`);
    }
  };

  return (
    <main className="following-settings-page">
      <div className="following-settings-shell">
        <header className="following-settings-header">
          <button
            className="following-settings-back"
            type="button"
            onClick={() => navigate('/settings')}
            aria-label="Volver a configuración"
            title="Volver a configuración"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <span>Preferencias de descubrimiento</span>
            <h1>Lo que sigues</h1>
            <p>
              {loading && followedEntities.length === 0
                ? 'Cargando tus seguimientos...'
                : `${followedEntities.length} ${followedEntities.length === 1 ? 'seguimiento influye' : 'seguimientos influyen'} en tus recomendaciones.`}
            </p>
          </div>
        </header>

        <nav className="following-settings-tabs" aria-label="Tipos de contenido seguido">
          {FOLLOW_TABS.map(({ type, label, Icon }) => {
            const count = followedByType[type]?.length || 0;
            const active = activeType === type;
            return (
              <button
                key={type}
                type="button"
                className={active ? 'is-active' : ''}
                aria-current={active ? 'page' : undefined}
                onClick={() => setSelectedType(type)}
              >
                <Icon size={18} />
                <span>{label}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </nav>

        <p className="following-settings-feedback" role="status" aria-live="polite">
          {actionError}
        </p>

        {loading && followedEntities.length === 0 ? (
          <div className="following-settings-loading" role="status">
            <LoaderCircle size={24} />
            <span>Cargando {activeTab.label.toLowerCase()}...</span>
          </div>
        ) : visibleEntities.length > 0 ? (
          <motion.section
            key={activeType}
            className="following-settings-list"
            aria-label={activeTab.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {visibleEntities.map((entity) => {
                const Icon = activeTab.Icon;
                const pending = isFollowPending(entity);
                return (
                  <motion.article
                    layout
                    key={entity.followKey || `${entity.type}:${entity.canonicalId}`}
                    className="following-settings-item"
                    initial={{ opacity: 0, y: 7 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 18, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Link to={getFollowedEntityPath(entity)} className="following-settings-link">
                      <span className={`following-settings-entity-icon is-${entity.type}`}>
                        <Icon size={20} />
                      </span>
                      <span className="following-settings-entity-copy">
                        <strong>{entity.displayName}</strong>
                        <small>
                          {activeTab.singular.charAt(0).toUpperCase() + activeTab.singular.slice(1)}
                          {' · '}
                          {SOURCE_LABELS[entity.source] || 'PaperTok'}
                        </small>
                      </span>
                      <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                    <button
                      type="button"
                      className="following-settings-unfollow"
                      disabled={pending}
                      onClick={() => handleUnfollow(entity)}
                      aria-label={`Dejar de seguir ${entity.displayName}`}
                      title={`Dejar de seguir ${entity.displayName}`}
                    >
                      {pending ? <LoaderCircle size={18} /> : <UserMinus size={18} />}
                    </button>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </motion.section>
        ) : (
          <motion.section
            key={`empty-${activeType}`}
            className="following-settings-empty"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Compass size={28} />
            <h2>No sigues ningún {activeTab.singular}</h2>
            <p>Los que sigas aparecerán aquí y ayudarán a personalizar tus feeds.</p>
            <button type="button" onClick={() => navigate('/search')}>
              Explorar PaperTok
            </button>
          </motion.section>
        )}
      </div>
    </main>
  );
}
