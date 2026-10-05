import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '../../utils/cn';
import { 
  MessageCircle, Send, X, ChevronDown, ChevronUp,
  Paperclip, Mic, Smile, MoreVertical, Shield,
  CheckCircle, Clock, User, Bot, Zap, Shield as ShieldIcon,
  AlertCircle, Info, Menu, X as XIcon, Send as SendIcon,
  Star, ThumbsUp, ThumbsDown, Flag, Copy, Download,
  Image, FileText, Video, Mic, MicOff, Volume2, VolumeX,
  Settings, User, LogOut, Bell, Mail, Phone, Globe,
  Search, Filter, RefreshCw, Trash2, Edit, Archive,
  Reply, Forward, Pin, Unpin, Block, Flag as FlagIcon
} from 'lucide-react';
import { 
  Button, Input, Textarea, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, 
  Avatar, AvatarImage, AvatarFallback, ScrollArea, Separator, 
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel, Tooltip, TooltipTrigger, TooltipContent,
  Popover, PopoverTrigger, PopoverContent, Select, SelectTrigger, SelectValue,
  SelectContent, SelectItem, Switch, Slider, Label, Progress,
  Alert, AlertDescription, Tabs, TabsList, TabsTrigger, TabsContent,
  RadioGroup, RadioGroupItem, Checkbox, InputOTP, InputOTPGroup, InputOTPSlot,
  Skeleton, HoverCard, HoverCardTrigger, HoverCardContent
} from '../ui';
import { useAuthStore } from '../../store/authStore';
import { useNotifications, useWebSocket, useToastNotifications } from '../../hooks';
import { formatRelativeTime, formatDateTime } from '../../utils/format';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderType: 'user' | 'agent' | 'bot' | 'system';
  content: string;
  type: 'text' | 'image' | 'file' | 'system' | 'quick_reply' | 'rating';
  timestamp: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
  }>;
  quickReplies?: string[];
  rating?: number;
  metadata?: Record<string, any>;
}

interface Conversation {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'closed' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string;
  assigneeName?: string;
  assigneeAvatar?: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerAvatar?: string;
  lastMessage?: string;
  lastMessageAt: string;
  unreadCount: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isSending: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
  unreadCount: number;
  activeAgents: number;
  queuePosition: number;
  estimatedWaitTime: number;
  isTyping: boolean;
  typingUsers: string[];
}

