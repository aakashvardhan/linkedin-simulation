import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockAISteps, mockAICandidates } from '../../data/mockAI';
import AIProgressBar from '../../components/recruiter/AIProgressBar';
import { ArrowLeft, Star, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

// WebSocket-ready: When backend is available, replace setInterval with:
// const ws = new WebSocket(`ws://localhost:8000/ws/ai-task/${taskId}`);
// ws.onmessage = (e) => { const data = JSON.parse(e.data); setProgress(data.progress); setStepIdx(data.step); if (data.done) setPhase('done'); };

export default function AIFindCandidates() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const [progress, setProgress] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [taskId] = useState(() => `ai-task-${Date.now()}`);
  const intervalRef = useRef(null);

  const startAIWorkflow = () => {
    setPhase('running');
    setProgress(0);
    setStepIdx(0);

    // Mock simulation — replace with WebSocket connection to FastAPI backend
    const totalDuration = mockAISteps.reduce((sum, s) => sum + s.duration, 0);
    const tickMs = 100;
    let elapsed = 0;

    intervalRef.current = setInterval(() => {
      elapsed += tickMs;
      const pct = Math.min((elapsed / totalDuration) * 100, 100);
      setProgress(pct);

      let cumulative = 0;
      for (let i = 0; i < mockAISteps.length; i++) {
        cumulative += mockAISteps[i].duration;
        if (elapsed < cumulative) { setStepIdx(i); break; }
      }

      if (elapsed >= totalDuration) {
        clearInterval(intervalRef.current);
        setPhase('done');
        toast.success('AI analysis complete!');
      }
    }, tickMs);
  };

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-800 mb-2">AI Hiring Assistant</h1>
      <p className="text-sm text-gray-500 mb-6">Job: {jobId} &middot; Task: {taskId}</p>

      {/* Idle — Start Button */}
      {phase === 'idle' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-800 mb-3">AI Candidate Finder</h3>
          <p className="text-sm text-gray-600 mb-4">
            The AI Hiring Assistant will analyze the job requirements, scan the candidate database,
            match skills and experience, rank candidates, and generate personalized outreach drafts.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Workflow steps:</p>
            <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
              {mockAISteps.map((step, i) => <li key={i}>{step.label}</li>)}
            </ol>
          </div>

          {/* Resume upload for parsing */}
          <div className="border border-dashed border-gray-300 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-3">
              <Upload className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-700">Upload resumes for AI parsing (optional)</p>
                <p className="text-xs text-gray-500">The Resume Parser skill will extract structured fields</p>
              </div>
            </div>
            <input type="file" accept=".pdf,.doc,.docx" multiple
              className="mt-3 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-linkedin-light file:text-linkedin hover:file:bg-blue-100" />
          </div>

          <button onClick={startAIWorkflow} className="w-full py-2.5 bg-linkedin text-white rounded-full font-medium hover:bg-linkedin-dark transition-colors">
            Start AI Analysis
          </button>
        </div>
      )}

      {/* Running — Progress */}
      {phase === 'running' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <AIProgressBar progress={progress} currentStep={mockAISteps[stepIdx]?.label || 'Finishing up...'} />
          <div className="mt-6 space-y-2">
            {mockAISteps.map((step, i) => (
              <div key={i} className={`flex items-center gap-2 text-sm ${i < stepIdx ? 'text-green-600' : i === stepIdx ? 'text-linkedin font-medium' : 'text-gray-400'}`}>
                <span>{i < stepIdx ? '\u2713' : i === stepIdx ? '\u25CF' : '\u25CB'}</span>
                {step.label}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">trace_id: {taskId}</p>
        </div>
      )}

      {/* Done — Results */}
      {phase === 'done' && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm mb-4">
            Found {mockAICandidates.length} matching candidates! Review and send outreach.
          </div>
          {mockAICandidates.map((c) => (
            <div key={c.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4">
              <img src={c.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800">{c.name}</p>
                <p className="text-sm text-gray-500 truncate">{c.headline}</p>
                <p className="text-xs text-gray-400">{c.location}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {c.skills.map((s, i) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full">{s}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 text-sm font-semibold text-linkedin">
                <Star className="w-4 h-4 fill-linkedin" />{c.matchScore}%
              </div>
            </div>
          ))}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => navigate(`/recruiter/outreach/task-${jobId}`)}
              className="flex-1 py-2.5 bg-linkedin text-white rounded-full font-medium hover:bg-linkedin-dark transition-colors"
            >
              Generate & Review Outreach Messages
            </button>
            <button
              onClick={() => { setPhase('idle'); setProgress(0); }}
              className="px-6 py-2.5 border border-gray-300 rounded-full font-medium hover:bg-gray-50"
            >
              Run Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
