/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  Compass, 
  XOctagon, 
  Mic, 
  MicOff, 
  Play, 
  StopCircle, 
  ChevronRight, 
  AlertCircle,
  CheckCircle2,
  BrainCircuit,
  Terminal,
  Waves,
  Activity,
  History as HistoryIcon,
  Target,
  ListChecks,
  TrendingUp,
  FileText,
  Plus,
  Trash2
} from 'lucide-react';
import { Button, Card, cn } from './components/UI';
import { analyzeInterviewSegment } from './services/gemini';
import { InterviewSignal, AIResponse } from './types';

// Torch Logo Component
const TorchLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M11 13l1 8" />
    <path d="M13 13l-1 8" />
    <path d="M9 13h6l-1-4h-4l-1 4z" />
    <path d="M12 2c0 0-3 3-3 5.5s1.5 3.5 3 3.5 3-1 3-3.5S12 2 12 2z" fill="currentColor" className="text-orange-500" />
  </svg>
);

interface TranscriptLine {
  text: string;
  analysis?: AIResponse;
  timestamp: number;
}

// Speech Recognition Type Definitions
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [role, setRole] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [interimText, setInterimText] = useState('');
  const [signals, setSignals] = useState<InterviewSignal[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeMetric, setActiveMetric] = useState<'speed' | 'grammar' | 'fluency' | 'relevance'>('relevance');
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [rubric, setRubric] = useState<string[]>(['Technical Accuracy', 'Communication', 'Problem Solving']);
  const [newRubricItem, setNewRubricItem] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAnalysisLengthRef = useRef(0);

  useEffect(() => {
    if (scrollRef.current && selectedLineIndex === null) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, interimText, selectedLineIndex]);

  // Speech Recognition Setup
  useEffect(() => {
    if (typeof window !== 'undefined' && window.webkitSpeechRecognition && !recognitionRef.current) {
      const SpeechRecognition = window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1; // Keep it simple but focused

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptPart = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcriptPart;
          } else {
            interimTranscript += transcriptPart;
          }
        }

        if (finalTranscript) {
          setTranscript(prev => {
            const now = Date.now();
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              // Increased buffer to 8 seconds to capture longer, more complex thoughts
              if (now - last.timestamp < 8000) {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...last,
                  text: (last.text + " " + finalTranscript.trim()).trim(),
                  timestamp: now
                };
                return updated;
              }
            }
            return [...prev, { text: finalTranscript.trim(), timestamp: now }];
          });
          setSelectedLineIndex(null);
          setInterimText('');
        } else {
          setInterimText(interimTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'no-speech') {
          // No speech detected for a while, just keep going
          return;
        }
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setIsListening(false);
          (window as any)._isListening = false;
        }
      };

      recognition.onend = () => {
        // Aggressive restart logic for better "hearing" persistence
        if ((window as any)._isListening) {
          setTimeout(() => {
            try {
              if ((window as any)._isListening) {
                recognition.start();
              }
            } catch (e) {
              // Usually means it's already started, which is fine
            }
          }, 100);
        }
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Sync state to a global-ish variable to avoid closure issues in onend
  useEffect(() => {
    (window as any)._isListening = isListening;
  }, [isListening]);

  // Auto-trigger analysis with debounce and content check
  useEffect(() => {
    const lastLine = transcript[transcript.length - 1];
    if (transcript.length > 0 && transcript.length !== lastAnalysisLengthRef.current && lastLine?.text.length > 10) {
      const timer = setTimeout(() => {
        lastAnalysisLengthRef.current = transcript.length;
        triggerAnalysis(transcript.length - 1);
      }, 600); // Faster debounce for <10s target
      return () => clearTimeout(timer);
    }
  }, [transcript]);

  // Persistence Heartbeat: Ensure recognition stays active if it should be
  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (isListening && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          // Already running, which is what we want
        }
      }
    }, 3000);
    return () => clearInterval(heartbeat);
  }, [isListening]);

  const toggleListening = () => {
    if (isListening) {
      (window as any)._isListening = false;
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      (window as any)._isListening = true;
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.warn("Recognition already started or failed to start", e);
      }
      setIsListening(true);
    }
  };

  const startInterview = () => {
    if (!candidateName || !role) return;
    setIsStarted(true);
    (window as any)._isListening = true;
    // Auto-start listening
    setTimeout(() => {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.error("Auto-start failed", e);
        setIsListening(true); // Still set state so UI shows we're trying
      }
    }, 500);
  };

  const triggerAnalysis = async (index: number) => {
    if (transcript[index].analysis) return;
    
    setIsAnalyzing(true);
    try {
      // Send last 3 lines for context
      const contextLines = transcript.slice(Math.max(0, index - 2), index + 1).map(l => l.text);
      const result = await analyzeInterviewSegment(contextLines, candidateName, role, rubric);
      
      setTranscript(prev => {
        const next = [...prev];
        if (next[index]) next[index].analysis = result;
        return next;
      });
      
      if (result.signals.length > 0) {
        const newSignals: InterviewSignal[] = result.signals.map(s => ({
          ...s,
          timestamp: Date.now()
        }));
        setSignals(prev => [...newSignals, ...prev].slice(0, 20));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSignalIcon = (type: string) => {
    switch (type) {
      case 'cheating': return <ShieldAlert className="w-4 h-4 text-red-400" />;
      case 'navigation': return <Compass className="w-4 h-4 text-blue-400" />;
      case 'cutoff': return <XOctagon className="w-4 h-4 text-orange-400" />;
      case 'pattern': return <Activity className="w-4 h-4 text-purple-400" />;
      default: return <AlertCircle className="w-4 h-4 text-zinc-400" />;
    }
  };

  const currentAnalysis = selectedLineIndex !== null 
    ? transcript[selectedLineIndex]?.analysis 
    : transcript[transcript.length - 1]?.analysis;

  if (!isStarted) {
    return (
      <div className={cn("min-h-screen flex flex-col items-center justify-center p-6 font-sans transition-colors duration-300")}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full space-y-12 text-center"
        >
          <div className="space-y-4">
            <motion.div 
              animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 4 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white text-zinc-950 mb-4 shadow-[0_0_50px_rgba(168,85,247,0.3)]"
            >
              <TorchLogo className="w-10 h-10" />
            </motion.div>
            <h1 className="text-5xl font-black tracking-tighter drop-shadow-2xl">NAVIGATOR</h1>
            <p className="opacity-60 font-medium">Automatic real-time interview co-pilot.</p>
          </div>

          <Card className="p-8 space-y-6 text-left glass-panel shadow-2xl">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-50">Candidate</label>
              <input 
                type="text" 
                placeholder="Jane Doe"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-white placeholder:text-zinc-400"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-50">Target Role</label>
              <input 
                type="text" 
                placeholder="Senior Product Designer"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-white placeholder:text-zinc-400"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
            <div className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-50">Scorecard Rubric</label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Add dimension (e.g. Leadership)"
                    className="flex-1 bg-white/5 border border-white/10 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-sm"
                    value={newRubricItem}
                    onChange={(e) => setNewRubricItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newRubricItem) {
                        setRubric(prev => [...prev, newRubricItem]);
                        setNewRubricItem('');
                      }
                    }}
                  />
                  <Button 
                    size="sm" 
                    className="rounded-xl"
                    onClick={() => {
                      if (newRubricItem) {
                        setRubric(prev => [...prev, newRubricItem]);
                        setNewRubricItem('');
                      }
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rubric.map((item, i) => (
                    <span key={i} className="px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-[10px] font-bold flex items-center gap-2">
                      {item}
                      <button onClick={() => setRubric(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="w-3 h-3 opacity-50 hover:opacity-100" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <Button 
              className="w-full py-7 text-lg bg-white text-zinc-950 hover:opacity-90 rounded-2xl font-bold shadow-xl" 
              onClick={startInterview}
              disabled={!candidateName || !role}
            >
              Initialize Session
              <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </Card>

          <div className="flex items-center justify-center gap-4 text-[10px] font-bold opacity-50 uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><Mic className="w-3 h-3" /> Voice Active</span>
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            <span className="flex items-center gap-1.5"><ShieldAlert className="w-3 h-3" /> Anti-Cheat</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen flex font-sans selection:bg-purple-500 selection:text-white transition-colors duration-300")}>
      {/* Sidebar */}
      <div className="w-80 border-r border-white/5 bg-zinc-900/20 flex flex-col backdrop-blur-md">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-zinc-950 shadow-lg">
              <TorchLogo className="w-5 h-5" />
            </div>
            <span className="font-black text-sm tracking-tighter">NAVIGATOR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", isListening ? "bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "bg-zinc-400")} />
            <span className="text-[10px] font-black opacity-60 uppercase tracking-widest">{isListening ? 'Live' : 'Paused'}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Metrics Tabs */}
          <section>
            <h3 className="text-[10px] font-black opacity-50 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <Activity className="w-3 h-3" />
              Candidate Metrics
            </h3>
            <div className="flex p-1 bg-white/5 rounded-xl mb-4">
              {(['speed', 'grammar', 'fluency', 'relevance'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setActiveMetric(m)}
                  className={cn(
                    "flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                    activeMetric === m ? "metric-tab-active shadow-sm" : "opacity-40 hover:opacity-100"
                  )}
                >
                  {m === 'relevance' ? <Target className="w-3 h-3 mx-auto" /> : m}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              {currentAnalysis?.metrics ? (
                <motion.div
                  key={activeMetric + (selectedLineIndex ?? 'latest')}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-3"
                >
                  <div className="flex items-end justify-between">
                    <span className="text-2xl font-black">{currentAnalysis.metrics[activeMetric].score}%</span>
                    <span className={cn(
                      "text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest",
                      currentAnalysis.metrics[activeMetric].score > 70 ? "bg-emerald-500/20 text-emerald-500" :
                      currentAnalysis.metrics[activeMetric].score > 40 ? "bg-orange-500/20 text-orange-500" :
                      "bg-red-500/20 text-red-500"
                    )}>
                      {currentAnalysis.metrics[activeMetric].label}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${currentAnalysis.metrics[activeMetric].score}%` }}
                      className={cn(
                        "h-full rounded-full",
                        currentAnalysis.metrics[activeMetric].score > 70 ? "bg-emerald-500" :
                        currentAnalysis.metrics[activeMetric].score > 40 ? "bg-orange-500" :
                        "bg-red-500"
                      )}
                    />
                  </div>
                  <p className="text-[10px] opacity-60 leading-relaxed italic">
                    {currentAnalysis.metrics[activeMetric].feedback}
                  </p>
                </motion.div>
              ) : (
                <p className="text-[10px] opacity-40 font-bold uppercase tracking-wider text-center py-4">
                  {selectedLineIndex !== null ? "No analysis for this point" : "Waiting for data..."}
                </p>
              )}
            </AnimatePresence>
          </section>

          <section>
            <h3 className="text-[10px] font-black opacity-50 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <ListChecks className="w-3 h-3" />
              STAR Structure
            </h3>
            {currentAnalysis?.star ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-1">
                  {['S', 'T', 'A', 'R'].map((letter, idx) => {
                    const keys = ['situation', 'task', 'action', 'result'] as const;
                    const isActive = currentAnalysis.star[keys[idx]];
                    return (
                      <div 
                        key={letter}
                        className={cn(
                          "py-2 rounded-lg text-center text-[10px] font-black border transition-all",
                          isActive ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-500" : "bg-white/5 border-white/5 opacity-20"
                        )}
                      >
                        {letter}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] opacity-60 leading-relaxed italic">
                  {currentAnalysis.star.feedback}
                </p>
              </div>
            ) : (
              <p className="text-[10px] opacity-40 font-bold uppercase tracking-wider text-center py-4">
                Structure analysis pending
              </p>
            )}
          </section>

          <section>
            <h3 className="text-[10px] font-black opacity-50 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <TrendingUp className="w-3 h-3" />
              Sentiment Arc
            </h3>
            {currentAnalysis?.sentiment ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest">{currentAnalysis.sentiment.label}</span>
                  <span className="text-[10px] opacity-50 font-mono">{(currentAnalysis.sentiment.score * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden flex items-center justify-center relative">
                  <div className="absolute w-px h-full bg-white/20 left-1/2" />
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ 
                      width: `${Math.abs(currentAnalysis.sentiment.score) * 50}%`,
                      left: currentAnalysis.sentiment.score >= 0 ? '50%' : 'auto',
                      right: currentAnalysis.sentiment.score < 0 ? '50%' : 'auto'
                    }}
                    className={cn(
                      "h-full absolute",
                      currentAnalysis.sentiment.score >= 0 ? "bg-emerald-500" : "bg-red-500"
                    )}
                  />
                </div>
              </div>
            ) : (
              <p className="text-[10px] opacity-40 font-bold uppercase tracking-wider text-center py-4">
                Tracking sentiment...
              </p>
            )}
          </section>

          <section>
            <h3 className="text-[10px] font-black opacity-50 uppercase tracking-[0.2em] mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-3 h-3" />
                Pattern Analysis
              </div>
              {isAnalyzing && (
                <motion.div 
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="flex items-center gap-1 text-purple-500"
                >
                  <Activity className="w-2.5 h-2.5" />
                  <span className="text-[8px] font-bold">Analyzing</span>
                </motion.div>
              )}
            </h3>
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {signals.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-white/5 flex flex-col items-center justify-center text-center space-y-2">
                    <Waves className="w-5 h-5 opacity-20 animate-bounce" />
                    <p className="text-[10px] opacity-20 font-bold uppercase tracking-wider">Listening for patterns...</p>
                  </div>
                ) : (
                  signals.map((signal, i) => (
                    <motion.div
                      key={signal.timestamp + i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                    >
                      <Card className={cn(
                        "p-4 border-l-2 bg-white/5 border-white/5",
                        signal.severity === 'high' ? "border-l-red-500" : 
                        signal.severity === 'medium' ? "border-l-orange-500" : 
                        "border-l-blue-500"
                      )}>
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">{getSignalIcon(signal.type)}</div>
                          <div className="space-y-1">
                            <p className="text-xs font-bold">{signal.label}</p>
                            <p className="text-[10px] opacity-60 leading-relaxed font-medium">{signal.description}</p>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>

        <div className="p-6 bg-zinc-900/40 border-t border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center opacity-50 font-black text-lg">
              {candidateName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black truncate">{candidateName}</p>
              <p className="text-[10px] opacity-50 truncate font-bold uppercase tracking-widest">{role}</p>
            </div>
            <Button variant="ghost" size="sm" className="hover:bg-purple-500/10 hover:text-purple-500" onClick={() => setShowSummary(true)}>
              <FileText className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="sm" className="hover:bg-red-500/10 hover:text-red-500" onClick={() => window.location.reload()}>
              <StopCircle className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* HUD */}
        <div className="absolute top-8 left-8 right-8 z-20 pointer-events-none">
          <div className="max-w-3xl mx-auto">
            <AnimatePresence>
              {currentAnalysis && (
                <motion.div
                  initial={{ opacity: 0, y: -40, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -40, scale: 0.95 }}
                  className="pointer-events-auto"
                >
                  <Card className={cn(
                    "p-6 shadow-[0_32px_64px_rgba(0,0,0,0.2)] border-white/10 glass-panel relative overflow-hidden",
                    currentAnalysis.shouldCutoff && "border-red-900/50 bg-red-950/20"
                  )}>
                    <div className="absolute top-0 left-0 w-1 h-full bg-purple-500/20" />
                    <div className="flex items-start gap-6">
                      <div className={cn(
                        "p-3 rounded-2xl shadow-inner",
                        currentAnalysis.shouldCutoff ? "bg-red-500/20 text-red-500" : "bg-purple-500/10 text-purple-500"
                      )}>
                        {currentAnalysis.shouldCutoff ? <XOctagon className="w-7 h-7" /> : <BrainCircuit className="w-7 h-7" />}
                      </div>
                      <div className="flex-1 space-y-5">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <h4 className="text-[10px] font-black opacity-50 uppercase tracking-[0.3em]">
                              {selectedLineIndex !== null ? `Analysis for point #${selectedLineIndex + 1}` : 'Co-Pilot Suggestion'}
                            </h4>
                            <p className="text-base font-bold leading-relaxed">{currentAnalysis.analysis}</p>
                          </div>
                          {selectedLineIndex !== null && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-[10px] font-bold uppercase tracking-widest text-purple-500"
                              onClick={() => setSelectedLineIndex(null)}
                            >
                              Back to Live
                            </Button>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-1 gap-2">
                          {currentAnalysis.suggestions.map((s, i) => (
                            <motion.div 
                              key={i} 
                              whileHover={{ x: 4 }}
                              className="flex items-center gap-3 text-xs bg-white/5 border border-white/5 p-3 rounded-xl hover:bg-purple-500/5 transition-all cursor-pointer group"
                            >
                              <ChevronRight className="w-4 h-4 opacity-40 group-hover:text-purple-500 group-hover:opacity-100" />
                              <span className="font-bold opacity-60 group-hover:opacity-100">{s}</span>
                            </motion.div>
                          ))}
                        </div>

                        {currentAnalysis.shouldCutoff && (
                          <motion.div 
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="flex items-center gap-3 p-3 bg-red-500/10 text-red-500 rounded-xl text-xs font-black border border-red-500/20"
                          >
                            <AlertCircle className="w-4 h-4" />
                            CRITICAL QUALITY ALERT: CONSIDER TERMINATING SESSION
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Transcript View */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-16 pt-64 space-y-12 scroll-smooth"
        >
          {transcript.length === 0 && !interimText && (
            <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-6">
              <motion.div
                animate={{ scale: [1, 1.1, 1], boxShadow: ["0 0 0px rgba(168,85,247,0)", "0 0 40px rgba(168,85,247,0.2)", "0 0 0px rgba(168,85,247,0)"] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-16 h-16 rounded-full border-2 border-white/5 flex items-center justify-center"
              >
                <Mic className="w-8 h-8 opacity-20" />
              </motion.div>
              <p className="text-xs font-black uppercase tracking-[0.4em] opacity-20">Waiting for speech...</p>
            </div>
          )}

          {transcript.map((line, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "max-w-3xl mx-auto flex gap-8 group cursor-pointer p-4 rounded-2xl transition-all",
                selectedLineIndex === i ? "bg-purple-500/10 ring-1 ring-purple-500/20" : "hover:bg-zinc-500/5"
              )}
              onClick={() => setSelectedLineIndex(i)}
            >
              <div className={cn(
                "w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center text-[10px] font-black transition-colors border",
                selectedLineIndex === i 
                  ? "bg-purple-500 text-white border-purple-400" 
                  : "bg-white/5 border-white/10 opacity-60 group-hover:opacity-100"
              )}>
                {line.analysis ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <div className="flex-1 space-y-1">
                <p className={cn(
                  "text-xl font-medium leading-relaxed transition-colors",
                  selectedLineIndex === i ? "opacity-100" : "opacity-60 group-hover:opacity-100"
                )}>
                  {line.text}
                </p>
                {line.analysis && (
                  <div className="flex items-center gap-2 text-[10px] font-bold text-purple-500 uppercase tracking-widest">
                    <HistoryIcon className="w-3 h-3" />
                    Analysis Ready
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {interimText && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              className="max-w-3xl mx-auto flex gap-8 px-4"
            >
              <div className="w-10 h-10 rounded-2xl bg-white/5 border-white/10 flex-shrink-0 flex items-center justify-center text-[10px] font-black opacity-40">
                ...
              </div>
              <p className="text-xl opacity-40 font-medium leading-relaxed italic">{interimText}</p>
            </motion.div>
          )}
        </div>

        {/* Status Bar */}
        <div className="p-12 bg-gradient-to-t from-zinc-950 via-transparent to-transparent">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Button 
                variant="outline" 
                className={cn(
                  "w-16 h-16 rounded-full border-2 transition-all duration-500 relative overflow-hidden",
                  isListening ? "bg-red-500 border-red-400 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]" : "bg-white/5 border-white/10 opacity-40"
                )}
                onClick={toggleListening}
              >
                {isListening && (
                  <motion.div 
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute inset-0 bg-white rounded-full"
                  />
                )}
                {isListening ? <Mic className="w-6 h-6 relative z-10" /> : <MicOff className="w-6 h-6 relative z-10" />}
              </Button>
              <div className="space-y-1">
                <p className="text-xs font-black uppercase tracking-widest">
                  {isListening ? 'Listening Automatically' : 'Microphone Paused'}
                </p>
                <p className="text-[10px] font-bold opacity-50 uppercase tracking-widest">
                  {isAnalyzing ? 'AI is processing patterns...' : 'System ready for next segment'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-8">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black opacity-50 uppercase tracking-widest">Session Time</span>
                <span className="text-sm font-black tabular-nums">00:12:45</span>
              </div>
              <div className="w-px h-8 border-white/10" />
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black opacity-50 uppercase tracking-widest">Confidence</span>
                <span className="text-sm font-black text-emerald-500 uppercase">High</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Summary Modal */}
      <AnimatePresence>
        {showSummary && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-zinc-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            >
              <Card className="p-12 space-y-12 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8">
                  <Button variant="ghost" onClick={() => setShowSummary(false)}>
                    <XOctagon className="w-6 h-6" />
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-[10px] font-black text-purple-500 uppercase tracking-widest">
                    <FileText className="w-3 h-3" />
                    Interview Debrief
                  </div>
                  <h2 className="text-4xl font-black tracking-tighter">Session Summary</h2>
                  <div className="flex items-center gap-4 opacity-60 text-sm font-bold">
                    <span>{candidateName}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                    <span>{role}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                    <span>{new Date().toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-2 space-y-8">
                    <section className="space-y-4">
                      <h3 className="text-xs font-black uppercase tracking-widest opacity-40">Key Evidence Quotes</h3>
                      <div className="space-y-4">
                        {transcript.filter(l => l.analysis && l.analysis.metrics.relevance.score > 80).slice(0, 3).map((l, i) => (
                          <div key={i} className="p-6 bg-white/5 border border-white/5 rounded-2xl space-y-3 italic text-lg font-medium leading-relaxed">
                            "{l.text}"
                            <div className="text-[10px] not-italic font-bold text-purple-500 uppercase tracking-widest">
                              High Relevance Answer
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-4">
                      <h3 className="text-xs font-black uppercase tracking-widest opacity-40">Rubric Performance</h3>
                      <div className="grid grid-cols-1 gap-4">
                        {rubric.map((dim, i) => {
                          const avgScore = transcript.reduce((acc, curr) => acc + (curr.analysis?.metrics.relevance.score || 0), 0) / (transcript.length || 1);
                          return (
                            <div key={i} className="p-4 bg-white/5 border border-white/5 rounded-xl flex items-center justify-between">
                              <span className="font-bold">{dim}</span>
                              <div className="flex items-center gap-3">
                                <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-purple-500" style={{ width: `${avgScore}%` }} />
                                </div>
                                <span className="text-xs font-black">{avgScore.toFixed(0)}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>

                  <div className="space-y-8">
                    <section className="space-y-4">
                      <h3 className="text-xs font-black uppercase tracking-widest opacity-40">Overall Sentiment</h3>
                      <div className="p-6 bg-white/5 border border-white/5 rounded-2xl text-center space-y-2">
                        <TrendingUp className="w-8 h-8 mx-auto text-emerald-500" />
                        <p className="text-2xl font-black">Positive</p>
                        <p className="text-[10px] opacity-60 uppercase font-bold tracking-widest">Confidence Trend</p>
                      </div>
                    </section>

                    <section className="space-y-4">
                      <h3 className="text-xs font-black uppercase tracking-widest opacity-40">Final Recommendation</h3>
                      <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-4">
                        <p className="text-sm font-bold leading-relaxed">
                          Candidate demonstrated strong alignment with {role} requirements, particularly in {rubric[0]}.
                        </p>
                        <Button className="w-full bg-emerald-500 text-white hover:bg-emerald-600">
                          Move to Next Stage
                        </Button>
                      </div>
                    </section>
                  </div>
                </div>

                <div className="flex justify-end gap-4">
                  <Button variant="outline" onClick={() => window.print()}>Export PDF</Button>
                  <Button onClick={() => setShowSummary(false)}>Close Summary</Button>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