export function LiveChatSupport({ 
  initialState,
  onClose,
  onMinimize,
  onMaximize,
  userId,
  userRole = 'customer'
}: { 
  initialState?: Partial<ChatState>;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  userId: string;
  userRole?: 'customer' | 'agent' | 'admin';
}) {
  const { user } = useAuthStore();
  const { toast } = useToastNotifications();
  const { notifications: wsNotifications, markRead, markAllRead, unreadCount } = useNotifications();
  
  const [state, setState] = useState<ChatState>({
    conversations: [],
    activeConversationId: null,
    messages: [],
    isLoading: false,
    isSending: false,
    connectionStatus: 'connecting',
    unreadCount: 0,
    activeAgents: 0,
    queuePosition: 0,
    estimatedWaitTime: 0,
    isTyping: false,
    typingUsers: [],
    ...initialState,
  });

  const [showChat, setShowChat] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [showConversationList, setShowConversationList] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'open' | 'pending' | 'closed' | 'assigned'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>();
  const [editContent, setEditContent] = useState('');
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const [draftMessages, setDraftMessages] = useState<Record<string, string>>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();

  const { 
    isConnected, 
    lastMessage: wsLastMessage,
    sendMessage: sendWSMessage,
    reconnect 
  } = useWebSocket({
    url: import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws/chat',
    onOpen: () => {
      setState(prev => ({ ...prev, connectionStatus: 'connected' }));
      // Join user's conversation room
      sendWSMessage({
        type: 'join',
        userId,
        role: userRole,
        conversations: state.conversations.map(c => c.id),
      });
    },
    onClose: () => {
      setState(prev => ({ ...prev, connectionStatus: 'disconnected' }));
    },
    onError: () => {
      setState(prev => ({ ...prev, connectionStatus: 'error' }));
    },
    onMessage: (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    },
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [state.messages, scrollToBottom]);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'new_message':
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, message.data],
          conversations: prev.conversations.map(c => 
            c.id === message.data.conversationId 
              ? { ...c, lastMessage: message.data.content, lastMessageAt: message.data.timestamp, unreadCount: c.unreadCount + 1 }
              : c
          ),
        }));
        break;
      case 'message_status':
        setState(prev => ({
          ...prev,
          messages: prev.messages.map(m => 
            m.id === message.data.messageId ? { ...m, status: message.data.status } : m
          ),
        }));
        break;
      case 'typing_start':
        setState(prev => ({
          ...prev,
          typingUsers: [...prev.typingUsers.filter(u => u !== message.data.userId), message.data.userId],
        }));
        break;
      case 'typing_stop':
        setState(prev => ({
          ...prev,
          typingUsers: prev.typingUsers.filter(u => u !== message.data.userId),
        }));
        break;
      case 'agent_status':
        setState(prev => ({
          ...prev,
          activeAgents: message.data.count,
        }));
        break;
      case 'queue_update':
        setState(prev => ({
          ...prev,
          queuePosition: message.data.position,
          estimatedWaitTime: message.data.waitTime,
        }));
        break;
      case 'conversation_update':
        setState(prev => ({
          ...prev,
          conversations: prev.conversations.map(c => 
            c.id === message.data.id ? { ...c, ...message.data } : c
          ),
        }));
        break;
      case 'read_receipt':
        setState(prev => ({
          ...prev,
          messages: prev.messages.map(m => 
            m.id === message.data.messageId ? { ...m, status: 'read' } : m
          ),
          conversations: prev.conversations.map(c => 
            c.id === message.data.conversationId ? { ...c, unreadCount: 0 } : c
          ),
        });
        break;
      case 'queue_position':
        setState(prev => ({
          ...prev,
          queuePosition: message.data.position,
          estimatedWaitTime: message.data.estimatedWait,
        }));
        break;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [state.messages, scrollToBottom]);

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (state.activeConversationId) {
      sendWSMessage({
        type: 'typing',
        conversationId: state.activeConversationId,
        userId,
      });
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        sendWSMessage({
          type: 'typing_stop',
          conversationId: state.activeConversationId,
          userId,
        });
      }, 2000);
    }, [state.activeConversationId, sendWSMessage]);

  // Debounced message sending
  const debouncedSend = useCallback((content: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = setTimeout(() => {
      sendMessage(content);
    }, 100);
  }, []);

  // Send message
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !state.activeConversationId || state.isSending) return;
    
    setState(prev => ({ ...prev, isSending: true }));
    
    const tempId = `temp-${Date.now()}`;
    const newMessage: ChatMessage = {
      id: tempId,
      conversationId: state.activeConversationId,
      senderId: userId,
      senderName: user?.firstName + ' ' + user?.lastName || 'You',
      senderType: 'user',
      content: content.trim(),
      type: 'text',
      timestamp: new Date().toISOString(),
      status: 'sending',
    };
    
    // Optimistic update
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, newMessage],
      isSending: true,
    }));
    
    // Clear draft
    setDraftMessages(prev => ({ ...prev, [state.activeConversationId!]: '' }));
    
    try {
      // Send via WebSocket
      sendWSMessage({
        type: 'message',
        conversationId: state.activeConversationId,
        content: content.trim(),
        tempId,
      });
      
      // Update message status to sent
      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m => 
          m.id === tempId ? { ...m, status: 'sent' } : m
        ),
        isSending: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m => 
          m.id === tempId ? { ...m, status: 'failed' } : m
        ),
        isSending: false,
      });
      toast.error('Failed to send message');
    }
  }, [state.activeConversationId, state.activeConversationId, sendWSMessage]);

  // Send message with attachment
  const sendAttachment = useCallback(async (file: File) => {
    if (!state.activeConversationId) return;
    
    setState(prev => ({ ...prev, isSending: true }));
    
    try {
      // In real app, upload to storage first
      // const uploadUrl = await uploadFile(file);
      
      const tempId = `temp-${Date.now()}`;
      const newMessage: ChatMessage = {
        id: tempId,
        conversationId: state.activeConversationId,
        senderId: userId,
        senderName: user?.firstName + ' ' + user?.lastName || 'You',
        senderType: 'user',
        content: '',
        type: file.type.startsWith('image/') ? 'image' : 'file',
        timestamp: new Date().toISOString(),
        status: 'sending',
        attachments: [{
          id: crypto.randomUUID(),
          name: file.name,
          url: URL.createObjectURL(file), // Temporary
          type: file.type,
          size: file.size,
        }],
      };
      
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, newMessage],
        isSending: true,
      }));
      
      // Simulate upload
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      sendWSMessage({
        type: 'message',
        conversationId: state.activeConversationId,
        content: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'file',
        tempId,
        attachments: [{
          id: crypto.randomUUID(),
          name: file.name,
          url: URL.createObjectURL(file),
          type: file.type,
          size: file.size,
        }],
      });
      
      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m => 
          m.id === tempId ? { ...m, status: 'sent' } : m
        ),
        isSending: false,
      }));
    } catch (error) {
      toast.error('Failed to send attachment');
      setState(prev => ({ ...prev, isSending: false }));
    }
  }, [state.activeConversationId, sendWSMessage]);

  // Select conversation
  const selectConversation = useCallback((conversationId: string) => {
    const conversation = state.conversations.find(c => c.id === conversationId);
    if (conversation) {
      setState(prev => ({
        ...prev,
        activeConversationId: conversationId,
        messages: conversation.messages,
        conversations: prev.conversations.map(c => 
          c.id === conversationId ? { ...c, unreadCount: 0 } : c
        ),
      }));
      
      // Mark as read
      sendWSMessage({
        type: 'read',
        conversationId,
        userId,
      });
      
      // Reset draft
      setDraftMessages(prev => {
        const newDrafts = { ...prev };
        delete newDrafts[conversationId];
        return newDrafts;
      });
    }
  }, [state.conversations, sendWSMessage]);

  // Send quick reply
  const sendQuickReply = useCallback((reply: string) => {
    sendMessage(reply);
  }, [sendMessage]);

  // Rate conversation
  const rateConversation = useCallback(async (rating: number) => {
    if (!state.activeConversationId) return;
    
    try {
      // await api.rateConversation(state.activeConversationId, rating);
      toast.success('Thank you for your feedback!');
      
      sendWSMessage({
        type: 'rating',
        conversationId: state.activeConversationId,
        rating,
        userId,
      });
    } catch (error) {
      toast.error('Failed to submit rating');
    }
  }, [state.activeConversationId, sendWSMessage]);

  // Close conversation
  const closeConversation = useCallback(async () => {
    if (!state.activeConversationId) return;
    
    try {
      // await api.closeConversation(state.activeConversationId);
      
      setState(prev => ({
        ...prev,
        conversations: prev.conversations.map(c => 
          c.id === state.activeConversationId 
            ? { ...c, status: 'closed' } 
            : c
        ),
        activeConversationId: null,
        messages: [],
      }));
      
      toast.success('Conversation closed');
    } catch (error) {
      toast.error('Failed to close conversation');
    }
  }, [state.activeConversationId]);

  // Reopen conversation
  const reopenConversation = useCallback(async (conversationId: string) => {
    try {
      // await api.reopenConversation(conversationId);
      setState(prev => ({
        ...prev,
        conversations: prev.conversations.map(c => 
          c.id === conversationId ? { ...c, status: 'open' } : c
        ),
      });
      toast.success('Conversation reopened');
    } catch (error) {
      toast.error('Failed to reopen conversation');
    }
  }, []);

  // Delete conversation
  const deleteConversation = useCallback(async (conversationId: string) => {
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    
    try {
      // await api.deleteConversation(conversationId);
      setState(prev => ({
        ...prev,
        conversations: prev.conversations.filter(c => c.id !== conversationId),
        activeConversationId: prev.activeConversationId === conversationId ? null : prev.activeConversationId,
        messages: prev.activeConversationId === conversationId ? [] : prev.messages,
      });
      toast.success('Conversation deleted');
    } catch (error) {
      toast.error('Failed to delete conversation');
    }
  }, []);

  // Archive conversation
  const archiveConversation = useCallback(async (conversationId: string) => {
    try {
      // await api.archiveConversation(conversationId);
      setState(prev => ({
        ...prev,
        conversations: prev.conversations.map(c => 
          c.id === conversationId ? { ...c, status: 'closed' } : c
        ),
      });
      toast.success('Conversation archived');
    } catch (error) {
      toast.error('Failed to archive conversation');
    }
  }, []);

  // Pin conversation
  const pinConversation = useCallback(async (conversationId: string) => {
    // In real app, call API to pin
    toast.success('Conversation pinned');
  }, []);

  // Block user
  const blockUser = useCallback(async (conversationId: string) => {
    if (!confirm('Block this user? They will no longer be able to contact you.')) return;
    
    try {
      // await api.blockUser(conversationId);
      toast.success('User blocked');
    } catch (error) {
      toast.error('Failed to block user');
    }
  }, []);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    let filtered = state.conversations;
    
    if (activeTab !== 'all') {
      filtered = filtered.filter(c => c.status === activeTab);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.subject.toLowerCase().includes(query) ||
        c.customerName.toLowerCase().includes(query) ||
        c.customerEmail.toLowerCase().includes(query) ||
        c.tags.some(t => t.toLowerCase().includes(query))
      );
    }
    
    // Sort: unread first, then by last message time
    return filtered.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });
  }, [state.conversations, activeTab, searchQuery]);

  // Virtualized message list
  const { 
    items: displayedMessages, 
    loadMore, 
    hasMore, 
    isLoading: virtualLoading,
    observerTargetRef,
    reset: resetVirtualList
  } = useVirtualizedList<ChatMessage>({
    items: state.messages,
    itemHeight: 120,
    containerHeight: 500,
    loadMore: () => {
      // In real app, load older messages
      return Promise.resolve([]);
    },
    hasMore: false,
    isLoading: false,
    threshold: 200,
  });

  // Compute unread count
  const totalUnreadCount = useMemo(() => 
    state.conversations.reduce((sum, c) => sum + c.unreadCount, 0),
  [state.conversations]);

  // Active conversation
  const activeConversation = state.conversations.find(c => c.id === state.activeConversationId);

  // Emoji picker data
  const emojiCategories = useMemo(() => [
    { name: 'Smileys', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😴', '🤥', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '😳', '🥺', '😲', '😱', '😨', '😰', '😦', '😧', '😮', '😯', '😴', '🤤', '😪', '😴', '😌', '😛', '😜', '😝', '🤤'] },
    { name: 'People', emojis: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁', '👅', '👄', '🫦'] },
    { name: 'Objects', emojis: ['💻', '📱', '📲', '📞', '☎', '📟', '📠', '🔋', '🪫', '🔌', '💡', '🔦', '🕯', '🪔', '🧯', '🛢', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '🔮', '🪄', '🎮', '🕹', '🎰', '🎲', '🧩', '🧸', '🪅', '🪆', '♠', '♥', '♦', '♣', '🃏', '🀄', '🎴', '🎭', '🖼', '🎨', '🧵', '🪡', '🧶', '🪢', '🛍', '🛒', '🎁', '🎀', '🏷', '🏷', '🎫', '🎟', '🎃', '🎄', '🎆', '🎇', '🧨', '✨', '🎈', '🎉', '🪄', '🪩', '🪄', '🪩'] },
  ], []);

  // Render
  if (!showChat) return null;

  return (
    <div className={cn(
      'fixed bottom-4 right-4 z-50 w-full max-w-4xl h-[600px] md:h-[700px]',
      'bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-border',
      'flex flex-col overflow-hidden',
      isMinimized && 'h-16 max-w-xs'
    )}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'flex items-center justify-between p-4 border-b border-border',
          'bg-white dark:bg-slate-900',
          'rounded-t-2xl'
        )}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="p-2 rounded-lg text-muted hover:text-text hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close chat"
          >
            <XIcon className="w-5 h-5" />
          </motion.button>
          
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Avatar className="h-10 w-10">
              <AvatarImage src="/avatar-support.png" alt="Support" />
              <AvatarFallback className="text-sm font-medium bg-primary-100 text-primary-600">
                <MessageCircle className="w-5 h-5" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-text truncate">Mangaud Support</h3>
                <LiveIndicator isLive={state.connectionStatus === 'connected'} label="" />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>{state.activeAgents} agents online</span>
                {state.queuePosition > 0 && (
                  <>
                    <Separator className="h-4" />
                    <span>Queue: {state.queuePosition}</span>
                    <span>•</span>
                    <span>~{state.estimatedWaitTime} min</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowSettings(!showSettings)}>
                  <Settings className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Settings</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setIsMinimized(true)}>
                  <Minimize2 className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Minimize</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onClose}>
                  <XIcon className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Close</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-border p-4 bg-slate-50 dark:bg-slate-800/50"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-text">Push Notifications</p>
                    <p className="text-sm text-muted">Receive notifications for new messages</p>
                  </div>
                </div>
                <Switch checked={true} onCheckedChange={() => {}} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-text">Email Notifications</p>
                    <p className="text-sm text-muted">Receive email for new messages when offline</p>
                  </div>
                </div>
                <Switch checked={true} onCheckedChange={() => {}} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-text">Sound Notifications</p>
                    <p className="text-sm text-muted">Play sound for new messages</p>
                  </div>
                </div>
                <Switch checked={true} onCheckedChange={() => {}} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <p className="font-medium text-text">Auto-open chat</p>
                  <p className="text-sm text-muted">Automatically open chat on new messages</p>
                </div>
                <Switch checked={false} onCheckedChange={() => {}} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <p className="font-medium text-text">Sound</p>
                  <p className="text-sm text-muted">Notification sound</p>
                </div>
                <Select defaultValue="default">
                  <SelectTrigger className="w-36"><SelectValue placeholder="Sound" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="ding">Ding</SelectItem>
                    <SelectItem value="chime">Chime</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>
        )}

        {/* Conversation List */}
        {showConversationList && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 flex flex-col border-r border-border overflow-hidden"
            style={{ width: isMobile ? '100%' : '320px', minWidth: '280px' }}
          >
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-text">Conversations</h3>
                <Badge variant="outline" className="text-xs">
                  {filteredConversations.length}
                </Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="border-b border-border">
              <TabsList className="grid w-full grid-cols-5">
                {['all', 'open', 'pending', 'closed', 'assigned'].map((tab) => (
                  <TabsTrigger key={tab} value={tab} className="text-xs py-2">
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {filteredConversations.length === 0 ? (
                  <div className="p-8 text-center">
                    <MessageCircle className="w-12 h-12 text-muted mx-auto mb-4" />
                    <p className="text-muted">No conversations found</p>
                  </div>
                ) : (
                  filteredConversations.map((conversation) => (
                    <motion.button
                      key={conversation.id}
                      onClick={() => selectConversation(conversation.id)}
                      className={cn(
                        'w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                        'flex items-start gap-3',
                        state.activeConversationId === conversation.id 
                          ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-l-primary-500' 
                          : ''
                      )}
                      whileHover={{ backgroundColor: '#f1f5f9' }}
                      whileTap={{ scale: 0.98 }}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarImage src={conversation.customerAvatar} alt={conversation.customerName} />
                        <AvatarFallback className="text-sm font-medium bg-primary-100 text-primary-600">
                          {conversation.customerName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-text truncate">{conversation.subject || conversation.customerName}</p>
                            <p className="text-xs text-muted truncate">{conversation.customerEmail}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={cn(
                              'text-xs px-1.5 py-0.5 rounded',
                              conversation.status === 'open' && 'bg-green-100 text-green-700',
                              conversation.status === 'pending' && 'bg-yellow-100 text-yellow-700',
                              conversation.status === 'closed' && 'bg-gray-100 text-gray-700',
                              conversation.status === 'resolved' && 'bg-blue-100 text-blue-700'
                            )}>
                              {conversation.status.charAt(0).toUpperCase() + conversation.status.slice(1)}
                            </span>
                            <span className="text-xs text-muted">{formatRelativeTime(conversation.lastMessageAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-1">
                            {conversation.unreadCount > 0 && (
                              <span className="w-5 h-5 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-medium">
                                {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                              </span>
                            )}
                            <span className="text-xs text-muted">{conversation.priority}</span>
                            {conversation.tags.length > 0 && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                                {conversation.tags[0]}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 p-1">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left" align="end">
                                <DropdownMenuItem onClick={() => selectConversation(conversation.id)}>
                                  <Eye className="w-4 h-4 mr-2" /> View
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { /* reopen */ }}>
                                  <RotateCcw className="w-4 h-4 mr-2" /> Reopen
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => archiveConversation(conversation.id)}>
                                  <Archive className="w-4 h-4 mr-2" /> Archive
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => deleteConversation(conversation.id)} className="text-red-600">
                                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </ScrollArea>
          )}
        </motion.div>
      )}

      {/* Chat Area */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex-1 flex flex-col min-w-0"
        style={{ width: isMobile ? '100%' : 'calc(100% - 320px)' }}
      >
        {/* Active Conversation Header */}
        {state.activeConversationId ? (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between p-4 border-b border-border bg-white dark:bg-slate-900"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Avatar className="h-10 w-10">
                <AvatarImage src={activeConversation?.customerAvatar} alt={activeConversation?.customerName} />
                <AvatarFallback className="text-sm font-medium bg-primary-100 text-primary-600">
                  {activeConversation?.customerName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h3 className="font-semibold text-text truncate">{activeConversation?.subject || activeConversation?.customerName}</h3>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span>{activeConversation?.customerEmail}</span>
                  <Badge variant={
                    activeConversation?.status === 'open' ? 'success' :
                    activeConversation?.status === 'pending' ? 'warning' :
                    activeConversation?.status === 'closed' ? 'gray' : 'default'
                  }>
                    {activeConversation?.status}
                  </Badge>
                  {activeConversation?.priority && (
                    <Badge variant={activeConversation.priority === 'urgent' ? 'destructive' : activeConversation.priority === 'high' ? 'destructive' : activeConversation.priority === 'medium' ? 'warning' : 'secondary'}>
                      {activeConversation.priority}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { /* transfer */ }}>
                      <Users className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Transfer</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { /* tag */ }}>
                      <Tag className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add Tag</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => closeConversation()}>
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Close</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { /* info */ }}>
                      <Info className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Info</TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { /* transfer */ }}>
                      <Users className="w-4 h-4 mr-2" /> Transfer
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { /* assign */ }}>
                      <User className="w-4 h-4 mr-2" /> Assign to me
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { /* macro */ }}>
                      <Zap className="w-4 h-4 mr-2" /> Use Macro
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => reopenConversation(state.activeConversationId!)} className="text-green-600">
                      <RotateCcw className="w-4 h-4 mr-2" /> Reopen
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => deleteConversation(state.activeConversationId!)} className="text-red-600">
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        )} : (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <MessageCircle className="w-16 h-16 text-muted mb-4" />
            <h3 className="text-lg font-medium text-text mb-2">No conversation selected</h3>
            <p className="text-muted mb-6">Select a conversation from the list to start chatting</p>
            <Button variant="outline" leftIcon={<MessageCircle className="w-4 h-4" />}>
              Start New Conversation
            </Button>
          </div>
        )}

        {/* Messages Area */}
        {state.activeConversationId && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages List */}
            <ScrollArea className="flex-1" ref={chatContainerRef}>
              <div className="p-4 space-y-4">
                {state.messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
                    <MessageCircle className="w-12 h-12 text-muted mb-4" />
                    <p className="text-muted">No messages yet</p>
                    <p className="text-xs text-muted mt-1">Start the conversation!</p>
                  </div>
                ) : (
                  <>
                    {state.messages.map((message, index) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={cn(
                          'flex gap-3 max-w-[80%]',
                          message.senderType === 'user' ? 'flex-row-reverse ml-auto' : 'flex-row'
                        )}
                      >
                        {message.senderType !== 'user' && (
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarImage src={message.senderAvatar} alt={message.senderName} />
                            <AvatarFallback className="text-xs font-medium bg-primary-100 text-primary-600">
                              {message.senderType === 'bot' ? <Bot className="w-4 h-4" /> : <ShieldIcon className="w-4 h-4" />}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className={cn(
                          'max-w-[75%] rounded-2xl px-4 py-2',
                          message.senderType === 'user' 
                            ? 'bg-primary-500 text-white rounded-tr-none' 
                            : message.senderType === 'bot' 
                              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-300 rounded-tl-none'
                              : 'bg-slate-100 dark:bg-slate-800 rounded-tr-none'
                        )}>
                          {message.replyTo && (
                            <div className="mb-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-800/50 text-xs">
                              <span className="font-medium text-muted">Replying to:</span>
                              <span className="ml-1 text-text">{message.replyTo.content.slice(0, 50)}...</span>
                            </div>
                          )}
                          
                          {message.type === 'image' && message.attachments?.[0] ? (
                            <div className="relative">
                              <img 
                                src={message.attachments[0].url} 
                                alt={message.attachments[0].name}
                                className="rounded-lg max-w-[300px] max-h-[300px] cursor-pointer"
                              />
                            </div>
                          ) : message.type === 'file' && message.attachments?.[0] ? (
                            <div className="flex items-center gap-3 p-2 rounded-lg bg-white/50 dark:bg-slate-800/50">
                              <FileText className="w-5 h-5 text-muted" />
                              <div>
                                <p className="text-sm font-medium">{message.attachments[0].name}</p>
                                <p className="text-xs text-muted">{(message.attachments[0].size / 1024).toFixed(1)} KB</p>
                              </div>
                            </div>
                          ) : (
                            <p className={cn('whitespace-pre-wrap', message.senderType === 'user' ? 'text-white' : 'text-text')}>
                              {message.content}
                            </p>
                          )}
                          
                          {message.quickReplies && message.quickReplies.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {message.quickReplies.map((reply) => (
                                <motion.button
                                  key={reply}
                                  onClick={() => sendQuickReply(reply)}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  className="px-3 py-1 text-xs rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors"
                                >
                                  {reply}
                                </motion.button>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-end gap-1 mt-1 ml-2 mr-2">
                          <span className="text-xs text-muted">{formatDateTime(message.timestamp)}</span>
                          {message.senderType === 'user' && (
                            <span className={cn(
                              'text-xs',
                              message.status === 'sending' && 'text-yellow-500 animate-pulse',
                              message.status === 'sent' && 'text-blue-500',
                              message.status === 'delivered' && 'text-green-500',
                              message.status === 'read' && 'text-green-600',
                              message.status === 'failed' && 'text-red-500',
                              'text-muted'
                            )}>
                              {message.status === 'sending' && '⏳'}
                              {message.status === 'sent' && '✓'}
                              {message.status === 'delivered' && '✓✓'}
                              {message.status === 'read' && '✓✓'}
                              {message.status === 'failed' && '✗'}
                            </span>
                          }
                          {message.senderType !== 'user' && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setReplyToMessage(message)}
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                aria-label="Reply"
                              >
                                <Reply className="w-4 h-4 text-muted" />
                              </button>
                              <button
                                onClick={() => { /* flag */ }}
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                aria-label="Flag"
                              >
                                <FlagIcon className="w-4 h-4 text-muted" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                    {state.isTyping && state.typingUsers.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-muted"
                      >
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span>{state.typingUsers.join(', ')} typing...</span>
                      </motion.div>
                    )}
                    {hasMore && !virtualLoading && (
                      <div className="py-4 text-center">
                        <Button variant="outline" onClick={loadMore} size="sm">
                          Load More Messages
                        </Button>
                      </div>
                    )}
                    {virtualLoading && (
                      <div className="py-4 text-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500 mx-auto" />
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
            )}
            
            {/* Message Input */}
            {state.activeConversationId && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="border-t border-border bg-white dark:bg-slate-900 p-4"
              >
                {replyToMessage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-3 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <p className="text-xs font-medium text-primary-700 dark:text-primary-300">Replying to</p>
                      <p className="text-sm text-text truncate">{replyToMessage.content.slice(0, 100)}</p>
                    </div>
                    <button
                      onClick={() => setReplyToMessage(null)}
                      className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                    >
                      <X className="w-4 h-4 text-muted" />
                    </button>
                  </motion.div>
                )}

                <div className="flex items-end gap-2">
                  {/* Attachment Menu */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}>
                            <Paperclip className="w-5 h-5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Attach file</TooltipContent>
                      </Tooltip>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="start" className="w-56">
                      <div className="p-2 space-y-1">
                        <label className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                          <Image className="w-5 h-5" />
                          <span>Image</span>
                          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && sendAttachment(e.target.files[0])} className="hidden" />
                        </label>
                        <label className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                          <FileText className="w-5 h-5" />
                          <span>Document</span>
                          <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => e.target.files?.[0] && sendAttachment(e.target.files[0])} className="hidden" />
                        </label>
                        <label className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                          <Video className="w-5 h-5" />
                          <span>Video</span>
                          <input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && sendAttachment(e.target.files[0])} className="hidden" />
                        </label>
                        <label className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                          <Mic className="w-5 h-5" />
                          <span>Voice Message</span>
                        </label>
                      </div>
                    </PopoverContent>
                  </Popover>
                  
                  {/* Main Input */}
                  <div className="flex-1 relative">
                    <Textarea
                      ref={textareaRef}
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        handleTyping();
                        setDraftMessages(prev => ({ ...prev, [state.activeConversationId!]: e.target.value }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage(newMessage);
                        }
                      }}
                      placeholder="Type a message..."
                      placeholderText="Type a message..."
                      className="min-h-[44px] max-h-[150px] pr-12 resize-none"
                      rows={1}
                    />
                    {showEmojiPicker && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute bottom-full left-0 right-0 mb-2 p-2 bg-white dark:bg-slate-900 rounded-xl border border-border shadow-lg z-10"
                      >
                        <div className="mb-2 flex items-center justify-between px-2">
                          <span className="text-sm font-medium text-text">Emojis</span>
                          <button onClick={() => setShowEmojiPicker(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
                          {emojiCategories.flatMap(cat => cat.emojis).map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => {
                                setNewMessage(prev => prev + emoji);
                                handleTyping();
                                textareaRef.current?.focus();
                              }}
                              className="p-2 text-2xl hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Send Button */}
                  <Button
                    onClick={() => sendMessage(newMessage)}
                    disabled={!newMessage.trim() || state.isSending}
                    isLoading={state.isSending}
                    size="icon"
                    className="h-10 w-10 rounded-xl"
                    aria-label="Send message"
                  >
                    <SendIcon className="w-5 h-5" />
                  </Button>
                </div>

                {/* Quick Replies */}
                {activeConversation?.quickReplies && activeConversation.quickReplies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {activeConversation.quickReplies.map((reply) => (
                      <Button
                        key={reply}
                        variant="ghost"
                        size="sm"
                        onClick={() => sendQuickReply(reply)}
                        className="text-xs"
                      >
                        {reply}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// Export all components
export { LiveChatSupport, SharedAccountManager, SharedAccountInviteModal };

import { 
  X, ChevronDown, ChevronUp, Paperclip, Mic, Smile, MoreVertical, Shield,
  CheckCircle, Clock, User, Bot, Zap, Shield as ShieldIcon,
  AlertCircle, Info, Menu, X as XIcon, Send, Star, ThumbsUp, ThumbsDown, Flag, Copy, Download,
  Image, FileText, Video, Mic, MicOff, Volume2, VolumeX,
  Settings, User, LogOut, Bell, Mail, Phone, Globe,
  Search, Filter, RefreshCw, Trash2, Edit, Archive,
  Reply, Forward, Pin, Unpin, Block, Flag as FlagIcon,
  MessageCircle, Send, X as XIcon2, ChevronDown as ChevronDown2, ChevronUp as ChevronUp2,
  Paperclip, Mic as Mic2, Smile as Smile2, MoreVertical as MoreVertical2, Shield as Shield2,
  CheckCircle as CheckCircle2, Clock as Clock2, User as User2, Bot as Bot2, Zap as Zap2,
  AlertCircle as AlertCircle2, Info as Info2, Menu as Menu2, X as XIcon3, Send as Send2,
  Star as Star2, ThumbsUp as ThumbsUp2, ThumbsDown as ThumbsDown2, Flag as FlagIcon2,
  Copy as Copy2, Download as Download2, Image as Image2, FileText as FileText2, Video as Video2,
  Mic as Mic3, MicOff as MicOff2, Volume2 as Volume2_2, VolumeX as VolumeX2,
  Settings as Settings2, User as User3, LogOut as LogOut2, Bell as Bell2, Mail as Mail2,
  Phone as Phone2, Globe as Globe2, Search as Search2, Filter as Filter2, RefreshCw as RefreshCw2,
  Trash2 as Trash2_2, Edit as Edit2, Archive as Archive2, Reply as Reply2, Forward as Forward2,
  Pin as Pin2, Unpin as Unpin2, Block as Block2, Flag as FlagIcon2, MessageCircle as MessageCircle2,
  Send as Send3, X as XIcon4, ChevronDown as ChevronDown3, ChevronUp as ChevronUp3,
  Paperclip as Paperclip2, Mic as Mic4, Smile as Smile3, MoreVertical as MoreVertical3,
  CheckCircle as CheckCircle3, Clock as Clock3, User as User4, Bot as Bot3, Zap as Zap3,
  AlertCircle as AlertCircle3, Info as Info3, Menu as Menu3, X as XIcon5, Send as Send4,
  Star as Star3, ThumbsUp as ThumbsUp3, ThumbsDown as ThumbsDown3, Flag as FlagIcon3,
  Copy as Copy3, Download as Download3, Image as Image3, FileText as FileText3, Video as Video3,
  Mic as Mic5, MicOff as MicOff3, Volume2 as Volume2_3, VolumeX as VolumeX3,
  Settings as Settings3, User as User5, LogOut as LogOut3, Bell as Bell3, Mail as Mail3,
  Phone as Phone3, Globe as Globe3, Search as Search3, Filter as Filter3, RefreshCw as RefreshCw3,
  Trash2 as Trash2_3, Edit as Edit3, Archive as Archive3, Reply as Reply3, Forward as Forward3,
  Pin as Pin3, Unpin as Unpin3, Block as Block3, Flag as FlagIcon4
} from 'lucide-react';