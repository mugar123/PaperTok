import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock3, Mail, Send, X } from 'lucide-react';
import { useEmailNotifications } from '../../context/EmailNotificationsContext';
import './EmailNotificationModal.css';

const ERROR_COPY = {
  EMAIL_NOT_CONFIGURED: 'Los avisos por email todavía no están configurados.',
  EMAIL_AUTH_REQUIRED: 'Vuelve a iniciar sesión para configurar los avisos.',
  EMAIL_PROVIDER_AUTH_FAILED: 'Resend ha rechazado la credencial configurada.',
  EMAIL_PROVIDER_LIMIT: 'Se ha alcanzado temporalmente el límite de envío.',
  EMAIL_TEST_RATE_LIMIT: 'Espera un minuto antes de enviar otra prueba.',
  EMAIL_SEND_FAILED: 'No se ha podido enviar el correo de prueba.',
  EMAIL_TIMEOUT: 'El servicio de correo está tardando demasiado.',
  EMAIL_UNAVAILABLE: 'El servicio de correo no está disponible ahora mismo.',
};

export default function EmailNotificationModal({ isOpen, onClose }) {
  const { preferences, health, loading, saving, testing, savePreferences, sendTest } = useEmailNotifications();
  const [draft, setDraft] = useState(preferences);
  const [feedback, setFeedback] = useState(null);
  const preferencesRef = useRef(preferences);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const timeoutId = setTimeout(() => {
      setDraft(preferencesRef.current);
      setFeedback(null);
    }, 0);
    const closeOnEscape = event => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, onClose]);

  const handleSave = async () => {
    setFeedback(null);
    try {
      await savePreferences(draft);
      setFeedback({ type: 'success', text: draft.enabled ? 'Avisos por email activados.' : 'Avisos por email desactivados.' });
    } catch (error) {
      setFeedback({ type: 'error', text: ERROR_COPY[error.code] || ERROR_COPY.EMAIL_UNAVAILABLE });
    }
  };

  const handleTest = async () => {
    setFeedback(null);
    try {
      const saved = await savePreferences({ ...draft, enabled: true });
      setDraft(saved);
      await sendTest();
      setFeedback({ type: 'success', text: `Correo de prueba enviado a ${saved.email}.` });
    } catch (error) {
      setFeedback({ type: 'error', text: ERROR_COPY[error.code] || ERROR_COPY.EMAIL_UNAVAILABLE });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="email-notification-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={event => event.target === event.currentTarget && onClose()}
        >
          <motion.section
            className="email-notification-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-notification-title"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <header>
              <div className="email-notification-icon"><Mail size={20} /></div>
              <div>
                <h2 id="email-notification-title">Novedades por email</h2>
                <p>Recibe un digest compacto aunque PaperTok esté cerrado.</p>
              </div>
              <button className="email-notification-close" onClick={onClose} title="Cerrar"><X size={20} /></button>
            </header>

            <div className="email-notification-body">
              {!loading && !health.available && (
                <div className="email-notification-provider-warning">
                  <strong>Envío pendiente de configuración</strong>
                  <span>{health.code === 'EMAIL_PROVIDER_AUTH_FAILED'
                    ? 'Resend no ha aceptado la credencial guardada.'
                    : 'El proveedor de correo no está disponible en este momento.'}</span>
                </div>
              )}
              {!loading && health.available && health.senderMode === 'resend-test' && (
                <div className="email-notification-provider-warning is-info">
                  <strong>Modo de prueba de Resend</strong>
                  <span>Sin un dominio verificado, Resend sólo entregará correos a la dirección propietaria de tu cuenta.</span>
                </div>
              )}
              {!loading && health.available && health.permissionLimited && health.senderMode !== 'resend-test' && (
                <div className="email-notification-provider-warning is-info">
                  <strong>Clave de envío restringida</strong>
                  <span>La credencial de Resend sólo tiene permiso de envío, así que no podemos comprobar el estado del dominio desde aquí. El envío funciona con normalidad.</span>
                </div>
              )}
              <label className="email-notification-toggle-row">
                <span><strong>Activar correos</strong><small>Se enviarán a {draft.email || preferences.email}</small></span>
                <input
                  type="checkbox"
                  checked={Boolean(draft.enabled)}
                  onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))}
                  disabled={loading || (!health.available && !draft.enabled)}
                />
                <span className="email-notification-switch" aria-hidden="true" />
              </label>

              <div className={`email-notification-options ${draft.enabled ? '' : 'is-disabled'}`}>
                <fieldset disabled={!draft.enabled || loading}>
                  <legend>Frecuencia</legend>
                  <div className="email-notification-segments">
                    <button className={draft.frequency === 'daily' ? 'is-active' : ''} onClick={() => setDraft(current => ({ ...current, frequency: 'daily' }))}>
                      Diario
                    </button>
                    <button className={draft.frequency === 'weekly' ? 'is-active' : ''} onClick={() => setDraft(current => ({ ...current, frequency: 'weekly' }))}>
                      Semanal
                    </button>
                  </div>
                </fieldset>

                <label className="email-notification-count">
                  <span><strong>Papers por correo</strong><small>Priorizados por fecha y coincidencia</small></span>
                  <select
                    value={draft.maxPapers || 5}
                    onChange={event => setDraft(current => ({ ...current, maxPapers: Number(event.target.value) }))}
                    disabled={!draft.enabled || loading}
                  >
                    <option value="3">3</option>
                    <option value="5">5</option>
                    <option value="10">10</option>
                  </select>
                </label>
              </div>

              <div className="email-notification-schedule">
                <Clock3 size={16} />
                <span>{draft.frequency === 'weekly' ? 'Los lunes por la mañana' : 'Cada mañana'}, sólo cuando haya novedades.</span>
              </div>

              {feedback && (
                <motion.p className={`email-notification-feedback is-${feedback.type}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                  {feedback.type === 'success' && <Check size={15} />} {feedback.text}
                </motion.p>
              )}
            </div>

            <footer>
              <button className="email-notification-test" onClick={handleTest} disabled={saving || testing || loading || !health.available}>
                <Send size={16} /> {testing ? 'Enviando...' : 'Enviar prueba'}
              </button>
              <button className="email-notification-save" onClick={handleSave} disabled={saving || testing || loading || (draft.enabled && !health.available)}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
