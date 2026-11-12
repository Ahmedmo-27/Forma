import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { getAllMembers, getCoachTeam, getReceptionistTeam, getSalesTeam } from '../api/endpoints';
import {
  applyMemberRoutes,
  applySubjectRoutes,
  findTutorialScenario,
  memberIdFromLocation,
  needsNavigation,
  subjectIdFromLocation,
  visibleSteps,
} from './tutorial-data';

const WalkthroughContext = createContext(null);
const EMPTY_STEPS = [];

function isShown(el) {
  if (!el || !el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

const SUBJECT_EMPTY = {
  sales: 'Add a sales rep first to use this guide',
  receptionist: 'Add a receptionist first to use this guide',
  coach: 'Add a coach first to use this guide',
  staff: 'Add someone to the roster first to use this guide',
};

function firstId(list) {
  const person = Array.isArray(list) ? list.find((item) => item?._id) : null;
  return person?._id ? String(person._id) : '';
}

async function fetchSubjectId(subject) {
  if (subject === 'sales') {
    const res = await getSalesTeam();
    return firstId(res.data?.team);
  }
  if (subject === 'receptionist') {
    const res = await getReceptionistTeam();
    return firstId(res.data?.team);
  }
  if (subject === 'coach') {
    const res = await getCoachTeam();
    const team = res.data?.team ?? [];
    return firstId(team.filter((person) => person.role === 'Coach')) || firstId(team);
  }
  if (subject === 'staff') {
    const sales = await getSalesTeam();
    const salesId = firstId(sales.data?.team);
    if (salesId) return salesId;
    const coaches = await getCoachTeam();
    const coachId = firstId(coaches.data?.team);
    if (coachId) return coachId;
    const reception = await getReceptionistTeam();
    return firstId(reception.data?.team);
  }
  return '';
}

function pickElement(step, allowFallback = true) {
  if (!step) return null;
  const primary = step.target
    ? document.querySelector(`[data-walkthrough="${step.target}"]`)
    : null;
  if (isShown(primary)) return primary;
  if (allowFallback && step.fallback) {
    const alt = document.querySelector(step.fallback);
    if (isShown(alt)) return alt;
  }
  return null;
}

export function WalkthroughProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { hasFeature } = useTenant();

  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [tourMemberId, setTourMemberId] = useState('');
  const [tourSubjectIds, setTourSubjectIds] = useState({});
  const targetRef = useRef(null);
  const startSeq = useRef(0);

  const activeScenario = useMemo(() => {
    if (!activeScenarioId) return null;
    const scenario = findTutorialScenario(activeScenarioId);
    if (!scenario) return null;
    const steps = visibleSteps(scenario, user, hasFeature);
    if (!steps.length) return null;
    return { ...scenario, steps };
  }, [activeScenarioId, user, hasFeature]);

  const baseSteps = activeScenario?.steps ?? EMPTY_STEPS;
  const steps = useMemo(
    () => applySubjectRoutes(applyMemberRoutes(baseSteps, tourMemberId), tourSubjectIds),
    [baseSteps, tourMemberId, tourSubjectIds],
  );
  const index = steps.length === 0 ? 0 : Math.min(stepIndex, steps.length - 1);
  const currentStep = steps[index] ?? null;
  const isActive = Boolean(activeScenario && currentStep);
  const totalSteps = steps.length;
  const isLastStep = totalSteps > 0 && index >= totalSteps - 1;

  const updateRect = useCallback(() => {
    const el = targetRef.current;
    if (!el || !el.isConnected) return;
    const rect = el.getBoundingClientRect();
    setTargetRect((prev) => {
      if (
        prev
        && Math.round(prev.left) === Math.round(rect.left)
        && Math.round(prev.top) === Math.round(rect.top)
        && Math.round(prev.width) === Math.round(rect.width)
        && Math.round(prev.height) === Math.round(rect.height)
      ) {
        return prev;
      }
      return rect;
    });
  }, []);

  useEffect(() => {
    if (!isActive || !currentStep) {
      targetRef.current = null;
      const frame = requestAnimationFrame(() => {
        setTargetRect(null);
        setIsNavigating(false);
      });
      return () => cancelAnimationFrame(frame);
    }

    if (needsNavigation(location, currentStep)) {
      targetRef.current = null;
      const frame = requestAnimationFrame(() => {
        setIsNavigating(true);
        setTargetRect(null);
      });
      navigate(currentStep.route, currentStep.routeState ? { state: currentStep.routeState } : undefined);
      return () => cancelAnimationFrame(frame);
    }

    let mounted = true;
    let timerId = null;
    let attempts = 0;

    const findTarget = () => {
      if (!mounted) return;
      const waitForMount = Boolean(currentStep.memberTab || currentStep.reveal || currentStep.subject);
      const attemptLimit = waitForMount ? 40 : 20;
      // Tabs, dialogs, and profile bodies mount after the first paint.
      // Keep looking for the real target before using the page fallback.
      const el = pickElement(currentStep, !waitForMount || attempts >= attemptLimit);
      if (el) {
        targetRef.current = el;
        setTargetRect(el.getBoundingClientRect());
        setIsNavigating(false);
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch {
          // ignore scroll errors
        }
        return;
      }
      if (attempts < attemptLimit) {
        attempts += 1;
        setIsNavigating(true);
        timerId = setTimeout(findTarget, 100);
        return;
      }
      targetRef.current = null;
      setTargetRect(null);
      setIsNavigating(false);
    };

    findTarget();

    let frame = null;
    const onMove = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updateRect();
      });
    };

    window.addEventListener('resize', onMove, { passive: true });
    window.addEventListener('scroll', onMove, { passive: true, capture: true });

    return () => {
      mounted = false;
      if (timerId) clearTimeout(timerId);
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, { capture: true });
    };
  }, [isActive, currentStep, location, navigate, updateRect]);

  const skipTutorial = useCallback(() => {
    setActiveScenarioId(null);
    setStepIndex(0);
    targetRef.current = null;
    setTargetRect(null);
    setIsNavigating(false);
  }, []);

  const startTutorial = useCallback((scenarioId) => {
    const seq = startSeq.current + 1;
    startSeq.current = seq;
    const scenario = findTutorialScenario(scenarioId);
    const nextSteps = visibleSteps(scenario, user, hasFeature);
    if (!nextSteps.length) {
      toast.error('This guide is not available for your access');
      return;
    }

    const begin = async () => {
      let memberId = tourMemberId;
      if (nextSteps.some((item) => item.memberTab)) {
        memberId = memberIdFromLocation(location) || '';
        if (!memberId) {
          try {
            const res = await getAllMembers({ limit: 1, page: 1 });
            const member = res.data?.members?.[0];
            memberId = member?.systemId ? String(member.systemId) : '';
          } catch {
            memberId = '';
          }
        }
        if (seq !== startSeq.current) return;
        if (!memberId) {
          toast.error('Add a member first to use this guide');
          return;
        }
        setTourMemberId(memberId);
      }
      const subjects = [...new Set(nextSteps.map((item) => item.subject).filter(Boolean))];
      const ids = { ...tourSubjectIds };
      for (const subject of subjects) {
        let personId = subjectIdFromLocation(location, subject) || '';
        if (!personId) {
          try {
            personId = await fetchSubjectId(subject);
          } catch {
            personId = '';
          }
        }
        if (seq !== startSeq.current) return;
        if (!personId) {
          toast.error(SUBJECT_EMPTY[subject] || 'Add someone first to use this guide');
          return;
        }
        ids[subject] = personId;
      }
      if (subjects.length) setTourSubjectIds(ids);
      if (seq !== startSeq.current) return;
      const routed = applySubjectRoutes(applyMemberRoutes(nextSteps, memberId), ids);
      setIsHelpModalOpen(false);
      setActiveScenarioId(scenarioId);
      setStepIndex(0);
      const first = routed[0];
      if (needsNavigation(location, first)) {
        setIsNavigating(true);
        navigate(first.route, first.routeState ? { state: first.routeState } : undefined);
      }
    };

    begin();
  }, [user, hasFeature, location, navigate, tourMemberId, tourSubjectIds]);

  const nextStep = useCallback(() => {
    if (!isActive) return;
    if (isLastStep) {
      skipTutorial();
      return;
    }
    const nextIdx = index + 1;
    const upcoming = steps[nextIdx];
    setStepIndex(nextIdx);
    if (needsNavigation(location, upcoming)) {
      setIsNavigating(true);
      navigate(upcoming.route, upcoming.routeState ? { state: upcoming.routeState } : undefined);
    }
  }, [isActive, isLastStep, index, steps, location, navigate, skipTutorial]);

  const prevStep = useCallback(() => {
    if (!isActive || index <= 0) return;
    const prevIdx = index - 1;
    const previous = steps[prevIdx];
    setStepIndex(prevIdx);
    if (needsNavigation(location, previous)) {
      setIsNavigating(true);
      navigate(previous.route, previous.routeState ? { state: previous.routeState } : undefined);
    }
  }, [isActive, index, steps, location, navigate]);

  const openHelpModal = useCallback((scenarioId) => {
    if (scenarioId) {
      startTutorial(scenarioId);
      return;
    }
    setIsHelpModalOpen(true);
  }, [startTutorial]);

  const closeHelpModal = useCallback(() => {
    setIsHelpModalOpen(false);
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') skipTutorial();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, skipTutorial]);

  const value = useMemo(() => ({
    isActive,
    activeScenario,
    currentStep,
    stepIndex: index,
    totalSteps,
    isLastStep,
    targetRect,
    isNavigating,
    isHelpModalOpen,
    startTutorial,
    nextStep,
    prevStep,
    skipTutorial,
    openHelpModal,
    closeHelpModal,
  }), [
    isActive,
    activeScenario,
    currentStep,
    index,
    totalSteps,
    isLastStep,
    targetRect,
    isNavigating,
    isHelpModalOpen,
    startTutorial,
    nextStep,
    prevStep,
    skipTutorial,
    openHelpModal,
    closeHelpModal,
  ]);

  return (
    <WalkthroughContext.Provider value={value}>
      {children}
    </WalkthroughContext.Provider>
  );
}

export function useTourReveal(key, onMatch, onLeave) { // eslint-disable-line react-refresh/only-export-components
  const { isActive, currentStep } = useWalkthrough();
  const opened = useRef(false);
  const reveal = currentStep?.reveal;

  useEffect(() => {
    const shouldOpen = Boolean(isActive && reveal === key);
    const frame = requestAnimationFrame(() => {
      if (shouldOpen) {
        opened.current = true;
        onMatch?.();
        return;
      }
      if (opened.current) {
        opened.current = false;
        onLeave?.();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isActive, reveal, key, onMatch, onLeave]);
}

export function useWalkthrough() { // eslint-disable-line react-refresh/only-export-components
  const context = useContext(WalkthroughContext);
  if (!context) {
    throw new Error('useWalkthrough must be used within a WalkthroughProvider');
  }
  return context;
}
