import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  Bookmark,
  Building2,
  BriefcaseBusiness,
  Camera,
  ChevronRight,
  FlaskConical,
  GraduationCap,
  LoaderCircle,
  LogOut,
  Mail,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFollowing } from '../../context/FollowingContext';
import { useEmailNotifications } from '../../context/EmailNotificationsContext';
import { AI_EXPLANATION_LEVELS } from '../../services/aiExplanationService';
import { CATEGORIES } from '../../data/categories';
import { prepareProfileImage } from '../../utils/profileImage';
import EditInterestsModal from './EditInterestsModal';
import EmailNotificationModal from '../Following/EmailNotificationModal';
import './SettingsPage.css';

const LEVEL_DETAILS = {
  beginner: {
    description: 'Lenguaje claro y contexto desde cero',
    Icon: BookOpen,
  },
  university: {
    description: 'Rigor académico sin asumir especialización',
    Icon: GraduationCap,
  },
  researcher: {
    description: 'Métodos, límites y detalle técnico',
    Icon: FlaskConical,
  },
};

const FOLLOW_SUMMARY = [
  { type: 'author', label: 'Autores', Icon: UserRound },
  { type: 'topic', label: 'Temas', Icon: Tag },
  { type: 'institution', label: 'Instituciones', Icon: Building2 },
  { type: 'project', label: 'Proyectos', Icon: BriefcaseBusiness },
];

