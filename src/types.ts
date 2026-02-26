export type SignalType = 'cheating' | 'navigation' | 'cutoff' | 'quality' | 'pattern';

export interface InterviewSignal {
  type: SignalType;
  label: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface InterviewMetrics {
  speed: { score: number; label: string; feedback: string };
  grammar: { score: number; label: string; feedback: string };
  fluency: { score: number; label: string; feedback: string };
  relevance: { score: number; label: string; feedback: string };
}

export interface STARStructure {
  situation: boolean;
  task: boolean;
  action: boolean;
  result: boolean;
  feedback: string;
}

export interface AIResponse {
  analysis: string;
  suggestions: string[];
  signals: {
    type: SignalType;
    label: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
  }[];
  metrics: InterviewMetrics;
  star: STARStructure;
  sentiment: {
    score: number; // -1 to 1
    label: string;
  };
  shouldCutoff: boolean;
}
