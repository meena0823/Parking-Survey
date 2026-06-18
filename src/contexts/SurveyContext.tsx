import { createContext, useContext, useState, type ReactNode } from 'react';
import type { SurveyProject, SurveySlot, Enumerator, SurveyRoom } from '../lib/types';

interface SurveyState {
  currentProject: SurveyProject | null;
  currentSlots: SurveySlot[];
  enumerators: Enumerator[];
  currentRoom: SurveyRoom | null;
  surveyActive: boolean;
  currentSlotIndex: number;
  countdown: number | null;
  setCurrentProject: (p: SurveyProject | null) => void;
  setCurrentSlots: (s: SurveySlot[]) => void;
  setEnumerators: (e: Enumerator[]) => void;
  setCurrentRoom: (r: SurveyRoom | null) => void;
  setSurveyActive: (a: boolean) => void;
  setCurrentSlotIndex: (i: number) => void;
  setCountdown: (c: number | null) => void;
}

const SurveyContext = createContext<SurveyState | undefined>(undefined);

export function SurveyProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProject] = useState<SurveyProject | null>(null);
  const [currentSlots, setCurrentSlots] = useState<SurveySlot[]>([]);
  const [enumerators, setEnumerators] = useState<Enumerator[]>([]);
  const [currentRoom, setCurrentRoom] = useState<SurveyRoom | null>(null);
  const [surveyActive, setSurveyActive] = useState(false);
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  return (
    <SurveyContext.Provider value={{ currentProject, currentSlots, enumerators, currentRoom, surveyActive, currentSlotIndex, countdown, setCurrentProject, setCurrentSlots, setEnumerators, setCurrentRoom, setSurveyActive, setCurrentSlotIndex, setCountdown }}>
      {children}
    </SurveyContext.Provider>
  );
}

export function useSurvey() {
  const context = useContext(SurveyContext);
  if (!context) throw new Error('useSurvey must be used within SurveyProvider');
  return context;
}
