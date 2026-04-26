// v13: Getting Started checklist for new parents.
// Renders at the top of the Parent Dashboard when the family is fresh
// (i.e. they haven't done at least one of: add a child, try Kid Mode,
// invite a spouse). Auto-detects the first/third items from real data;
// the Kid Mode item flips when the parent actually clicks "See Kid View".
// Dismissible — once hidden, it stays hidden until localStorage is cleared.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useAuth } from "../contexts/AuthContext";
import { useViewMode } from "../contexts/ViewModeContext";
import {
  Check,
  CheckCircle2,
  Circle,
  Eye,
  Sparkles,
  UserPlus,
  Users,
  X,
  ArrowRight,
} from "lucide-react";
import { getStorageSync, setStorageSync } from "../../utils/storage";

const STORAGE_KEY = "fgs_getting_started_v13";

interface TourState {
  dismissed: boolean;
  kidViewSeen: boolean;
  inviteSeen: boolean;
}

const DEFAULT_STATE: TourState = {
  dismissed: false,
  kidViewSeen: false,
  inviteSeen: false,
};

function loadState(): TourState {
  try {
    const raw = getStorageSync(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: TourState) {
  try {
    setStorageSync(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage might be unavailable — silently fall back to in-memory.
  }
}

export function GettingStartedCard() {
  const { children, family } = useFamilyContext();
  const { isParentMode } = useAuth();
  const { switchToKidMode } = useViewMode();

  const [state, setState] = useState<TourState>(DEFAULT_STATE);

  // Hydrate from localStorage on mount only — we don't want to thrash on
  // every render and it's per-user-per-device anyway.
  useEffect(() => {
    setState(loadState());
  }, []);

  // Hide entirely for kids and for parents previewing as kid (the latter
  // because the dashboard rendered through the kid lens shouldn't carry
  // parent-only education chrome).
  if (!isParentMode) return null;
  if (state.dismissed) return null;

  // Derived completion. addChild and inviteCount come from live family
  // data so they self-update; kidViewSeen requires a click commit because
  // we can't otherwise tell whether the parent actually looked at Kid Mode.
  const hasChildren = (children?.length ?? 0) > 0;
  const parentIds: string[] = Array.isArray(family?.parentIds) ? family.parentIds : [];
  const guardianIds: string[] = Array.isArray(family?.guardianIds) ? family.guardianIds : [];
  const hasOtherMember =
    parentIds.length > 1 || guardianIds.length > 0 || state.inviteSeen;

  const items = [
    {
      key: "child",
      done: hasChildren,
      title: "Add your first child",
      description: hasChildren
        ? `${children.length} ${children.length === 1 ? "child" : "children"} added — nice.`
        : "Children are who earn points and unlock rewards.",
      icon: UserPlus,
      cta: hasChildren ? null : (
        <Link to="/settings">
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            Add child <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      ),
    },
    {
      key: "kid-view",
      done: state.kidViewSeen,
      title: "See what your kids will see",
      description: state.kidViewSeen
        ? "You've previewed Kid Mode — switch any time from the top nav."
        : "Flip to Kid Mode to preview the dashboard your children use. Read-only — nothing you tap will change real data.",
      icon: Eye,
      cta: state.kidViewSeen ? null : (
        <Button
          size="sm"
          variant="outline"
          className="border-purple-300 text-purple-700 hover:bg-purple-50"
          onClick={() => {
            const next = { ...state, kidViewSeen: true };
            setState(next);
            saveState(next);
            switchToKidMode();
          }}
        >
          Open Kid Mode <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      ),
    },
    {
      key: "invite",
      done: hasOtherMember,
      title: "Invite your spouse or co-parent",
      description: hasOtherMember
        ? "You've shared the family with another parent or guardian."
        : "Optional, but useful — give your invite code to your spouse so you can both approve prayers and behaviors.",
      icon: Users,
      cta: hasOtherMember ? null : (
        <Link to="/settings?tab=family">
          <Button
            size="sm"
            variant="outline"
            className="border-pink-300 text-pink-700 hover:bg-pink-50"
            onClick={() => {
              const next = { ...state, inviteSeen: true };
              setState(next);
              saveState(next);
            }}
          >
            Show invite code <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      ),
    },
  ];

  const completed = items.filter((i) => i.done).length;
  const total = items.length;
  const allDone = completed === total;

  // If everything's done, show a single "all set" pulse for one render
  // cycle then hide — but only after we've actually persisted something,
  // so we don't auto-dismiss on the very first paint before the parent
  // saw the card at all. We tie this to the kidViewSeen flag as a proxy
  // for "parent has interacted with the card at least once."
  if (allDone && state.kidViewSeen) {
    return (
      <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
        <CardContent className="pt-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-900">You're all set!</p>
              <p className="text-sm text-emerald-700">
                Your family is fully configured. This banner will disappear on next refresh.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-emerald-700 hover:text-emerald-900"
            onClick={() => {
              const next = { ...state, dismissed: true };
              setState(next);
              saveState(next);
            }}
          >
            <Check className="h-4 w-4 mr-1" />
            Hide
          </Button>
        </CardContent>
      </Card>
    );
  }

  const progressPct = (completed / total) * 100;

  return (
    <Card className="bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 border-amber-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-lg">Getting Started</CardTitle>
              <CardDescription className="mt-0.5">
                {completed} of {total} done — quick wins to bring your family on board.
              </CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Dismiss Getting Started"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={() => {
              const next = { ...state, dismissed: true };
              setState(next);
              saveState(next);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Progress value={progressPct} className="mt-2 h-1.5" />
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                item.done
                  ? "bg-emerald-50/60 border-emerald-200"
                  : "bg-white/70 border-amber-200"
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Circle className="h-5 w-5 text-amber-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <p
                    className={`font-medium text-sm ${
                      item.done ? "text-emerald-900 line-through" : "text-gray-900"
                    }`}
                  >
                    {item.title}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {item.description}
                </p>
                {item.cta && <div className="mt-2">{item.cta}</div>}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
