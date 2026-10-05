import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, X, Check, MessageSquare, CreditCard, AlertTriangle, DollarSign, Clock } from 'lucide-react';
import { formatRelativeTime } from '../utils/format';
import { cn } from '../utils/cn';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'transaction' | 'loan' | 'security';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, any>;
}

const typeIcons = {
  info: Bell,
  success: Check,
  warning: AlertTriangle,
  error: AlertTriangle,
  transaction: DollarSign,
  loan: CreditCard,
  security: Shield,
};

const typeColors = {
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  success: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  warning: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  error: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  transaction: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  loan: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  security: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

interface NotificationPanelProps {
  notifications: Notification[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  unreadCount: number;
}

export function NotificationPanel({ 
  notifications, 
  onClose, 
  onMarkRead, 
  onMarkAllRead, 
  unreadCount 
}: NotificationPanelProps) {
  return (
    <div className="absolute right-0 mt-2 w-80 bg-card rounded-xl border border-border shadow-lg py-2 animate-slide-down">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-text">Notifications</h3>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onMarkAllRead}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Mark all read
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-4 text-center text-muted text-sm">
            No new notifications
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((notification) => (
              <NotificationItem 
                key={notification.id} 
                notification={notification} 
                onMarkRead={onMarkRead} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
}

function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const Icon = typeIcons[notification.type];
  const isUnread = !notification.read;

  return (
    <div 
      className={cn(
        'px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
        isUnread && 'bg-primary-50 dark:bg-primary-900/20'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          typeColors[notification.type]
        )}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={cn(
              'font-medium text-text truncate',
              isUnread && 'font-semibold'
            )}>
              {notification.title}
            </h4>
            <span className="text-xs text-muted whitespace-nowrap">
              {formatRelativeTime(notification.timestamp)}
            </span>
          </div>
          <p className="text-sm text-muted mt-1">{notification.message}</p>
          {notification.actionUrl && notification.actionLabel && (
            <a 
              href={notification.actionUrl} 
              className="text-sm text-primary-600 hover:text-primary-700 mt-2 inline-block"
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead(notification.id);
              }}
            >
              {notification.actionLabel}
            </a>
          )}
        </div>
        {isUnread && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-muted hover:text-primary-600"
            onClick={() => onMarkRead(notification.id)}
            aria-label="Mark as read"
          >
            <Check className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface NotificationBellProps {
  notifications: Notification[];
  onOpen: () => void;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  isOpen: boolean;
}

export function NotificationBell({ 
  notifications, 
  onOpen, 
  onClose, 
  onMarkRead, 
  onMarkAllRead, 
  isOpen 
}: NotificationBellProps) {
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={isOpen ? onClose : onOpen}
        className="relative p-2 rounded-lg text-text hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
        {unreadCount > 9 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
            9+
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationPanel
          notifications={notifications}
          onClose={onClose}
          onMarkRead={onMarkRead}
          onMarkAllRead={onMarkAllRead}
          unreadCount={unreadCount}
        />
      )}
    </div>
  );
}

// Real-time notification hook with WebSocket support
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const unreadCount = notifications.filter(n => !n.read).length;

  // Initialize WebSocket connection
  useEffect(() => {
    const connect = () => {
      try {
        // In production, use wss://your-api.com/ws/notifications
        const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws/notifications';
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.log('Notification WebSocket connected');
        };

        wsRef.current.onmessage = (event) => {
          try {
            const notification = JSON.parse(event.data) as Notification;
            setNotifications(prev => [notification, ...prev]);
            
            // Show browser notification if permission granted
            if (Notification.permission === 'granted' && document.hidden) {
              new Notification(notification.title, {
                body: notification.message,
                icon: '/favicon.svg',
              });
            }
          } catch (error) {
            console.error('Failed to parse notification:', error);
          }
        };

        wsRef.current.onclose = () => {
          console.log('Notification WebSocket disconnected, reconnecting...');
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        };

        wsRef.current.onerror = (error) => {
          console.error('Notification WebSocket error:', error);
        };
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      }
    };

    connect();

    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [newNotification, ...prev]);
    return newNotification;
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return {
    notifications,
    unreadCount,
    isOpen,
    open,
    close,
    markRead,
    markAllRead,
    addNotification,
    removeNotification,
  };
}

// Toast-style notification for immediate feedback
export function useToastNotifications() {
  const toast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    // This would integrate with your toast library (react-hot-toast)
    // For now, we'll use a simple approach
    const event = new CustomEvent('toast', { 
      detail: { message, type } 
    });
    window.dispatchEvent(event);
  };

  return { toast };
}

// In-app notification center component
export function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    isOpen,
    open,
    close,
    markRead,
    markAllRead,
  } = useNotifications();

  return (
    <div className="relative">
      <NotificationBell
        notifications={notifications}
        onOpen={open}
        onClose={close}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        isOpen={isOpen}
      />
    </div>
  );
}