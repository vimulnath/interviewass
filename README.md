# Navigator AI Interview Assistant

Navigator is a high-speed, real-time AI interview co-pilot designed to assist interviewers by providing live transcription, behavioral analysis, and candidate metrics.

## 🚀 Technical Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS (v4)
- **Animations**: Framer Motion (`motion/react`)
- **Icons**: Lucide React
- **AI Engine**: Google Gemini 3 Flash (`gemini-3-flash-preview`)
- **Speech Processing**: Web Speech API (`webkitSpeechRecognition`)

## 🛠️ Key Features

- **Real-time Transcription**: Continuous audio capture with smart buffering to handle long sentences.
- **AI Analysis**: Sub-10 second response time for behavioral signals and follow-up suggestions.
- **Interactive History**: Click any past transcript line to view the specific AI analysis generated at that moment.
- **Cheating Detection**: Monitors for robotic speech patterns, unnatural pauses, and screen-reading behaviors.

## 📊 Metric Evaluation Logic

The assistant evaluates candidates across several dimensions using advanced NLP patterns via the Gemini API:

### 1. Fluency
- **Criteria**: Flow of speech, use of filler words (um, ah, like), and sentence completion.
- **Evaluation**: The AI analyzes the linguistic cohesion. High fluency indicates a candidate who can articulate complex ideas without significant hesitation.

### 2. Speed (WPM)
- **Criteria**: Words per minute and pacing.
- **Evaluation**: Calculated by comparing the length of transcript segments against the time elapsed. The AI flags if a candidate is speaking too fast (anxiety) or too slow (struggling for words).

### 3. Grammar
- **Criteria**: Syntax, tense consistency, and vocabulary usage.
- **Evaluation**: Real-time grammatical check. It doesn't just look for errors but also for the sophistication of the language used relative to the target role.

### 4. Confidence & Signals
- **Confidence**: Derived from the combination of fluency and the "assertiveness" of the language.
- **Signals**:
    - **Cheating**: Detected via robotic structure or "perfect" long-form responses that suggest reading from a script.
    - **Cutoff**: Triggered if the candidate is rambling or providing low-value information for too long.
    - **Pattern**: Identifies recurring logical fallacies or repetitive phrases.

## 👨‍💻 Developer Setup

1. **Environment Variables**:
   - Ensure `GEMINI_API_KEY` is set in your environment.
2. **Installation**:
   ```bash
   npm install
   ```
3. **Development**:
   ```bash
   npm run dev
   ```
4. **Build**:
   ```bash
   npm run build
   ```

## 📝 Implementation Details

- **Speech Buffering**: To prevent fragmented analysis, the system appends speech to the current transcript line if the user continues speaking within a 5-second window.
- **Analysis Debounce**: Analysis is triggered after a short silence or when a significant amount of new text is finalized, ensuring API efficiency.
- **Theme System**: Uses Tailwind's `dark:` variant combined with a custom CSS gradient system in `index.css`.