function emailStatus(preferences, health, loading) {
  if (loading) return { label: 'Comprobando', description: 'Cargando tu configuración de correo', tone: 'neutral' };
  if (!health.available) {
    return {
      label: 'No disponible',
      description: 'El servicio de correo no responde en este momento',
      tone: 'warning',
    };
  }
  if (!preferences.enabled) {
    return {
      label: 'Desactivado',
      description: `Los avisos no se enviarán a ${preferences.email || 'tu correo'}`,
      tone: 'neutral',
    };
  }
  return {
    label: 'Activado',
    description: `${preferences.frequency === 'weekly' ? 'Cada lunes' : 'Cada mañana'} · hasta ${preferences.maxPapers || 5} papers`,
    tone: 'success',
  };
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const profileInputRef = useRef(null);
  const {
    user,
    userPreferences,
    readingPreferences,
    profilePhoto,
    updateReadingPreferences,
    updateProfilePhoto,
    signOut,
  } = useAuth();
  const {
    followedEntities,
    followedByType,
    loading: followingLoading,
  } = useFollowing();
  const {
    preferences: notificationPreferences,
    health: notificationHealth,
    loading: notificationsLoading,
  } = useEmailNotifications();
  const [isInterestsOpen, setIsInterestsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [savingLevel, setSavingLevel] = useState(null);
  const [levelFeedback, setLevelFeedback] = useState(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState(null);

  const selectedAreas = useMemo(() => {
    const selected = new Set(userPreferences || []);
    return Object.entries(CATEGORIES)
      .map(([id, area]) => {
        const count = Object.keys(area.subcategories).filter(key => selected.has(key)).length;
        return count > 0 ? { id, label: area.label, count } : null;
      })
      .filter(Boolean);
  }, [userPreferences]);

  const selectedInterestCount = Array.isArray(userPreferences) ? userPreferences.length : 0;
  const notificationStatus = emailStatus(
    notificationPreferences,
    notificationHealth,
    notificationsLoading,
  );
  const visibleProfilePhoto = profilePhoto || user?.photoURL;

  useEffect(() => {
    if (levelFeedback !== 'saved') return undefined;
    const timer = window.setTimeout(() => setLevelFeedback(null), 1_800);
    return () => window.clearTimeout(timer);
  }, [levelFeedback]);

  useEffect(() => {
    if (photoFeedback?.tone !== 'success') return undefined;
    const timer = window.setTimeout(() => setPhotoFeedback(null), 2_400);
    return () => window.clearTimeout(timer);
  }, [photoFeedback]);

  const handleLevelChange = async (level) => {
    if (level === readingPreferences.aiExplanationLevel || savingLevel) return;
    setSavingLevel(level);
    setLevelFeedback(null);
    try {
      await updateReadingPreferences({ aiExplanationLevel: level });
      setLevelFeedback('saved');
    } catch {
      setLevelFeedback('error');
    } finally {
      setSavingLevel(null);
    }
  };

  const handlePhotoSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || savingPhoto) return;

    setSavingPhoto(true);
    setPhotoFeedback(null);
    try {
      const preparedPhoto = await prepareProfileImage(file);
      await updateProfilePhoto(preparedPhoto);
      setPhotoFeedback({ tone: 'success', text: 'Foto de perfil actualizada.' });
    } catch (error) {
      setPhotoFeedback({
        tone: 'error',
        text: error?.message || 'No se pudo guardar la foto de perfil.',
      });
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleRestorePhoto = async () => {
    if (!profilePhoto || savingPhoto) return;
    setSavingPhoto(true);
    setPhotoFeedback(null);
    try {
      await updateProfilePhoto(null);
      setPhotoFeedback({
        tone: 'success',
        text: user?.photoURL ? 'Se ha restaurado tu foto de Google.' : 'Foto de perfil eliminada.',
      });
    } catch {
      setPhotoFeedback({ tone: 'error', text: 'No se pudo restaurar la foto de perfil.' });
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <>
      <main className="settings-page">
        <div className="settings-shell">
          <header className="settings-heading">
            <span>Ajustes de usuario</span>
            <h1>Configuración</h1>
            <p>Tu cuenta, tus preferencias de descubrimiento y tus herramientas de lectura.</p>
          </header>

          <section className="settings-profile" aria-labelledby="settings-account-title">
            <div className="settings-profile-avatar">
              {visibleProfilePhoto ? (
                <img src={visibleProfilePhoto} alt="" referrerPolicy="no-referrer" />
              ) : (
                <div className="settings-profile-fallback" aria-hidden="true">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              {savingPhoto && (
                <span className="settings-profile-loading" aria-hidden="true">
                  <LoaderCircle size={22} />
                </span>
              )}
            </div>

            <div className="settings-profile-copy">
              <small>Cuenta</small>
              <h2 id="settings-account-title">{user?.displayName || 'Usuario de PaperTok'}</h2>
              <p>{user?.email}</p>
              <span><ShieldCheck size={14} /> Cuenta gestionada con Google</span>
            </div>

            <div className="settings-profile-actions">
              <input
                ref={profileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handlePhotoSelect}
                tabIndex={-1}
                aria-hidden="true"
              />
              <button
                type="button"
                className="settings-photo-button"
                disabled={savingPhoto}
                onClick={() => profileInputRef.current?.click()}
              >
                <Camera size={17} />
                Cambiar foto
              </button>
              {profilePhoto && (
                <button
                  type="button"
                  className="settings-photo-restore"
                  disabled={savingPhoto}
                  onClick={handleRestorePhoto}
                  aria-label={user?.photoURL ? 'Restaurar foto de Google' : 'Quitar foto de perfil'}
                  title={user?.photoURL ? 'Restaurar foto de Google' : 'Quitar foto de perfil'}
                >
                  <RotateCcw size={17} />
                </button>
              )}
            </div>

            <p
              className={`settings-photo-feedback ${photoFeedback ? `is-${photoFeedback.tone}` : ''}`}
              role="status"
              aria-live="polite"
            >
              {photoFeedback?.text || ''}
            </p>
          </section>

          <section className="settings-section" aria-labelledby="discovery-heading">
            <div className="settings-section-heading">
              <SlidersHorizontal size={18} />
              <div>
                <h2 id="discovery-heading">Descubrimiento</h2>
                <p>Señales que PaperTok utiliza para construir tus feeds.</p>
              </div>
            </div>

            <div className="settings-list">
              <div className="settings-row" style={{ '--settings-index': 0 }}>
                <span className="settings-row-icon is-purple"><UsersRound size={20} /></span>
                <div className="settings-row-content">
                  <h3>Contenido seguido</h3>
                  <p>
                    {followingLoading && followedEntities.length === 0
                      ? 'Cargando tus seguimientos...'
                      : `${followedEntities.length} ${followedEntities.length === 1 ? 'entidad seguida' : 'entidades seguidas'} influyen en tus recomendaciones`}
                  </p>
                  <div className="settings-follow-summary" aria-label="Resumen de contenido seguido">
                    {FOLLOW_SUMMARY.map(({ type, label, Icon }) => (
                      <span key={type}>
                        <Icon size={12} />
                        {label}
                        <strong>{followedByType[type]?.length || 0}</strong>
                      </span>
                    ))}
                  </div>
                </div>
                <button className="settings-row-action" onClick={() => navigate('/settings/following')}>
                  Ver todo <ChevronRight size={17} />
                </button>
              </div>

              <div className="settings-row" style={{ '--settings-index': 1 }}>
                <span className="settings-row-icon is-green"><SlidersHorizontal size={20} /></span>
                <div className="settings-row-content">
                  <h3>Intereses científicos</h3>
                  <p>
                    {selectedInterestCount}{' '}
                    {selectedInterestCount === 1 ? 'subcategoría seleccionada' : 'subcategorías seleccionadas'} para entrenar tu feed
                  </p>
                  {selectedAreas.length > 0 && (
                    <div className="settings-interest-summary" aria-label="Áreas seleccionadas">
                      {selectedAreas.map(area => (
                        <span key={area.id}>{area.label} <small>{area.count}</small></span>
                      ))}
                    </div>
                  )}
                </div>
                <button className="settings-row-action" onClick={() => setIsInterestsOpen(true)}>
                  Editar <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="reading-heading">
            <div className="settings-section-heading">
              <Sparkles size={18} />
              <div>
                <h2 id="reading-heading">Lectura e IA</h2>
                <p>Ajusta el nivel de profundidad de tus explicaciones.</p>
              </div>
            </div>

            <div className="settings-list">
              <div className="settings-row settings-row--levels" style={{ '--settings-index': 2 }}>
                <span className="settings-row-icon is-purple"><Sparkles size={20} /></span>
                <div className="settings-row-content">
                  <h3>Nivel predeterminado de IA</h3>
                  <p>Se abrirá seleccionado cuando pidas que la IA explique un paper</p>
                  <span className={`settings-save-feedback ${levelFeedback ? `is-${levelFeedback}` : ''}`} aria-live="polite">
                    {savingLevel && 'Guardando...'}
                    {!savingLevel && levelFeedback === 'saved' && 'Preferencia guardada'}
                    {!savingLevel && levelFeedback === 'error' && 'No se pudo guardar'}
                  </span>
                </div>
                <div className="settings-levels" role="radiogroup" aria-label="Nivel predeterminado de explicación">
                  {AI_EXPLANATION_LEVELS.map(({ id, label }) => {
                    const { description, Icon } = LEVEL_DETAILS[id];
                    const active = readingPreferences.aiExplanationLevel === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={active ? 'is-active' : ''}
                        disabled={Boolean(savingLevel)}
                        onClick={() => handleLevelChange(id)}
                      >
                        <Icon size={18} />
                        <span><strong>{label}</strong><small>{description}</small></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="notifications-heading">
            <div className="settings-section-heading">
              <Bell size={18} />
              <div>
                <h2 id="notifications-heading">Notificaciones</h2>
                <p>Decide si quieres recibir novedades aunque PaperTok esté cerrado.</p>
              </div>
            </div>

            <div className="settings-list">
              <div className="settings-row" style={{ '--settings-index': 3 }}>
                <span className="settings-row-icon is-amber"><Mail size={20} /></span>
                <div className="settings-row-content">
                  <div className="settings-row-title-line">
                    <h3>Novedades por email</h3>
                    <span className={`settings-status is-${notificationStatus.tone}`}>
                      {notificationStatus.label}
                    </span>
                  </div>
                  <p>{notificationStatus.description}</p>
                </div>
                <button className="settings-row-action" onClick={() => setIsNotificationsOpen(true)}>
                  Configurar <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="library-heading">
            <div className="settings-section-heading">
              <Bookmark size={18} />
              <div>
                <h2 id="library-heading">Biblioteca</h2>
                <p>Accede a tus papers guardados, notas e historial de lectura.</p>
              </div>
            </div>

            <div className="settings-list">
              <div className="settings-row" style={{ '--settings-index': 4 }}>
                <span className="settings-row-icon is-cyan"><Bookmark size={20} /></span>
                <div className="settings-row-content">
                  <h3>Mis listas</h3>
                  <p>Favoritos, leer después, historial y colecciones personalizadas</p>
                </div>
                <button className="settings-row-action" onClick={() => navigate('/lists')}>
                  Abrir <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </section>

          <section className="settings-section settings-section--session" aria-labelledby="session-heading">
            <div className="settings-section-heading">
              <UserRound size={18} />
              <div>
                <h2 id="session-heading">Sesión</h2>
                <p>La información personalizada permanece asociada a esta cuenta.</p>
              </div>
            </div>
            <button className="settings-signout" onClick={handleSignOut}>
              <LogOut size={18} /> Cerrar sesión
            </button>
          </section>
        </div>
      </main>

      <EditInterestsModal
        isOpen={isInterestsOpen}
        onClose={() => setIsInterestsOpen(false)}
      />
      <EmailNotificationModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />
    </>
  );
}
