import { motion, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

const routeVariants = {
  initial: (isExplorer) => ({
    opacity: 0,
    x: isExplorer ? 14 : 0,
    y: isExplorer ? 0 : 8,
    scale: 0.997,
  }),
  enter: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: (isExplorer) => ({
    opacity: 0,
    x: isExplorer ? -8 : 0,
    y: isExplorer ? 0 : -4,
    scale: 0.999,
    transition: {
      duration: 0.12,
      ease: [0.4, 0, 1, 1],
    },
  }),
};

const reducedMotionVariants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.08 } },
};

export default function PageTransition({ children }) {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const isExplorer = location.pathname.startsWith('/explorer/');

  return (
    <motion.div
      custom={isExplorer}
      initial="initial"
      animate="enter"
      exit="exit"
      variants={prefersReducedMotion ? reducedMotionVariants : routeVariants}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transformOrigin: '50% 35%',
      }}
    >
      {children}
    </motion.div>
  );
}
