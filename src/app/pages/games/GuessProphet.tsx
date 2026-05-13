// Guess the Prophet — kid-mode game page.
//
// The kid asks yes/no questions by tapping cards organized into 6
// categories (When, Where, Family, Mission, Miracles, Other). After
// any number of questions they can tap "Make a guess" and pick one of
// the 25 Prophets. Correct = +5 points; wrong = lose a guess.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import {
  ChevronLeft, Sparkles, ThumbsUp, ThumbsDown, HelpCircle,
  Trophy, X, Target, Loader2, Award, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useFamilyContext } from "../../contexts/FamilyContext";
import {
  getProphetGuessCatalog,
  getCurrentRound,
  startRound,
  askQuestion,
  guessProphet,
  forfeitRound,
  type CatalogResponse,
  type RoundShape,
  type Answer,
} from "../../../utils/prophetGuessApi";

export function GuessProphet() {
  const navigate = useNavigate();
  const { getCurrentChild } = useFamilyContext();
  const child = getCurrentChild();

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [round, setRound] = useState<RoundShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [guessOpen, setGuessOpen] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<{ questionId: string; answer: Answer } | null>(null);

  // Initial load: catalog + any in-progress round
  useEffect(() => {
    let cancelled = false;
    Promise.all([getProphetGuessCatalog(), getCurrentRound(child?.id)])
      .then(([cat, cur]) => {
        if (cancelled) return;
        setCatalog(cat);
        setRound(cur.round);
      })
      .catch((e) => toast.error(e?.message || "Could not load game"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [child?.id]);

  const onStart = async () => {
    setBusy(true);
    try {
      const r = await startRound(child?.id);
      setRound(r.round);
      setLastAnswer(null);
    } catch (e: any) {
      toast.error(e?.message || "Could not start round");
    } finally {
      setBusy(false);
    }
  };

  const onAsk = async (questionId: string) => {
    if (!round) return;
    setBusy(true);
    try {
      const r = await askQuestion(round.id, questionId, child?.id);
      setRound(r.round);
      setLastAnswer({ questionId, answer: r.answer });
    } catch (e: any) {
      toast.error(e?.message || "Could not ask question");
    } finally {
      setBusy(false);
    }
  };

  const onGuess = async (prophetId: string) => {
    if (!round) return;
    setBusy(true);
    try {
      const r = await guessProphet(round.id, prophetId, child?.id);
      setRound(r.round);
      setGuessOpen(false);
      if (r.correct) {
        toast.success(`🎉 +${r.round.pointsAwarded} points! Mashallah!`);
      } else if (r.round.status === "lost") {
        toast.error("Out of guesses — see the answer below");
      } else {
        toast.error("Not quite — try again!");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not submit guess");
    } finally {
      setBusy(false);
    }
  };

  const onForfeit = async () => {
    if (!round) return;
    if (!window.confirm("Give up this round? You'll see the answer.")) return;
    setBusy(true);
    try {
      const r = await forfeitRound(round.id, child?.id);
      setRound(r.round);
    } catch (e: any) {
      toast.error(e?.message || "Could not forfeit");
    } finally {
      setBusy(false);
    }
  };

  // Set of question IDs already asked this round (so we hide them).
  const askedIds = useMemo(
    () => new Set((round?.questionsAsked ?? []).map((q) => q.questionId)),
    [round],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!catalog) {
    return <div className="p-6 text-center text-red-600">Could not load the game.</div>;
  }

  const isOver = round && round.status !== "in-progress";

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-fuchsia-50 to-pink-50 pb-12">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-600 via-fuchsia-600 to-pink-500 text-white pt-6 pb-10 px-4 rounded-b-[2rem] shadow-lg">
        <div className="max-w-3xl mx-auto">
          <Link to="/kid/home" className="text-white/80 text-sm hover:text-white inline-flex items-center gap-1 mb-3">
            <ChevronLeft className="h-4 w-4" /> Back to dashboard
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7" />
            Guess the Prophet
          </h1>
          <p className="text-white/90 mt-1 text-sm">
            I'm thinking of a Prophet. Ask me yes-or-no questions to figure out who!
          </p>
          {round && round.status === "in-progress" && (
            <div className="mt-4 flex items-center gap-2 flex-wrap text-sm">
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                ❓ Questions: {round.questionsAsked.length} / {catalog.rules.maxQuestions}
              </Badge>
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                🎯 Guesses left: {catalog.rules.maxGuesses - round.guessAttempts.length}
              </Badge>
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                ⭐ Win = +{catalog.rules.pointsPerWin} points
              </Badge>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 mt-6 space-y-4">
        {/* Last answer toast */}
        {lastAnswer && round && (
          <Card className="border-2 border-purple-200">
            <CardContent className="py-4 flex items-center gap-3">
              <div className="flex-1">
                <p className="text-xs uppercase tracking-wide text-purple-500 font-semibold">
                  Your last question
                </p>
                <p className="text-sm text-gray-800 mt-0.5">
                  {catalog.questions.find((q) => q.id === lastAnswer.questionId)?.text}
                </p>
              </div>
              <AnswerBadge answer={lastAnswer.answer} />
            </CardContent>
          </Card>
        )}

        {/* No active round → start CTA */}
        {!round && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-purple-600" />
                Ready to play?
              </CardTitle>
              <CardDescription>
                I'll think of one of the 25 Prophets. You ask up to {catalog.rules.maxQuestions} yes/no
                questions, then take up to {catalog.rules.maxGuesses} guesses. Each round you win earns you
                +{catalog.rules.pointsPerWin} points. I won't repeat a Prophet within {catalog.rules.noRepeatDays} days.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={onStart} disabled={busy || !child} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Start a new round
              </Button>
              {!child && (
                <p className="text-xs text-amber-600 mt-2">Choose a child first to play.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* In-progress round */}
        {round && round.status === "in-progress" && (
          <>
            <Tabs defaultValue={catalog.categories[0].id} className="w-full">
              <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
                {catalog.categories.map((cat) => (
                  <TabsTrigger key={cat.id} value={cat.id} className="text-xs">
                    <span className="mr-1">{cat.emoji}</span>{cat.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {catalog.categories.map((cat) => {
                const items = catalog.questions.filter(
                  (q) => q.category === cat.id && !askedIds.has(q.id),
                );
                return (
                  <TabsContent key={cat.id} value={cat.id} className="mt-3">
                    {items.length === 0 ? (
                      <Card>
                        <CardContent className="py-6 text-center text-sm text-muted-foreground">
                          You've used every {cat.label.toLowerCase()} question. Try another category.
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {items.map((q) => (
                          <button
                            key={q.id}
                            onClick={() => onAsk(q.id)}
                            disabled={busy}
                            className="text-left text-sm bg-white border-2 border-purple-100 hover:border-purple-300 rounded-xl p-3 transition-colors disabled:opacity-50"
                          >
                            {q.text}
                          </button>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => setGuessOpen(true)}
                disabled={busy}
                size="lg"
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90"
              >
                <Target className="h-4 w-4 mr-2" />
                Make a guess
              </Button>
              <Button onClick={onForfeit} disabled={busy} size="lg" variant="outline">
                Give up
              </Button>
            </div>

            {/* History of asks within this round */}
            {round.questionsAsked.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Questions you've asked</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 max-h-56 overflow-y-auto">
                  {round.questionsAsked.map((q, i) => {
                    const ques = catalog.questions.find((qq) => qq.id === q.questionId);
                    return (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <AnswerBadge answer={q.answer} size="sm" />
                        <p className="flex-1 text-gray-700">{ques?.text ?? q.questionId}</p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Round over */}
        {isOver && round && (
          <Card className={round.status === "won"
            ? "border-2 border-green-300 bg-green-50"
            : "border-2 border-orange-300 bg-orange-50"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {round.status === "won" ? (
                  <><Trophy className="h-6 w-6 text-green-600" /> You got it!</>
                ) : (
                  <><X className="h-6 w-6 text-orange-600" /> Round over</>
                )}
              </CardTitle>
              <CardDescription>
                I was thinking of <strong>{round.prophet?.nameArabic} ({round.prophet?.name})</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {round.status === "won" && (
                <div className="flex items-center gap-2 text-sm">
                  <Award className="h-5 w-5 text-amber-500" />
                  <span>+{round.pointsAwarded} points earned!</span>
                </div>
              )}
              <div className="text-xs text-gray-600">
                Questions asked: {round.questionsAsked.length} · Guesses: {round.guessAttempts.length}
              </div>
              <Button onClick={onStart} disabled={busy} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Play another round
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Guess dialog */}
      <Dialog open={guessOpen} onOpenChange={setGuessOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-amber-600" />
              Which Prophet?
            </DialogTitle>
            <DialogDescription>
              Tap a name. You have {catalog.rules.maxGuesses - (round?.guessAttempts.length ?? 0)} guess
              {(catalog.rules.maxGuesses - (round?.guessAttempts.length ?? 0)) === 1 ? "" : "es"} left.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2 max-h-[60vh] overflow-y-auto">
            {catalog.prophets.map((p) => {
              const alreadyGuessed = round?.guessAttempts.some((g) => g.prophetId === p.id);
              return (
                <button
                  key={p.id}
                  disabled={busy || alreadyGuessed}
                  onClick={() => onGuess(p.id)}
                  className="bg-white border-2 border-amber-200 hover:border-amber-400 rounded-xl p-3 text-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <p className="text-lg font-semibold" dir="rtl" lang="ar">{p.nameArabic}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{p.name}{p.englishName ? ` (${p.englishName})` : ""}</p>
                  {alreadyGuessed && <p className="text-[10px] text-red-500 mt-1">Already guessed</p>}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuessOpen(false)} disabled={busy}>
              Keep asking questions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AnswerBadge({ answer, size = "default" }: { answer: Answer; size?: "default" | "sm" }) {
  const tiny = size === "sm";
  const base = tiny ? "text-xs px-1.5 py-0.5" : "text-sm px-2.5 py-1";
  if (answer === "yes") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 border border-green-300 font-semibold ${base}`}>
        <ThumbsUp className={tiny ? "h-3 w-3" : "h-3.5 w-3.5"} />Yes
      </span>
    );
  }
  if (answer === "no") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 border border-red-300 font-semibold ${base}`}>
        <ThumbsDown className={tiny ? "h-3 w-3" : "h-3.5 w-3.5"} />No
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-700 border border-gray-300 font-semibold ${base}`}>
      <HelpCircle className={tiny ? "h-3 w-3" : "h-3.5 w-3.5"} />Hmm
    </span>
  );
}
