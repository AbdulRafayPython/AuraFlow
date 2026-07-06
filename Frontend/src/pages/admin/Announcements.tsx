/**
 * Announcements Page
 * Create, edit, pin, and delete community announcements.
 */

import React, { useState, useEffect } from 'react';
import { useCommunityDashboard } from '@/contexts/CommunityDashboardContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Megaphone,
  Pin,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Clock,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface Announcement {
  id: number;
  title: string;
  body: string;
  is_pinned: boolean;
  expires_at: string | null;
  created_at: string;
  author_name: string;
}

export default function Announcements() {
  const { toast } = useToast();
  const { selectedCommunity } = useCommunityDashboard();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    if (selectedCommunity?.id) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommunity?.id]);

  const load = async () => {
    if (!selectedCommunity?.id) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/community/${selectedCommunity.id}/announcements`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      const data = await res.json();
      setAnnouncements(data.announcements || []);
    } catch {
      toast({ title: 'Failed to load announcements', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setTitle('');
    setBody('');
    setIsPinned(false);
    setExpiresAt('');
    setEditing(null);
    setShowCreate(true);
  };

  const openEdit = (a: Announcement) => {
    setTitle(a.title);
    setBody(a.body);
    setIsPinned(Boolean(a.is_pinned));
    setExpiresAt(a.expires_at ? a.expires_at.slice(0, 16) : '');
    setEditing(a);
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: 'Title and body are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const url = editing
        ? `/api/admin/community/${selectedCommunity!.id}/announcements/${editing.id}`
        : `/api/admin/community/${selectedCommunity!.id}/announcements`;

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          is_pinned: isPinned,
          expires_at: expiresAt || null,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      toast({ title: editing ? 'Announcement updated' : 'Announcement created' });
      setShowCreate(false);
      void load();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      const res = await fetch(
        `/api/admin/community/${selectedCommunity!.id}/announcements/${id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      if (!res.ok) throw new Error(await res.text());
      toast({ title: 'Announcement deleted' });
      void load();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Announcements
          </h1>
          <p className="text-muted-foreground text-sm">
            Pinned posts shown at the top of your community dashboard.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> New Announcement
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Megaphone className="h-12 w-12 mb-3 opacity-30" />
            <p>No announcements yet. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map(a => (
            <Card key={a.id} className={a.is_pinned ? 'border-primary/50' : ''}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{a.title}</h3>
                      {a.is_pinned ? (
                        <Badge variant="default" className="text-xs gap-1">
                          <Pin className="h-3 w-3" /> Pinned
                        </Badge>
                      ) : null}
                      {a.expires_at && new Date(a.expires_at) < new Date() ? (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Clock className="h-3 w-3" /> Expired
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.body}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      By {a.author_name} · {formatDate(a.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Announcement' : 'New Announcement'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What's this about?"
                maxLength={255}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Message</label>
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your announcement..."
                rows={5}
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={e => setIsPinned(e.target.checked)}
                  className="rounded"
                />
                Pin at top
              </label>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={e => setExpiresAt(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editing ? 'Save Changes' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
