/**
 * v26: ParentNoteCard — emotional connection moment.
 *
 * Shows the kid the latest unread note their parent / guardian sent.
 * One short line + a heart. After viewing, the kid taps "Got it ❤️"
 * which marks the note read on the server.
 *
 * Notes are NOT chat. There's no reply UI — this is intentional.
 * One-way encouragement from parent to kid keeps the surface
 * supportive and avoids turning the kid screen into a comms app.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart } from 'lucide-react';

interface ParentNoteCardProps {
  note: {
    id: string;
    body: string;
    fromName: string;   // "Mama", "Baba", or whatever the parent stored
    sentAt: string;     // ISO
  } | null;
  onAcknowledge: (noteId: string) => void | Promise<void>;
}

export function ParentNoteCard({ note, onAcknowledge }: ParentNoteCardProps) {
  const [ack, setAck] = useState(false);

  if (!note || ack) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl bg-gradient-to-br from-rose-100 via-pink-100 to-amber-50 p-1 shadow-md"
      >
        <div className="rounded-xl bg-white px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center shadow-md shrink-0">
              <Heart className="w-6 h-6 text-white" fill="white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                A note from {note.fromName}
              </p>
              <p className="text-base text-gray-900 mt-1 leading-relaxed">
                {note.body}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setAck(true);
              try {
                await onAcknowledge(note.id);
              } catch (e) {
                // Even if the server call fails, we keep the card hidden
                // for this session — the worst that happens is the same
                // note shows up again on next refresh.
                console.warn('Could not acknowledge note:', e);
              }
            }}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-semibold py-2.5 shadow-md"
          >
            Got it ❤️
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
