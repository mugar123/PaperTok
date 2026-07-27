import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  Bookmark,
  ChevronRight,
  FlaskConical,
  GraduationCap,
  LogOut,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useEmailNotifications } from '../../context/EmailNotificationsContext';
import { AI_EXPLANATION_LEVELS } from '../../services/aiExplanationService';
import { CATEGORIES } from '../../data/categories';
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
  const {
    user,
    userPreferences,
    readingPreferences,
    updateReadingPreferences,
    signOut,
  } = useAuth();
  const {
    preferences: notificationPreferences,
    health: notificationHealth,
    loading: notificationsLoading,
  } = useEmailNotifications();
  const [isInterestsOpen, setIsInterestsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [savingLevel, setSavingLevel] = useState(null);
  const [levelFeedback, setLevelFeedback] = useState(null);

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

  useEffect(() => {
    if (levelFeedback !== 'saved') return undefined;
    const timer = window.setTimeout(() => setLevelFeedback(null), 1_800);
    return () => window.clearTimeout(timer);
  }, [levelFeedback]);

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
            <h1>Tu experiencia en PaperTok</h1>
            <p>Controla cómo se personaliza tu feed, tus explicaciones y tus avisos.</p>
          </header>

          <section className="settings-profile" aria-labelledby="settings-account-title">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <div className="settings-profile-fallback" aria-hidden="true">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div>
              <h2 id="settings-account-title">{user?.displayName || 'Usuario de PaperTok'}</h2>
              <p>{user?.email}</p>
              <span><ShieldCheck size={14} /> Cuenta gestionada con Google</span>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="personalization-heading">
            <div className="settings-section-heading">
              <SlidersHorizontal size={18} />
              <div>
                <h2 id="personalization-heading">Personalización</h2>
                <p>Estas preferencias influyen directamente en lo que ves y cómo lo lees.</p>
              </div>
            </div>

            <div className="settings-list">
              <div className="settings-row" style={{ '--settings-index': 0 }}>
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

              <div className="settings-row settings-row--levels" style={{ '--settings-index': 1 }}>
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
              <div className="settings-row" style={{ '--settings-index': 2 }}>
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
              <div className="settings-row" style={{ '--settings-index': 3 }}>
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
