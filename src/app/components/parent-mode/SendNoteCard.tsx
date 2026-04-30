/**
 * v26: SendNoteCard — parent → kid encouragement.
 *
 * One-line note from parent (or guardian) to a specific kid. Shows on
 * the kid's dashboard until acknowledged. Lives on the parent
 * Dashboard, scoped to the currently-selected child.
 *
 * Tight constraints by design:
 *   - 140 chars max (this is encouragement, not chat)
 *   - One unread note at a time per kid (server enforces)
 *   - Parent sees no reply UI — this is one-way warmth
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { Heart } from 'lucide-react';
import { sendFamilyNote } from '../../../utils/api';

interface SendNoteCardProps {
  childId: string;
  childName: string;
  // Display name to show on the kid's note card (e.g. "Mama", "Baba",
  // user's actual first name). Falls back to "Your grown-up" inside
  // the SendNote dialog.
  fromName: string;
}

const SUGGESTIONS = [
  '🌟 Proud of you today!',
  '💖 You worked hard. Keep going.',
  '🤲 May Allah bless your efforts.',
  '🌸 I noticed your kindness today.',
  '🕌 Your Salah is making a difference.',
];

export function SendNoteCard({ childId, childName, fromName }: SendNoteCardProps) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      toast.error('Write something first.');
      return;
    }
    if (trimmed.length > 140) {
      toast.error('Notes are 140 characters or fewer.');
      return;
    }
    setSending(true);
    try {
      await sendFamilyNote({
        childId,
        body: trimmed,
        fromName: fromName || 'Your grown-up',
      });
      toast.success(`Sent to ${childName}. They'll see it next time.`);
      setBody('');
    } catch (err: any) {
      console.error('Failed to send note:', err);
      toast.error(err?.message || 'Could not send the note.');
    } finally {
      setSending(false);
    }
  };

  const remaining = 140 - body.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Heart className="h-4 w-4 text-rose-500" />
          Send {childName} a note
        </CardTitle>
        <CardDescription>
          A short line of encouragement. They'll see it on their dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Proud of you for praying Asr on time today!"
          rows={3}
          maxLength={160 /* tiny buffer; server validates 140 */}
          className="resize-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setBody(s)}
              className="text-xs px-2.5 py-1 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className={`text-xs ${remaining < 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {remaining} chars left
          </span>
          <Button
            size="sm"
            onClick={send}
            disabled={sending || body.trim().length === 0 || body.length > 140}
            className="bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600"
          >
            {sending ? 'Sending…' : 'Send note'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
