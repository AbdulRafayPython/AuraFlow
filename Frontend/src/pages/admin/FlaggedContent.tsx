/**
 * Flagged Content Page
 * Displays all flagged messages with filtering, sorting, and moderation actions.
 * All data is scoped to the selected community.
 * Admins can approve, warn, delete, or ban based on severity.
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import adminService, { FlaggedMessage, PaginationInfo } from '@/services/adminService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle,
  Check,
  X,
  Ban,
  Trash2,
  MoreHorizontal,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  MessageSquare,
  Clock,
  Search
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

type ActionType = 'approve' | 'warn' | 'delete' | 'ban' | 'mute';

interface ActionDialogState {
  isOpen: boolean;
  action: ActionType | null;
  flagId: number | null;
  username: string;
}

export default function FlaggedContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { selectedCommunity } = useCommunityDashboard();
  
  const [messages, setMessages] = useState<FlaggedMessage[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Filters
  const [severity, setSeverity] = useState<string>('all');
  const [flagType, setFlagType] = useState<string>('all');
  const [status, setStatus] = useState<string>('pending');
  const [search, setSearch] = useState('');
  
  // Action dialog
  const [actionDialog, setActionDialog] = useState<ActionDialogState>({
    isOpen: false,
    action: null,
    flagId: null,
    username: ''
  });
  const [actionNote, setActionNote] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 20;

  const fetchFlaggedMessages = async () => {
    if (!selectedCommunity) return;
    
    setLoading(true);
    try {
      const params: any = {
        limit,
        offset: (currentPage - 1) * limit
      };
      
      if (severity !== 'all') params.severity = severity;
      if (flagType !== 'all') params.flag_type = flagType;
      if (status !== 'all') params.status = status;
      
      const data = await adminService.getFlaggedMessages(selectedCommunity.id, params);
      setMessages(data.messages);
      setPagination(data.pagination);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load flagged messages',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlaggedMessages();
  }, [selectedCommunity?.id, currentPage, severity, flagType, status]);

  const handleAction = async () => {
    if (!actionDialog.action || !actionDialog.flagId || !selectedCommunity) return;
    
    setActionLoading(true);
    try {
      await adminService.resolveModerationFlag(
        selectedCommunity.id,
        actionDialog.flagId,
        actionDialog.action,
        actionNote || undefined
      );
      
      toast({
        title: 'Action Completed',
        description: `${actionDialog.action.charAt(0).toUpperCase() + actionDialog.action.slice(1)} action applied successfully.`
      });
      
      // Remove from list or refresh
      setMessages(prev => prev.filter(m => m.id !== actionDialog.flagId));
      setActionDialog({ isOpen: false, action: null, flagId: null, username: '' });
      setActionNote('');
    } catch (error: any) {
      toast({
        title: 'Action Failed',
        description: error.message || 'Failed to apply moderation action',
        variant: 'destructive'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const openActionDialog = (action: ActionType, flagId: number, username: string) => {
    setActionDialog({ isOpen: true, action, flagId, username });
  };

  const getSeverityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      critical: 'bg-red-500/10 text-red-500 border-red-500/20',
    };
    return (
      <Badge variant="outline" className={cn('text-xs', colors[severity] || colors.medium)}>
        {severity}
      </Badge>
    );
  };

  const getActionDialogContent = () => {
    const configs: Record<ActionType, { title: string; description: string; variant: 'default' | 'destructive' }> = {
      approve: {
        title: 'Approve Content',
        description: 'This will mark the content as reviewed and acceptable. No action will be taken against the user.',
        variant: 'default'
      },
      warn: {
        title: 'Warn User',
        description: `Send a warning to ${actionDialog.username}. This will be logged but won't restrict their access.`,
        variant: 'default'
      },
      delete: {
        title: 'Delete Message',
        description: 'This will permanently delete the flagged message. The user will be notified.',
        variant: 'destructive'
      },
      ban: {
        title: 'Ban User',
        description: `This will ban ${actionDialog.username} from the community. They will not be able to post messages.`,
        variant: 'destructive'
      },
      mute: {
        title: 'Mute User',
        description: `This will temporarily mute ${actionDialog.username}. They can still read but cannot post.`,
        variant: 'default'
      }
    };
    return configs[actionDialog.action!] || configs.approve;
  };

  const totalPages = pagination ? Math.ceil(pagination.total / limit) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            Flagged Content
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review and moderate flagged messages
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchFlaggedMessages}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by username or content..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={flagType} onValueChange={setFlagType}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Flag Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="spam">Spam</SelectItem>
                <SelectItem value="harassment">Harassment</SelectItem>
                <SelectItem value="hate_speech">Hate Speech</SelectItem>
                <SelectItem value="inappropriate">Inappropriate</SelectItem>
                <SelectItem value="threat">Threat</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Content Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">User</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead className="w-[120px]">Type</TableHead>
                  <TableHead className="w-[100px]">Severity</TableHead>
                  <TableHead className="w-[100px]">Confidence</TableHead>
                  <TableHead className="w-[150px]">Time</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-full" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : messages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Check className="h-8 w-8 text-green-500" />
                        <span className="font-medium">No flagged content</span>
                        <span className="text-sm text-muted-foreground">
                          All caught up! Check back later.
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  messages.filter(m => 
                    !search || 
                    m.user.username.toLowerCase().includes(search.toLowerCase()) ||
                    m.message_text.toLowerCase().includes(search.toLowerCase())
                  ).map(message => (
                    <TableRow key={message.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={message.user.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {message.user.username[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-sm">{message.user.username}</div>
                            <div className="text-xs text-muted-foreground">
                              {message.user.violation_count} violations
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[300px]">
                          <p className="text-sm line-clamp-2">{message.message_text}</p>
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <MessageSquare className="h-3 w-3" />
                            #{message.channel.name}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {message.flag_type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{getSeverityBadge(message.severity)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-accent rounded-full"
                              style={{ width: `${message.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(message.confidence * 100)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(message.created_at).toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => openActionDialog('approve', message.id, message.user.username)}
                            >
                              <Check className="h-4 w-4 mr-2 text-green-500" />
                              Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openActionDialog('warn', message.id, message.user.username)}
                            >
                              <AlertCircle className="h-4 w-4 mr-2 text-yellow-500" />
                              Warn User
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => openActionDialog('delete', message.id, message.user.username)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Message
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openActionDialog('mute', message.id, message.user.username)}
                            >
                              <X className="h-4 w-4 mr-2 text-orange-500" />
                              Mute User
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openActionDialog('ban', message.id, message.user.username)}
                              className="text-destructive"
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Ban User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>

        {/* Pagination */}
        {pagination && pagination.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, pagination.total)} of {pagination.total}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={!pagination.has_more}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Action Confirmation Dialog */}
      <Dialog open={actionDialog.isOpen} onOpenChange={open => !open && setActionDialog(prev => ({ ...prev, isOpen: false }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionDialog.action && getActionDialogContent().title}</DialogTitle>
            <DialogDescription>
              {actionDialog.action && getActionDialogContent().description}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Note (optional)</label>
            <Textarea
              placeholder="Add a note about this action..."
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionDialog({ isOpen: false, action: null, flagId: null, username: '' })}
            >
              Cancel
            </Button>
            <Button
              variant={actionDialog.action ? getActionDialogContent().variant : 'default'}
              onClick={handleAction}
              disabled={actionLoading}
            >
              {actionLoading ? 'Processing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
