'use client';

import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Mail,
  Plus,
  AlertTriangle,
  Loader2,
  Send,
  User,
  Clock,
  Link as LinkIcon,
} from 'lucide-react';
import { TopNav } from '@/components/layout/TopNav';
import { useAuth } from '@/lib/auth-context';
import { Message } from '@/lib/types';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { formatLocalDate } from '@/lib/utils';

interface ClinicMember {
  id: string;
  user_id: string;
  clinic_name: string;
  role: string;
  is_active: boolean;
}

export default function MessagesPage() {
  const { currentClinic, loading: authLoading, user } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [readMessages, setReadMessages] = useState<Set<string>>(new Set());

  // New message dialog
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [clinicMembers, setClinicMembers] = useState<ClinicMember[]>([]);
  const [newMessage, setNewMessage] = useState({
    recipient_ids: [] as string[],
    subject: '',
    body: '',
    is_urgent: false,
    patient_id: '',
  });

  // Patients for linking
  const [patients, setPatients] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);

  useEffect(() => {
    if (authLoading || !currentClinic?.clinic_id) return;
    fetchMessages();
  }, [authLoading, currentClinic?.clinic_id]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        clinic_id: currentClinic?.clinic_id || '',
      });
      if (user?.id) {
        params.set('user_id', user.id);
      }
      const res = await fetch(`/api/messages?${params}`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      setMessages(data);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const fetchClinicMembers = async () => {
    try {
      const res = await fetch(
        `/api/clinic-memberships?clinic_id=${currentClinic?.clinic_id}`
      );
      if (res.ok) {
        const data = await res.json();
        setClinicMembers(
          data.filter((m: ClinicMember) => m.user_id !== user?.id)
        );
      }
    } catch (error) {
      console.error('Error fetching clinic members:', error);
    }
  };

  const fetchPatients = async () => {
    try {
      const res = await fetch(
        `/api/patients?clinic_id=${currentClinic?.clinic_id}`
      );
      if (res.ok) {
        const data = await res.json();
        setPatients(data);
      }
    } catch (error) {
      console.error('Error fetching patients:', error);
    }
  };

  const handleSelectMessage = async (message: Message) => {
    setSelectedMessage(message);

    // Mark as read
    if (user?.id && !readMessages.has(message.id)) {
      try {
        await fetch(`/api/messages/${message.id}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        });
        setReadMessages((prev) => new Set([...Array.from(prev), message.id]));
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    }
  };

  const handleOpenNewMessage = () => {
    setNewMessage({
      recipient_ids: [],
      subject: '',
      body: '',
      is_urgent: false,
      patient_id: '',
    });
    setNewMessageOpen(true);
    fetchClinicMembers();
    fetchPatients();
  };

  const handleSendMessage = async () => {
    if (!newMessage.recipient_ids.length || !newMessage.body) {
      toast.error('Recipient and message body are required');
      return;
    }
    try {
      setSending(true);
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: currentClinic?.clinic_id,
          sender_id: user?.id,
          recipient_ids: newMessage.recipient_ids,
          subject: newMessage.subject || null,
          body: newMessage.body,
          is_urgent: newMessage.is_urgent,
          patient_id: newMessage.patient_id || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to send message');
      const data = await res.json();
      setMessages((prev) => [data, ...prev]);
      setNewMessageOpen(false);
      toast.success('Message sent');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const toggleRecipient = (userId: string) => {
    setNewMessage((prev) => ({
      ...prev,
      recipient_ids: prev.recipient_ids.includes(userId)
        ? prev.recipient_ids.filter((id) => id !== userId)
        : [...prev.recipient_ids, userId],
    }));
  };

  // Group messages by thread
  const threadedMessages = useMemo(() => {
    const threads: Record<string, Message[]> = {};
    const standalone: Message[] = [];

    for (const msg of messages) {
      if (msg.thread_id) {
        if (!threads[msg.thread_id]) {
          threads[msg.thread_id] = [];
        }
        threads[msg.thread_id].push(msg);
      } else {
        standalone.push(msg);
      }
    }

    // Sort thread messages by date
    for (const threadId of Object.keys(threads)) {
      threads[threadId].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    // Build display list: use first message of each thread + standalone
    const displayList: Message[] = [];
    const addedThreads = new Set<string>();

    for (const msg of messages) {
      if (msg.thread_id) {
        if (!addedThreads.has(msg.thread_id)) {
          addedThreads.add(msg.thread_id);
          displayList.push(threads[msg.thread_id][0]);
        }
      } else {
        displayList.push(msg);
      }
    }

    return { displayList, threads };
  }, [messages]);

  const getThreadMessages = (message: Message): Message[] => {
    if (message.thread_id && threadedMessages.threads[message.thread_id]) {
      return threadedMessages.threads[message.thread_id];
    }
    return [message];
  };

  const isUnread = (message: Message): boolean => {
    if (message.sender_id === user?.id) return false;
    return !readMessages.has(message.id) && !message.is_read;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <TopNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-[600px] rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Mail className="h-6 w-6" />
              Messages
            </h1>
            <p className="text-slate-500 mt-1">
              Internal messaging for your clinic team
            </p>
          </div>
          <Button className="gap-2" onClick={handleOpenNewMessage}>
            <Plus className="h-4 w-4" />
            New Message
          </Button>
        </div>

        {/* Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Message List */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-700">
                Inbox ({messages.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-16 rounded" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <Mail className="h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500">No messages</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  {threadedMessages.displayList.map((message) => {
                    const unread = isUnread(message);
                    const isSelected = selectedMessage?.id === message.id;
                    return (
                      <div
                        key={message.id}
                        className={`px-4 py-3 cursor-pointer border-b hover:bg-slate-50 transition-colors ${
                          isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                        }`}
                        onClick={() => handleSelectMessage(message)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm truncate ${
                                unread ? 'font-semibold text-slate-900' : 'text-slate-700'
                              }`}
                            >
                              {message.subject || '(No subject)'}
                            </p>
                            <p className="text-xs text-slate-500 truncate mt-0.5">
                              {message.sender_name || message.sender_id?.slice(0, 8)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs text-slate-400 whitespace-nowrap">
                              {formatDistanceToNow(new Date(message.created_at), {
                                addSuffix: true,
                              })}
                            </span>
                            <div className="flex items-center gap-1">
                              {message.is_urgent && (
                                <Badge
                                  variant="outline"
                                  className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1"
                                >
                                  URGENT
                                </Badge>
                              )}
                              {unread && (
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-1">
                          {message.body?.slice(0, 80)}
                          {(message.body?.length || 0) > 80 ? '...' : ''}
                        </p>
                      </div>
                    );
                  })}
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Message Detail */}
          <Card className="lg:col-span-2">
            {selectedMessage ? (
              <>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {selectedMessage.subject || '(No subject)'}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center gap-1 text-sm text-slate-600">
                          <User className="h-3.5 w-3.5" />
                          {selectedMessage.sender_name ||
                            selectedMessage.sender_id?.slice(0, 8)}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="h-3 w-3" />
                          {formatLocalDate(selectedMessage.created_at, 'MMM d, yyyy h:mm a')}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {selectedMessage.is_urgent && (
                        <Badge
                          variant="outline"
                          className="bg-red-100 text-red-700 border-red-200 gap-1"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Urgent
                        </Badge>
                      )}
                      {selectedMessage.patient_id && (
                        <Badge
                          variant="outline"
                          className="bg-blue-100 text-blue-700 border-blue-200 gap-1"
                        >
                          <LinkIcon className="h-3 w-3" />
                          Patient Linked
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {getThreadMessages(selectedMessage).map((msg, idx) => (
                      <div key={msg.id}>
                        {idx > 0 && <Separator className="my-4" />}
                        <div className="space-y-2">
                          {idx > 0 && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <User className="h-3 w-3" />
                              {msg.sender_name || msg.sender_id?.slice(0, 8)}
                              <span>-</span>
                              {formatLocalDate(msg.created_at, 'MMM d, yyyy h:mm a')}
                            </div>
                          )}
                          <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                            {msg.body}
                          </div>
                        </div>
                      </div>
                    ))}
                  </ScrollArea>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex flex-col items-center justify-center h-[500px]">
                <Mail className="h-12 w-12 text-slate-200 mb-4" />
                <h3 className="text-lg font-medium text-slate-500">
                  Select a message to read
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Choose a message from the list on the left
                </p>
              </CardContent>
            )}
          </Card>
        </div>

        {/* New Message Dialog */}
        <Dialog open={newMessageOpen} onOpenChange={setNewMessageOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Message</DialogTitle>
              <DialogDescription>
                Send a message to your clinic team members.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Recipients</Label>
                <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                  {clinicMembers.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-2">
                      No other clinic members found
                    </p>
                  ) : (
                    clinicMembers.map((member) => {
                      const isSelected = newMessage.recipient_ids.includes(
                        member.user_id
                      );
                      return (
                        <div
                          key={member.user_id}
                          className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer hover:bg-slate-50 ${
                            isSelected ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => toggleRecipient(member.user_id)}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center text-white text-xs ${
                                isSelected
                                  ? 'bg-blue-600 border-blue-600'
                                  : 'border-slate-300'
                              }`}
                            >
                              {isSelected && '✓'}
                            </div>
                            <span className="text-sm">
                              {member.user_id.slice(0, 8)}...
                            </span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {member.role}
                          </Badge>
                        </div>
                      );
                    })
                  )}
                </div>
                {newMessage.recipient_ids.length > 0 && (
                  <p className="text-xs text-slate-500">
                    {newMessage.recipient_ids.length} recipient(s) selected
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="msg-subject">Subject</Label>
                <Input
                  id="msg-subject"
                  value={newMessage.subject}
                  onChange={(e) =>
                    setNewMessage((prev) => ({ ...prev, subject: e.target.value }))
                  }
                  placeholder="Message subject"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="msg-body">Message *</Label>
                <Textarea
                  id="msg-body"
                  value={newMessage.body}
                  onChange={(e) =>
                    setNewMessage((prev) => ({ ...prev, body: e.target.value }))
                  }
                  placeholder="Type your message..."
                  rows={5}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newMessage.is_urgent}
                    onCheckedChange={(checked) =>
                      setNewMessage((prev) => ({ ...prev, is_urgent: checked }))
                    }
                  />
                  <Label className="text-sm flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    Mark as Urgent
                  </Label>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Link to Patient (optional)</Label>
                <Select
                  value={newMessage.patient_id}
                  onValueChange={(v) =>
                    setNewMessage((prev) => ({ ...prev, patient_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a patient..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No patient</SelectItem>
                    {patients.map((pt) => (
                      <SelectItem key={pt.id} value={pt.id}>
                        {pt.first_name} {pt.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setNewMessageOpen(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendMessage}
                disabled={sending || !newMessage.body || !newMessage.recipient_ids.length}
                className="gap-2"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
