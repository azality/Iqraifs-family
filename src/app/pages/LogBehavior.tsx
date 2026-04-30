import { useState, useEffect } from "react";
import { getStorageSync } from "../../utils/storage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useTrackableItems } from "../hooks/useTrackableItems";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { Lock, AlertCircle, Edit, Plus, Star } from "lucide-react";
import { api } from "../../utils/api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { PrayerApprovalsWidget } from "../components/PrayerApprovalsWidget";
import { PointEvent } from "../data/mockData";

// v15: Salah tri-state. Each Salah event carries a salahState so the audit
// trail can distinguish on-time prayer vs qadha (made up later) vs missed.
type SalahState = 'ontime' | 'qadha' | 'missed';

export function LogBehavior() {
  const { user, isParentMode, role } = useAuth();
  const { getCurrentChild, logEvent, getChildEvents, family } = useFamilyContext();
  const { items: trackableItems, loading: itemsLoading } = useTrackableItems();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [bonusPoints, setBonusPoints] = useState<number>(0);
  const [bonusReason, setBonusReason] = useState("");
  const [standaloneBonusPoints, setStandaloneBonusPoints] = useState<number>(0);
  const [standaloneBonusReason, setStandaloneBonusReason] = useState("");

  // v15: per-family qadha / missed point values (default 1 / -1)
  const salahQadhaPoints = (family as any)?.salahQadhaPoints ?? 1;
  const salahMissedPoints = (family as any)?.salahMissedPoints ?? -1;
  const [showSingletonAlert, setShowSingletonAlert] = useState(false);
  const [singletonConflict, setSingletonConflict] = useState<any>(null);
  const [showDedupeAlert, setShowDedupeAlert] = useState(false);
  const [dedupeData, setDedupeData] = useState<any>(null);
  const [todayPrayersLogged, setTodayPrayersLogged] = useState<Set<string>>(new Set());
  const [pointEvents, setPointEvents] = useState<PointEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  // v19: in-flight submit lock so a fast double-click does not POST /events
  // twice. Without this, Tantrum logged once was creating 2-3 duplicate
  // rows because the click handlers ran before setSelectedItemId(null) cleared
  // the form state. This lock blocks the second invocation cleanly.
  const [submitting, setSubmitting] = useState(false);
  const child = getCurrentChild();

  // Load point events for prayer tracking
  useEffect(() => {
    const loadEvents = async () => {
      if (!child) {
        setPointEvents([]);
        return;
      }

      try {
        setEventsLoading(true);
        const events = await getChildEvents(child.id);
        setPointEvents(events || []);
      } catch (error) {
        console.error('Error loading point events:', error);
        setPointEvents([]);
      } finally {
        setEventsLoading(false);
      }
    };

    loadEvents();
  }, [child, getChildEvents]);

  // Debug logging - ENHANCED
  useEffect(() => {
    console.log('🔍 LogBehavior - Auth state CHECK:', {
      isParentMode,
      role,
      user_role_localStorage: getStorageSync('user_role'),
      fgs_user_mode_localStorage: getStorageSync('fgs_user_mode'),
      fgs_user_id_localStorage: getStorageSync('fgs_user_id'),
      kid_access_token: getStorageSync('kid_access_token'),
      kid_session_token: getStorageSync('kid_session_token'),
      ALL_STORAGE_KEYS: Object.keys(localStorage).filter(k => 
        k.includes('user') || k.includes('role') || k.includes('mode') || k.includes('kid')
      )
    });
  }, [isParentMode, role]);

  // Track which prayers have been logged today
  useEffect(() => {
    if (!child || !pointEvents) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysPrayers = pointEvents
      .filter(event => {
        const eventDate = new Date(event.timestamp);
        eventDate.setHours(0, 0, 0, 0);
        return (
          event.childId === child.id &&
          eventDate.getTime() === today.getTime() &&
          event.type === 'habit'
        );
      })
      .map(event => event.trackableItemId)
      .filter(Boolean) as string[];

    setTodayPrayersLogged(new Set(todaysPrayers));
    console.log('📿 Prayers logged today:', todaysPrayers);
  }, [child, pointEvents]);

  if (!isParentMode) {
    console.log('❌ LogBehavior - Blocking access, not in parent mode. FULL DEBUG:', {
      isParentMode,
      role,
      user_role: getStorageSync('user_role'),
      fgs_user_mode: getStorageSync('fgs_user_mode')
    });
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center space-y-4">
            <Lock className="h-12 w-12 mx-auto text-gray-400" />
            <div>
              <h3 className="font-semibold text-lg mb-2">Parent Access Required</h3>
              <p className="text-muted-foreground">
                Only parents can log behaviors. Switch to parent mode to access this feature.
              </p>
              <div className="mt-4 p-4 bg-gray-100 rounded text-xs text-left">
                <p className="font-mono">DEBUG INFO:</p>
                <p>isParentMode: {String(isParentMode)}</p>
                <p>role: {role}</p>
                <p>user_role (storage): {getStorageSync('user_role')}</p>
                <p>fgs_user_mode (storage): {getStorageSync('fgs_user_mode')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!child) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select a child to log behavior.</p>
      </div>
    );
  }

  if (itemsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Loading behaviors...</p>
      </div>
    );
  }

  const handleLog = async (salahStateOverride?: SalahState) => {
    // v19: Submit lock - if a previous click is still in flight, ignore the
    // new one. Without this guard, a fast double-click was creating 2-3
    // duplicate event rows because the click handlers ran before
    // setSelectedItemId(null) cleared the form state at the end of performLog.
    if (submitting) {
      console.log('[LogBehavior] Submit already in flight, ignoring duplicate click');
      return;
    }

    if (!selectedItemId) {
      toast.error("Please select a behavior or habit");
      return;
    }

    const item = trackableItems.find(i => i.id === selectedItemId);
    if (!item) return;

    if (!user) {
      toast.error("Please sign in to log events");
      return;
    }

    setSubmitting(true);

    // Check if this prayer was already logged today (for salah items).
    // v15: This still applies for all three states (on-time / qadha / missed) -
    // each prayer is one logged event per day. Kid corrections happen via the
    // qadha-correction flow below, not by re-logging.
    if (item.category === 'salah' && todayPrayersLogged.has(selectedItemId)) {
      toast.error(`${item.name} has already been logged today! Each prayer can only be logged once per day.`);
      return;
    }

    try {
      // Pre-flight singleton check is BEST-EFFORT only.
      // The backend's POST /events handler enforces singleton locking inline
      // and returns 409 with conflict details, so a missing/failed pre-flight
      // is not fatal - we let performLog handle the conflict surface there.
      // (Historic note: the /events/check-singleton endpoint was never wired
      //  up in the backend, so this call previously 404'd and bubbled up as
      //  a generic "Failed to log event" toast for any item flagged
      //  isSingleton: true. v15 makes it non-blocking.)
      if (item.isSingleton) {
        try {
          const singletonCheck = await api.checkSingleton(child.id, selectedItemId, user.id);
          if (singletonCheck && singletonCheck.allowed === false) {
            setSingletonConflict(singletonCheck.conflict);
            setShowSingletonAlert(true);
            return;
          }
        } catch (preflightError) {
          console.warn('[LogBehavior] singleton pre-flight skipped:', preflightError);
        }
      }

      // Pre-flight dedupe check is also best-effort.
      if (item.dedupeWindow) {
        try {
          const dedupeCheck = await api.checkDedupe(child.id, selectedItemId, user.id);
          if (dedupeCheck && dedupeCheck.needsConfirmation) {
            setDedupeData({ item, recentEvents: dedupeCheck.recentEvents });
            setShowDedupeAlert(true);
            return;
          }
        } catch (preflightError) {
          console.warn('[LogBehavior] dedupe pre-flight skipped:', preflightError);
        }
      }

      // Proceed with logging
      await performLog(item, salahStateOverride);
    } catch (error: any) {
      console.error('Log behavior error:', error);
      // Surface the real error message so we don't lose diagnostic info
      // behind a generic "Failed to log event" toast.
      const message = error?.message || 'Failed to log event';
      toast.error(message);
    } finally {
      // v19: Always release the submit lock, even on error / pre-flight
      // conflict alert short-circuit, so the user can retry.
      setSubmitting(false);
    }
  };

  const performLog = async (item: any, salahState?: SalahState) => {
    if (!user) return;

    try {
      // v15: Resolve points by Salah state when applicable.
      // - 'ontime' (or undefined) = item.points (the per-prayer on-time value)
      // - 'qadha'                  = family.salahQadhaPoints (default +1)
      // - 'missed'                 = family.salahMissedPoints (default -1)
      const isSalah = item.category === 'salah';
      let basePoints: number = item.points;
      if (isSalah) {
        if (salahState === 'qadha') basePoints = salahQadhaPoints;
        else if (salahState === 'missed') basePoints = salahMissedPoints;
        else basePoints = item.points; // ontime / default
      }

      // Bonus points only apply for positive logs (no bonus on missed)
      const effectiveBonus = basePoints > 0 ? bonusPoints : 0;
      const totalPoints = basePoints + effectiveBonus;

      // Build comprehensive notes
      let finalNotes = notes || '';
      if (effectiveBonus > 0 && bonusReason) {
        const bonusNote = `⭐ Bonus (+${effectiveBonus}): ${bonusReason}`;
        finalNotes = finalNotes ? `${finalNotes}\n\n${bonusNote}` : bonusNote;
      }
      // Auto-tag the salah state into notes for parents reviewing the audit trail
      if (isSalah && salahState && salahState !== 'ontime') {
        const stateLabel = salahState === 'qadha' ? 'Qadha (made up)' : 'Missed';
        finalNotes = finalNotes ? `${finalNotes}\n\n[${stateLabel}]` : `[${stateLabel}]`;
      }

      // v20: Snapshot itemName onto the event at write time so the activity
      // feed renders correctly even if this trackable item is later renamed,
      // soft-deleted, or recreated with a fresh ID. Prayer-claim approvals
      // already do this (see prayerLogging.tsx); parent-logged events did
      // not, which is why old salah events showed "Unknown" in the audit
      // trail after the v15 smart-delete reset salah item IDs.
      await logEvent(child.id, {
        childId: child.id,
        trackableItemId: selectedItemId!,
        type: item.type,
        points: totalPoints, // Use total points (base + bonus)
        loggedBy: user.id,
        notes: finalNotes || undefined,
        itemName: isSalah
          ? `Prayer: ${item.name}${
              salahState === 'qadha' ? ' (Qadha)' :
              salahState === 'missed' ? ' (Missed)' :
              ' (On Time)'
            }`
          : item.name,
        ...(isSalah ? { salahState: salahState || 'ontime' } : {})
      } as any);

      const bonusText = effectiveBonus > 0 ? ` + ${effectiveBonus} bonus` : '';
      const stateText = isSalah && salahState && salahState !== 'ontime'
        ? ` [${salahState === 'qadha' ? 'qadha' : 'missed'}]`
        : '';
      toast.success(`Logged ${item.name}${stateText} for ${child.name} (${totalPoints > 0 ? '+' : ''}${totalPoints} points${bonusText})${bonusReason ? `: ${bonusReason}` : ''}`);
      setSelectedItemId(null);
      setNotes("");
      setBonusPoints(0);
      setBonusReason("");
      
      // Reload events to update prayer tracking
      const events = await getChildEvents(child.id);
      setPointEvents(events || []);
    } catch (error: any) {
      console.error('[LogBehavior] performLog error:', error);
      const message = error?.message || 'Failed to log event';
      toast.error(message);
    }
  };

  const handleRequestEdit = async () => {
    if (!user || !singletonConflict) return;

    try {
      await api.createEditRequest({
        originalEventId: singletonConflict.eventId,
        requestedBy: user.id,
        requestedByName: user.name,
        originalOwner: singletonConflict.loggedBy,
        proposedChanges: { notes },
        reason: `Request to edit/verify entry logged by ${singletonConflict.loggedBy}`,
      });

      toast.success("Edit request submitted for review");
      setShowSingletonAlert(false);
      setSingletonConflict(null);
    } catch (error) {
      console.error('Edit request error:', error);
      toast.error("Failed to submit edit request");
    }
  };

  const handleDedupeOverride = async () => {
    const item = trackableItems.find(i => i.id === selectedItemId);
    if (!item) return;

    await performLog(item);
    setShowDedupeAlert(false);
    setDedupeData(null);
  };

  const handleBonusLog = async () => {
    // v19: same submit lock applies to the standalone Log Bonus button
    if (submitting) return;
    if (!user) {
      toast.error("Please sign in to log events");
      return;
    }

    setSubmitting(true);
    try {
      await logEvent(child.id, {
        childId: child.id,
        trackableItemId: 'manual-bonus', // Use a special identifier for manual bonuses instead of null
        type: 'bonus',
        points: standaloneBonusPoints,
        loggedBy: user.id,
        notes: standaloneBonusReason || undefined,
        isAdjustment: true // Mark as adjustment so backend knows this is a manual entry
      });

      toast.success(`Logged bonus for ${child.name} (+${standaloneBonusPoints} points)`);
      setStandaloneBonusPoints(0);
      setStandaloneBonusReason("");

      // Reload events to update prayer tracking
      const events = await getChildEvents(child.id);
      setPointEvents(events || []);
    } catch (error) {
      toast.error("Failed to log bonus event");
    } finally {
      setSubmitting(false);
    }
  };

  // Remove duplicates by keeping only the first occurrence of each unique name
  const deduplicateItems = (items: any[]) => {
    const seen = new Map();
    return items.filter(item => {
      if (seen.has(item.name)) {
        console.log(`🗑️ Removing duplicate: ${item.name} (id: ${item.id})`);
        return false;
      }
      seen.set(item.name, true);
      return true;
    });
  };

  // v19: Align tab filters with Settings (Settings.tsx 1380-1397). Previously
  // a habit-typed item with negative points (e.g. "Washroom accident", -3)
  // would render in the Habits tab with a "+-3" badge AND go missing from the
  // Negative tab because Negative was filtering on type === 'behavior'. We
  // now union by sign for negative items and require positive points for the
  // habit/positive tabs, matching the Settings filters exactly.
  const salahItems = deduplicateItems(trackableItems.filter(i => i.category === 'salah'));
  const otherHabits = deduplicateItems(trackableItems.filter(
    i => i.type === 'habit' && i.category !== 'salah' && i.points > 0
  ));
  const positiveBehaviors = deduplicateItems(trackableItems.filter(
    i => i.type === 'behavior' && i.points > 0
  ));
  const negativeBehaviors = deduplicateItems(trackableItems.filter(
    i => i.points < 0 && i.category !== 'salah'
  ));
  
  console.log('📊 Item counts after deduplication:', {
    salah: salahItems.length,
    otherHabits: otherHabits.length,
    positive: positiveBehaviors.length,
    negative: negativeBehaviors.length
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Log Behavior or Habit</CardTitle>
          <CardDescription>Record daily activities, prayers, and behaviors for {child.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="salah" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="salah">Salah</TabsTrigger>
              <TabsTrigger value="habits">Habits</TabsTrigger>
              <TabsTrigger value="positive">Positive</TabsTrigger>
              {/* v23: tab label softened from "Negative" to "Concerns".
                  Underlying data filter unchanged (points < 0). The kid
                  never sees this label. The intent is to stop framing
                  the parent's daily logging surface as a punishment
                  console — concerns are noticed, not negative. */}
              <TabsTrigger value="negative">Concerns</TabsTrigger>
            </TabsList>

            <TabsContent value="salah" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {salahItems.map(item => {
                  const isLoggedToday = todayPrayersLogged.has(item.id);
                  return (
                    <Button
                      key={item.id}
                      variant={selectedItemId === item.id ? "default" : "outline"}
                      onClick={() => setSelectedItemId(item.id)}
                      disabled={isLoggedToday}
                      className={`h-20 flex flex-col gap-1 relative ${isLoggedToday ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isLoggedToday && (
                        <span className="absolute top-1 right-1 text-xs">✅</span>
                      )}
                      <span>{item.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {isLoggedToday ? 'Logged ✓' : `+${item.points}`}
                      </Badge>
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                ℹ️ Tap a prayer to select, then pick <strong>On time</strong> /
                <strong> Qadha</strong> /
                <strong> Missed</strong>. Edit per-prayer point values in
                Settings → Behaviors → Salah.
              </p>
              <p className="text-xs text-amber-600">
                ⚠️ Each prayer can only be logged once per day. If a missed
                prayer was made up later, the kid can correct it from their
                dashboard (audit trail records the change).
              </p>
            </TabsContent>

            <TabsContent value="habits" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {otherHabits.map(item => (
                  <Button
                    key={item.id}
                    variant={selectedItemId === item.id ? "default" : "outline"}
                    onClick={() => setSelectedItemId(item.id)}
                    className="h-20 flex flex-col gap-1"
                  >
                    <span>{item.name}</span>
                    <Badge variant="secondary" className="text-xs">+{item.points}</Badge>
                  </Button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="positive" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {positiveBehaviors.map(item => (
                  <Button
                    key={item.id}
                    variant={selectedItemId === item.id ? "default" : "outline"}
                    onClick={() => setSelectedItemId(item.id)}
                    className="h-20 flex flex-col gap-1"
                  >
                    <span>{item.name}</span>
                    <Badge variant="secondary" className="text-xs bg-green-100">+{item.points}</Badge>
                  </Button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="negative" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {negativeBehaviors.map(item => (
                  <Button
                    key={item.id}
                    variant={selectedItemId === item.id ? "destructive" : "outline"}
                    onClick={() => setSelectedItemId(item.id)}
                    className="h-20 flex flex-col gap-1"
                  >
                    <span>{item.name}</span>
                    <div className="flex flex-col gap-1">
                      <Badge variant="secondary" className="text-xs bg-red-100">{item.points}</Badge>
                      {item.tier && (
                        <span className="text-xs opacity-70">
                          {item.tier === 'minor' && '🟢'}
                          {item.tier === 'moderate' && '🟡'}
                          {item.tier === 'major' && '🔴'}
                        </span>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-6 space-y-4">
            {selectedItemId && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-blue-900">Selected: {trackableItems.find(i => i.id === selectedItemId)?.name}</h3>
                  <Badge className="bg-blue-600">
                    Base: {trackableItems.find(i => i.id === selectedItemId)?.points > 0 ? '+' : ''}{trackableItems.find(i => i.id === selectedItemId)?.points} pts
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="bonusPoints" className="text-blue-900 flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    Add Bonus Points (Optional)
                  </Label>
                  <Input
                    id="bonusPoints"
                    type="number"
                    min="0"
                    placeholder="e.g., 2 for extra effort"
                    value={bonusPoints || ''}
                    onChange={(e) => setBonusPoints(Number(e.target.value) || 0)}
                    className="bg-white"
                  />
                  {bonusPoints > 0 && (
                    <p className="text-xs text-blue-700">
                      Total: {(trackableItems.find(i => i.id === selectedItemId)?.points || 0) + bonusPoints} points 
                      ({trackableItems.find(i => i.id === selectedItemId)?.points} base + {bonusPoints} bonus)
                    </p>
                  )}
                </div>
                
                {bonusPoints > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="bonusReason" className="text-blue-900">
                      Bonus Reason <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="bonusReason"
                      placeholder="e.g., 'Prayed slowly with beautiful recitation' or 'Completed homework early without reminders'"
                      value={bonusReason}
                      onChange={(e) => setBonusReason(e.target.value)}
                      rows={2}
                      className="bg-white"
                    />
                    {bonusPoints > 0 && !bonusReason && (
                      <p className="text-xs text-amber-600">⚠️ Please explain why you're giving bonus points</p>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any additional context..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* v15: Salah items log via three states (on-time / qadha / missed).
                Non-Salah items use the single "Log Event" button. */}
            {(() => {
              const sel = selectedItemId
                ? trackableItems.find(i => i.id === selectedItemId)
                : null;
              const isSalah = sel?.category === 'salah';

              if (isSalah) {
                const onTime = sel!.points;
                const qadha = salahQadhaPoints;
                const missed = salahMissedPoints;
                return (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Choose how this prayer was performed:
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        onClick={() => handleLog('ontime')}
                        disabled={submitting || (bonusPoints > 0 && !bonusReason)}
                        className="h-12 flex flex-col gap-0"
                      >
                        <span className="text-xs">On time</span>
                        <span className="font-semibold">+{onTime}</span>
                      </Button>
                      <Button
                        onClick={() => handleLog('qadha')}
                        disabled={submitting}
                        variant="outline"
                        className="h-12 flex flex-col gap-0 border-amber-300 text-amber-700 hover:bg-amber-50"
                      >
                        <span className="text-xs">Qadha</span>
                        <span className="font-semibold">{qadha >= 0 ? '+' : ''}{qadha}</span>
                      </Button>
                      <Button
                        onClick={() => handleLog('missed')}
                        disabled={submitting}
                        variant="outline"
                        className="h-12 flex flex-col gap-0 border-red-300 text-red-700 hover:bg-red-50"
                      >
                        <span className="text-xs">Missed</span>
                        <span className="font-semibold">{missed >= 0 ? '+' : ''}{missed}</span>
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setSelectedItemId(null);
                        setNotes("");
                        setBonusPoints(0);
                        setBonusReason("");
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                );
              }

              return (
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleLog()}
                    disabled={submitting || !selectedItemId || (bonusPoints > 0 && !bonusReason)}
                    className="flex-1"
                  >
                    {submitting ? 'Logging…' : 'Log Event'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedItemId(null);
                      setNotes("");
                      setBonusPoints(0);
                      setBonusReason("");
                    }}
                  >
                    Clear
                  </Button>
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Quick Info */}
      <Card>
        <CardHeader>
          <CardTitle>Governance Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>✓ Duplicate detection active for behaviors with dedupe windows</p>
          <p>✓ All events are logged with timestamp and parent attribution</p>
          <p>✓ Religious activities tracked as positive reinforcement only</p>
          <p>✓ Recovery bonuses available after major penalties</p>
        </CardContent>
      </Card>

      {/* Bonus Log */}
      <Card>
        <CardHeader>
          <CardTitle>Log Bonus</CardTitle>
          <CardDescription>Manually log a bonus for {child.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bonusPoints">Bonus Points</Label>
              <Input
                id="bonusPoints"
                type="number"
                placeholder="Enter bonus points..."
                value={standaloneBonusPoints}
                onChange={(e) => setStandaloneBonusPoints(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bonusReason">Reason (Optional)</Label>
              <Textarea
                id="bonusReason"
                placeholder="Add any additional context..."
                value={standaloneBonusReason}
                onChange={(e) => setStandaloneBonusReason(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleBonusLog}
                disabled={submitting || standaloneBonusPoints <= 0}
                className="flex-1"
              >
                {submitting ? 'Logging…' : 'Log Bonus'}
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  setStandaloneBonusPoints(0);
                  setStandaloneBonusReason("");
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Singleton Conflict Alert */}
      <AlertDialog open={showSingletonAlert} onOpenChange={setShowSingletonAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Singleton Conflict Detected</AlertDialogTitle>
            <AlertDialogDescription>
              This behavior is marked as a singleton, meaning only one instance can be logged per day.
              {singletonConflict && (
                <>
                  {' '}An entry was already logged by {singletonConflict.loggedBy} on{' '}
                  {new Date(singletonConflict.loggedAt || singletonConflict.timestamp).toLocaleDateString()}.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRequestEdit}>
              Request Edit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dedupe Conflict Alert */}
      <AlertDialog open={showDedupeAlert} onOpenChange={setShowDedupeAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Detection</AlertDialogTitle>
            <AlertDialogDescription>
              This behavior was logged recently (within {dedupeData?.item.dedupeWindow} minutes).
              Are you sure this is a separate incident?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDedupeOverride}>
              Override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Prayer Approvals Widget */}
      <PrayerApprovalsWidget />
    </div>
  );
}