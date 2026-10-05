import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { cn } from '../../utils/cn';

export const pageVariants = {
  initial: { opacity: 0, x: 20, scale: 0.98 },
  enter: { 
    opacity: 1, 
    x: 0, 
    scale: 1,
    transition: { 
      duration: 0.4, 
      ease: [0.25, 0.1, 0.25, 1] 
    } 
  },
  exit: { 
    opacity: 0, 
    x: -20, 
    scale: 1.02,
    transition: { 
      duration: 0.3, 
      ease: [0.25, 0.1, 0.25, 1] 
    } 
  },
};

export const cardVariants = {
  initial: { opacity: 0, y: 20 },
  enter: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.4,
      ease: [0.25, 0.1, 0.25, 1]
    }
  }),
  exit: {
    opacity: 0,
    y: -20,
    transition: { duration: 0.2 }
  }
};

export const listVariants = {
  initial: { opacity: 0 },
  enter: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  },
  exit: {
    opacity: 0,
    transition: { staggerChildren: 0.01, staggerDirection: -1 }
  }
};

export const itemVariants = {
  initial: { opacity: 0, x: -20 },
  enter: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: 0.2 }
  }
};

export const modalVariants = {
  initial: { opacity: 0, scale: 0.9, y: 20 },
  enter: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -10,
    transition: { duration: 0.2 }
  }
};

export const overlayVariants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.2 } }
};

export function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="enter"
        exit="exit"
        variants={pageVariants}
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function StaggeredContainer({ 
  children, 
  className,
  variant = 'card'
}: { 
  children: React.ReactNode; 
  className?: string;
  variant?: 'card' | 'list' | 'table';
}) {
  const variants = variant === 'list' ? listVariants : cardVariants;
  const itemVars = variant === 'table' ? itemVariants : cardVariants;

  return (
    <motion.div
      className={cn('w-full', className)}
      initial="initial"
      animate="enter"
      exit="exit"
      variants={variants}
    >
      {React.Children.map(children, (child, index) => 
        React.isValidElement(child) ? (
          React.cloneElement(child as React.ReactElement<any>, {
            variants: itemVars,
            custom: index
          })
        ) : child
      )}
    </motion.div>
  );
}

export function AnimatedCard({ children, index = 0, ...props }: { 
  children: React.ReactNode; 
  index?: number;
  className?: string;
}) {
  return (
    <motion.div
      {...props}
      variants={cardVariants}
      custom={index}
      initial="initial"
      animate="enter"
      exit="exit"
      whileHover={{ y: -4, boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)' }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedRow({ children, index = 0, ...props }: { 
  children: React.ReactNode; 
  index?: number;
}) {
  return (
    <motion.tr
      {...props}
      variants={itemVariants}
      custom={index}
      initial="initial"
      animate="enter"
      exit="exit"
    >
      {children}
    </motion.tr>
  );
}

export function Modal({ 
  isOpen, 
  onClose, 
  children, 
  title,
  size = 'md'
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  children: React.ReactNode;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            variants={overlayVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            variants={modalVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className={cn(
              'fixed z-50 w-full mx-auto rounded-xl bg-white dark:bg-slate-900 shadow-xl',
              sizeClasses[size]
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 id="modal-title" className="text-lg font-semibold text-text">{title}</h2>
              <motion.button
                onClick={onClose}
                className="p-2 rounded-lg text-muted hover:text-text hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Toast({ message, type = 'info', onClose }: { message: string; type?: 'success' | 'error' | 'warning' | 'info'; onClose: () => void }) {
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
  };

  const icons = {
    success: <CheckCircle className="w-5 h-5" />,
    error: <AlertCircle className="w-5 h-5" />,
    warning: <AlertTriangle className="w-5 h-5" />,
    info: <Info className="w-5 h-5" />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 300, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.9 }}
      className={cn(
        'fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 min-w-[300px] max-w-md',
        colors[type]
      )}
      onClick={onClose}
    >
      <span className="text-white">{icons[type]}</span>
      <p className="text-white text-sm font-medium">{message}</p>
      <motion.button
        onClick={onClose}
        whileHover={{ scale: 1.2 }}
        whileTap={{ scale: 0.9 }}
        className="ml-auto p-1 rounded-lg hover:bg-white/20 text-white"
      >
        <X className="w-4 h-4" />
      </motion.button>
    </motion.div>
  );
}

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 16, md: 24, lg: 32 };
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      className="flex items-center justify-center"
    >
      <svg className="text-primary-600" width={sizes[size]} height={sizes[size]} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
        </circle>
      </svg>
    </motion.div>
  );
}

export function SkeletonLoader({ className }: { className?: string }) {
  return (
    <motion.div
      className={cn('bg-slate-200 dark:bg-slate-700 rounded animate-pulse', className)}
      animate={{ opacity: [1, 0.5, 1] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

export function SlideIn({ children, direction = 'up', delay = 0, ...props }: { 
  children: React.ReactNode; 
  direction?: 'up' | 'down' | 'left' | 'right';
  delay?: number;
}) {
  const directionMap = {
    up: { y: 20 },
    down: { y: -20 },
    left: { x: 20 },
    right: { x: -20 },
  };

  return (
    <motion.div
      {...props}
      initial={directionMap[direction]}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function FadeIn({ children, delay = 0, ...props }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      {...props}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

export function ScaleIn({ children, delay = 0, ...props }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      {...props}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function NumberCounter({ 
  value, 
  duration = 1, 
  decimals = 0,
  prefix = '',
  suffix = '',
  className
}: { 
  value: number; 
  duration?: number; 
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const count = useMotionValue(0);
  
  useEffect(() => {
    count.set(value, { duration, ease: [0.25, 0.1, 0.25, 1] });
  }, [value]);

  const display = useTransform(count, (latest) => 
    `${prefix}${latest.toFixed(decimals)}${suffix}`
  );

  return (
    <motion.span className={className}>{display}</motion.span>
  );
}

export function ProgressRing({ 
  progress, 
  size = 60, 
  strokeWidth = 4,
  className
}: { 
  progress: number; 
  size?: number; 
  strokeWidth?: number;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        <motion.circle
          className="text-slate-200 dark:text-slate-700"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <motion.circle
          className="text-primary-600"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ filter: 'drop-shadow(0 2px 4px rgba(37, 99, 235, 0.3))' }}
        />
      </svg>
    </div>
  );
}

export function DraggableCard({ children, onDragEnd, ...props }: { 
  children: React.ReactNode; 
  onDragEnd?: (x: number, y: number) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  return (
    <motion.div
      {...props}
      drag
      dragConstraints={{ left: -100, right: 100, top: -100, bottom: 100 }}
      dragElastic={0.2}
      whileDrag={{ scale: 1.02, boxShadow: '0 20px 40px -10px rgba(0,0,0,0.2)' }}
      dragElastic={0.2}
      onDragEnd={(event, info) => onDragEnd?.(info.offset.x, info.offset.y)}
      style={{ x, y }}
    >
      {children}
    </motion.div>
  );
}

import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useEffect } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { 
  CheckCircle, AlertCircle, AlertTriangle, Info, X,
  CheckCircle as CheckCircleIcon,
  AlertTriangle,
  X as XIcon
} from 'lucide-react';

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};