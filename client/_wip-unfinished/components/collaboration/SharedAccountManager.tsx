import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '../../utils/cn';
import { 
  Users, Share2, UserPlus, UserMinus, MessageCircle, 
  Bell, AlertCircle, CheckCircle, XCircle, 
  Edit, Trash2, Shield, Lock, Key,
  CreditCard, DollarSign, TrendingUp, Activity,
  Eye, Edit as EditIcon, MoreVertical, Copy
} from 'lucide-react';
import { 
  Button, Input, Select, Card, CardHeader, CardTitle, CardDescription, CardContent, 
  Badge, Avatar, AvatarImage, AvatarFallback, Modal, Tabs, TabsList, TabsTrigger, 
  TabsContent, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, Tooltip, TooltipTrigger, TooltipContent, Switch, InputOTP,
  InputOTPGroup, InputOTPSlot, Separator, Alert, AlertDescription, Progress
} from '../ui';
import { useAccountStore } from '../../store/accountStore';
import { Account } from '../../types';
import { useAdvancedCache, useWebSocket, useToastNotifications } from '../../hooks';

interface SharedAccount {
  id: string;
  accountId: string;
  ownerId: string;
  sharedWithId: string;
  permission: 'view' | 'deposit' | 'withdraw' | 'transfer' | 'admin';
  status: 'pending' | 'active' | 'revoked';
  createdAt: string;
  acceptedAt?: string;
  account?: Account;
  sharedWith?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  owner?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface CollaborationInvite {
  id: string;
  accountId: string;
  senderId: string;
  recipientEmail: string;
  permission: 'view' | 'deposit' | 'withdraw' | 'transfer' | 'admin';
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: string;
  expiresAt: string;
  account?: Account;
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export function SharedAccountManager({ accountId }: { accountId: string }) {
  const { accounts, fetchAccounts } = useAccountStore();
  const { toast } = useToastNotifications();
  const [sharedAccounts, setSharedAccounts] = useState<SharedAccount[]>([]);
  const [pendingInvites, setPendingInvites] = useState<CollaborationInvite[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'invite'>('active');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedShare, setSelectedShare] = useState<SharedAccount | null>(null);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    permission: 'view' as const,
    message: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const account = accounts.find(a => a.id === accountId);

  // WebSocket for real-time collaboration updates
  const { 
    notifications: wsNotifications, 
    addNotification,
    markRead 
  } = useNotifications();

  // Advanced cache for shared data
  const { data: cachedShares, refresh: refreshShares } = useAdvancedCache<SharedAccount[]>(
    `shared-accounts-${accountId}`,
    async () => {
      // In real app, fetch from API
      return [];
    },
    { ttl: 60000 }
  );

  // Real-time presence tracking
  const [activeUsers, setActiveUsers] = useState<Array<{
    id: string;
    name: string;
    avatar?: string;
    lastSeen: Date;
    action: string;
  }>>([]);

  useEffect(() => {
    if (accountId) {
      fetchSharedAccounts();
    }
  }, [accountId]);

  const fetchSharedAccounts = async () => {
    setIsLoading(true);
    try {
      // In real app, fetch from API
      // const response = await api.getSharedAccounts(accountId);
      // setSharedAccounts(response.data);
    } catch (error) {
      toast.error('Failed to load shared accounts');
    } finally {
      setIsLoading(false);
    }
  };

  const sendInvite = async () => {
    if (!inviteForm.email) {
      toast.error('Please enter an email address');
      return;
    }

    setIsLoading(true);
    try {
      // In real app, call API
      // await api.inviteToAccount(accountId, inviteForm);
      
      // Simulate sending
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newInvite: CollaborationInvite = {
        id: crypto.randomUUID(),
        accountId,
        senderId: 'current-user',
        recipientEmail: inviteForm.email,
        permission: inviteForm.permission,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        account: { ...account!, id: accountId },
        sender: { id: 'current-user', firstName: 'You', lastName: '', email: '' },
      };
      
      setPendingInvites(prev => [newInvite, ...prev]);
      setShowInviteModal(false);
      setInviteForm({ email: '', permission: 'view', message: '' });
      toast.success(`Invitation sent to ${inviteForm.email}`);
      
      // Send real-time notification
      addNotification({
        type: 'info',
        title: 'New Collaboration Invite',
        message: `You've been invited to collaborate on ${account?.accountNumber}`,
        actionUrl: `/accounts/${accountId}/collaborate`,
        actionLabel: 'View Invite',
      });
    } catch (error) {
      toast.error('Failed to send invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const revokeAccess = async (shareId: string) => {
    try {
      // await api.revokeShare(shareId);
      setSharedAccounts(prev => prev.filter(s => s.id !== shareId));
      toast.success('Access revoked successfully');
    } catch (error) {
      toast.error('Failed to revoke access');
    }
  };

  const updatePermission = async (shareId: string, permission: SharedAccount['permission']) => {
    try {
      // await api.updateSharePermission(shareId, permission);
      setSharedAccounts(prev => prev.map(s => 
        s.id === shareId ? { ...s, permission } : s
      ));
      toast.success('Permission updated');
    } catch (error) {
      toast.error('Failed to update permission');
    }
  };

  const acceptInvite = async (inviteId: string) => {
    try {
      // await api.acceptInvite(inviteId);
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
      toast.success('Invitation accepted');
    } catch (error) {
      toast.error('Failed to accept invitation');
    }
  };

  const declineInvite = async (inviteId: string) => {
    try {
      // await api.declineInvite(inviteId);
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
      toast.success('Invitation declined');
    } catch (error) {
      toast.error('Failed to decline invitation');
    }
  };

  const resendInvite = async (invite: CollaborationInvite) => {
    try {
      // await api.resendInvite(invite.id);
      toast.success('Invitation resent');
    } catch (error) {
      toast.error('Failed to resend invitation');
    }
  };

  const copyInviteLink = (invite: CollaborationInvite) => {
    const link = `${window.location.origin}/invite/${invite.id}`;
    navigator.clipboard.writeText(link);
    toast.success('Invite link copied to clipboard');
  };

  const getPermissionLabel = (permission: string) => {
    const labels: Record<string, string> = {
      view: 'View Only',
      deposit: 'Deposit',
      withdraw: 'Withdraw',
      transfer: 'Transfer',
      admin: 'Admin',
    };
    return labels[permission] || permission;
  };

  const getPermissionColor = (permission: string) => {
    const colors: Record<string, string> = {
      view: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      deposit: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      withdraw: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
      transfer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    };
    return colors[permission] || 'bg-gray-100 text-gray-700';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
      revoked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      declined: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      expired: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Shared Access</h1>
          <p className="text-muted mt-1">Manage who has access to account {account?.accountNumber}</p>
        </div>
        <Button onClick={() => setShowInviteModal(true)} leftIcon={<UserPlus className="w-4 h-4" />}>
          Invite Collaborator
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Active ({sharedAccounts.filter(s => s.status === 'active').length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending ({pendingInvites.length})
          </TabsTrigger>
          <TabsTrigger value="invite" className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Invite
          </TabsTrigger>
        </TabsList>

        {/* Active Shares */}
        <TabsContent value="active">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse">
                  <div className="h-16 bg-slate-200 dark:bg-slate-700 rounded-xl" />
                </div>
              ))
            )} : sharedAccounts.filter(s => s.status === 'active').length === 0 ? (
              <Card className="text-center py-12">
                <Users className="w-12 h-12 text-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium text-text mb-2">No active collaborators</h3>
                <p className="text-muted mb-4">Invite someone to collaborate on this account</p>
                <Button onClick={() => setShowInviteModal(true)} leftIcon={<UserPlus className="w-4 h-4" />}>
                  Invite Collaborator
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {sharedAccounts.filter(s => s.status === 'active').map((share) => (
                  <Card key={share.id} className="hover:shadow-card-hover transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={share.sharedWith?.avatar} />
                            <AvatarFallback className="text-sm font-medium">
                              {share.sharedWith?.firstName?.[0]}{share.sharedWith?.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-text">
                              {share.sharedWith?.firstName} {share.sharedWith?.lastName}
                            </p>
                            <p className="text-sm text-muted">{share.sharedWith?.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="success">Active</Badge>
                          <Badge className={getPermissionColor(share.permission)}>
                            {getPermissionLabel(share.permission)}
                          </Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => setSelectedShare(share)}
                              >
                                <Eye className="w-4 h-4 mr-2" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => {
                                  // Edit permission modal
                                }}
                              >
                                <EditIcon className="w-4 h-4 mr-2" /> Change Permission
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => revokeAccess(share.id)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <UserMinus className="w-4 h-4 mr-2" /> Revoke Access
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-sm text-muted">
                        <span>Shared on {new Date(share.createdAt).toLocaleDateString()}</span>
                        {share.acceptedAt && (
                          <span>Accepted on {new Date(share.acceptedAt!).toLocaleDateString()}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Active Users Presence */}
            {activeUsers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-green-500 animate-pulse" />
                    Active Now
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {activeUsers.map(user => (
                      <div key={user.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-900/20">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback>{user.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{user.name}</span>
                        <span className="text-xs text-muted">{user.action}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

        {/* Pending Invites */}
        <TabsContent value="pending">
          {pendingInvites.length === 0 ? (
            <Card className="text-center py-12">
              <Mail className="w-12 h-12 text-muted mx-auto mb-4" />
              <h3 className="text-lg font-medium text-text mb-2">No pending invitations</h3>
              <p className="text-muted mb-4">Sent invitations will appear here</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingInvites.map((invite) => (
                <Card key={invite.id} className="border-yellow-200 dark:border-yellow-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center text-yellow-600">
                          <Mail className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium text-text">{invite.recipientEmail}</p>
                          <p className="text-sm text-muted">
                            {getPermissionLabel(invite.permission)} • Expires {new Date(invite.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="warning">{invite.status}</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => resendInvite(invite)}>
                              <RotateCcw className="w-4 h-4 mr-2" /> Resend
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copyInviteLink(invite)}>
                              <Copy className="w-4 h-4 mr-2" /> Copy Link
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => declineInvite(invite.id)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <XCircle className="w-4 h-4 mr-2" /> Cancel Invite
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-sm text-muted">
                      <span>Sent on {new Date(invite.createdAt).toLocaleDateString()}</span>
                      {invite.message && (
                        <span className="italic">"{invite.message}"</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Invite New Collaborator */}
          <TabsContent value="invite">
            <Card>
              <CardHeader>
                <CardTitle>Invite Collaborator</CardTitle>
                <CardDescription>Share access to this account with another user</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => { e.preventDefault(); sendInvite(); }} className="space-y-4">
                  <div>
                    <label className="label">Email Address</label>
                    <Input
                      type="email"
                      placeholder="collaborator@example.com"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      error={inviteForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteForm.email) ? 'Invalid email' : undefined}
                    />
                  </div>

                  <div>
                    <label className="label">Permission Level</label>
                    <Select
                      value={inviteForm.permission}
                      onValueChange={(v) => setInviteForm({ ...inviteForm, permission: v as any })}
                      options={[
                        { value: 'view', label: 'View Only - Can see balance and transactions' },
                        { value: 'deposit', label: 'Deposit - Can deposit funds' },
                        { value: 'withdraw', label: 'Withdraw - Can withdraw funds' },
                        { value: 'transfer', label: 'Transfer - Can transfer funds' },
                        { value: 'admin', label: 'Admin - Full access including sharing' },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="label">Personal Message (Optional)</label>
                    <textarea
                      value={inviteForm.message}
                      onChange={(e) => setInviteForm({ ...inviteForm, message: e.target.value })}
                      placeholder="Add a personal message..."
                      className="input h-24 resize-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button type="button" variant="secondary" onClick={() => setShowInviteModal(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" isLoading={isLoading} leftIcon={<UserPlus className="w-4 h-4" />}>
                      Send Invitation
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Permission Guide */}
            <Card>
              <CardHeader>
                <CardTitle>Permission Levels Explained</CardTitle>
                <CardDescription>Understand what each permission level allows</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { permission: 'view', label: 'View Only', description: 'Can view balance, transactions, and statements', icon: Eye },
                    { permission: 'deposit', label: 'Deposit', description: 'Can deposit funds into the account', icon: ArrowDownLeft },
                    { permission: 'withdraw', label: 'Withdraw', description: 'Can withdraw funds from the account', icon: ArrowUpRight },
                    { permission: 'transfer', label: 'Transfer', description: 'Can transfer funds to other accounts', icon: ArrowRightLeft },
                    { permission: 'admin', label: 'Admin', description: 'Full access including managing collaborators', icon: Shield },
                  ].map(({ permission, label, description, icon: Icon }) => (
                    <div key={permission} className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', getPermissionColor(permission).replace('bg-', 'bg-').replace('text-', 'text-'))}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-text">{label}</p>
                        <p className="text-sm text-muted">{description}</p>
                      </div>
                      <Badge className={getPermissionColor(permission)}>{label}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    )
  );
}

export function SharedAccountInviteModal({ 
  isOpen, 
  onClose, 
  onAccept,
  onDecline,
  invite 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onAccept: () => void;
  onDecline: () => void;
  invite: CollaborationInvite;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-modal-title"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 id="invite-modal-title" className="text-xl font-semibold text-text">Collaboration Invitation</h2>
                <motion.button
                  onClick={onClose}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-2 rounded-lg text-muted hover:text-text hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Close"
                >
                  <XIcon className="w-5 h-5" />
                </motion.button>
              </div>
              
              <div className="space-y-4">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4 text-blue-600 dark:text-blue-400">
                    <Mail className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-semibold text-text mb-1">Collaboration Invitation</h3>
                  <p className="text-muted">You've been invited to collaborate on an account</p>
                </div>

                <div className="space-y-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted">Account</p>
                      <p className="font-medium text-text">{invite.account?.accountNumber || 'Account'}</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      Invitation
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted">Invited by</p>
                      <p className="font-medium text-text">{invite.sender?.firstName} {invite.sender?.lastName}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted">Permission</p>
                      <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        Admin
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted">Expires</p>
                      <p className="font-medium text-text">{new Date(invite.expiresAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {invite.message && (
                    <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200">
                      <p className="text-sm text-yellow-800 dark:text-yellow-300">
                        <strong>Message:</strong> {invite.message}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <Button 
                    variant="outline" 
                    className="flex-1" 
                    onClick={() => { onDecline(); onClose(); }}
                  >
                    Decline
                  </Button>
                  <Button 
                    className="flex-1" 
                    onClick={() => { onAccept(); onClose(); }}
                    leftIcon={<CheckCircle className="w-4 h-4" />}
                  >
                    Accept Invitation
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

import { motion, AnimatePresence } from 'framer-motion';
import { Clock, RotateCcw, Copy, XCircle, CheckCircle, Mail } from 'lucide-react';