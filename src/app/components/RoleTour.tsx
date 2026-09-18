// RoleTour — first-run guided tour wrapper.
//
// Renders react-joyride with the step array for the given role and persists
// completion to localStorage. If the user has already completed the tour for
// this role, renders nothing (unless `force` is set, e.g. from a "Replay
// tour" button).

import { useEffect, useState } from "react";
import Joyride, { ACTIONS, STATUS, type CallBackProps, type Step } from "react-joyride";
import {
  TOURS,
  stepsForRole,
  hasCompletedTour,
  markTourCompleted,
  type TourRole,
} from "../../utils/tours";

export interface RoleTourProps {
  role: TourRole;
  userId: string;
  /** Force-show the tour even if already completed (e.g. "Replay tour"). */
  force?: boolean;
  onClose?: () => void;
}

export function RoleTour({ role, userId, force = false, onClose }: RoleTourProps) {
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  useEffect(() => {
    if (!userId) {
      setRun(false);
      return;
    }
    if (force || !hasCompletedTour(role, userId)) {
      // Defer one tick so the DOM is painted and Joyride can find targets.
      const id = window.setTimeout(() => {
        // Only the steps whose target is actually on the page — see
        // stepsForRole for why a missing one used to break the tour.
        setSteps(stepsForRole(role, (sel) => !!document.querySelector(sel)));
        setRun(true);
      }, 250);
      return () => window.clearTimeout(id);
    }
    setRun(false);
  }, [role, userId, force]);

  if (!userId) return null;
  if (!run && !force && hasCompletedTour(role, userId)) return null;

  const handleCallback = (data: CallBackProps): void => {
    // Record it the moment it is shown, not only on a clean finish.
    // Every other way out — the X, a mid-tour refresh, a step whose
    // target vanished, navigating away — used to leave it unrecorded,
    // so it returned on every single login. Seen once is seen.
    markTourCompleted(role, userId);

    const done: string[] = [STATUS.FINISHED, STATUS.SKIPPED, STATUS.ERROR];
    if (done.includes(data.status) || data.action === ACTIONS.CLOSE) {
      setRun(false);
      onClose?.();
    }
  };

  return (
    <Joyride
      steps={steps.length > 0 ? steps : TOURS[role]}
      run={run}
      continuous
      showSkipButton
      showProgress
      disableScrolling={false}
      callback={handleCallback}
      styles={{
        options: {
          primaryColor: "#4f46e5", // indigo-600
          backgroundColor: "#ffffff",
          textColor: "#0f172a",
          arrowColor: "#ffffff",
          zIndex: 10000,
        },
      }}
    />
  );
}
