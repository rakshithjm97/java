import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  Plus, 
  Box, 
  Database, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  User,
  Search,
  ArrowRight,
  LayoutDashboard,
  Layers,
  BarChart3,
  Settings as SettingsIcon,
  Bell,
  ExternalLink,
  Filter,
  MoreHorizontal,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WorkflowInstance, WorkflowType, WorkflowPhase, StepStatus, Role, User as UserType } from './types';
import { fetchWorkflows, createWorkflow, completeStep, fetchUsers } from './services/api';

export default function App() {
  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processingStep, setProcessingStep] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'workflows' | 'dashboard' | 'analytics'>('workflows');

  const [newWorkflow, setNewWorkflow] = useState({
    type: WorkflowType.SPAN_CORRECTION,
    phase: WorkflowPhase.PRE_PRODUCTION,
    jiraTicket: '',
    costSheetId: ''
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  // Auto-process system steps
  useEffect(() => {
    const activeWorkflow = workflows.find(w => w.id === selectedId);
    if (!activeWorkflow || activeWorkflow.status !== 'ACTIVE') return;

    const currentStep = activeWorkflow.steps[activeWorkflow.currentStepIndex];
    if (currentStep && currentStep.isAutomatic && currentStep.status === StepStatus.IN_PROGRESS && !processingStep) {
      simulateSystemProcess(activeWorkflow.id, currentStep.id);
    }
  }, [workflows, selectedId, processingStep]);

  const [stepInputs, setStepInputs] = useState({
    jiraLms: '',
    costSheetLms: '',
    s3Path: ''
  });

  async function simulateSystemProcess(workflowId: string, stepId: string) {
    setProcessingStep(stepId);
    await new Promise(resolve => setTimeout(resolve, 2500));
    try {
      // Re-fetch workflows to get the latest data before making decisions
      const latestWorkflows = await fetchWorkflows();
      const activeWorkflow = latestWorkflows.find(w => w.id === workflowId);
      if (!activeWorkflow) return;

      const currentStep = activeWorkflow.steps[activeWorkflow.currentStepIndex];
      
      let data: any = {};
      if (currentStep?.name.includes('Matching Check')) {
        // Logic: Check if LMS match
        const mismatch = activeWorkflow?.jiraLms !== activeWorkflow?.costSheetLms;
        if (mismatch) {
          console.error("LMS Mismatch detected between Jira and Cost Sheet.");
        }
      }

      if (currentStep?.name.includes('Read from S3 & Extract LMS')) {
        // Simulate extraction from S3 path
        console.log(`Extracting shapefile from ${activeWorkflow?.s3Path}`);
        // For simulation, we'll "extract" the same value if it looks like the test bucket
        if (activeWorkflow?.s3Path?.includes('testbucket12354555')) {
          data.shapefileLms = activeWorkflow.jiraLms; // Perfect match for the user's test case
        } else {
          // Randomly extract something else to simulate potential mismatch
          data.shapefileLms = Math.random() > 0.8 ? "MISMATCH_" + Math.random() : activeWorkflow.jiraLms;
        }
      }

      await completeStep(workflowId, data);
      await loadWorkflows();
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingStep(null);
    }
  }

  async function loadInitialData() {
    try {
      const [workflowData, userData] = await Promise.all([
        fetchWorkflows(),
        fetchUsers()
      ]);
      setWorkflows(workflowData);
      setUsers(userData);
      const tl = userData.find(u => u.role === Role.TL);
      if (tl) setCurrentUser(tl);
      else if (userData.length > 0) setCurrentUser(userData[0]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkflows() {
    try {
      const data = await fetchWorkflows();
      setWorkflows(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreate() {
    if (!newWorkflow.jiraTicket || !newWorkflow.costSheetId) return;
    try {
      await createWorkflow(newWorkflow);
      setShowNewModal(false);
      loadWorkflows();
    } catch (err) {
      console.error(err);
    }
  }

  const [isCompleting, setIsCompleting] = useState(false);

  async function handleCompleteStep(id: string) {
    console.log(`Completing step for workflow ${id}`, stepInputs);
    setIsCompleting(true);
    try {
      await completeStep(id, stepInputs);
      console.log(`Step completed successfully for ${id}`);
      // Reset inputs after completion
      setStepInputs({ jiraLms: '', costSheetLms: '', s3Path: '' });
      await loadWorkflows();
    } catch (err) {
      console.error('Failed to complete step:', err);
    } finally {
      setIsCompleting(false);
    }
  }

  const selectedWorkflow = useMemo(() => workflows.find(w => w.id === selectedId), [workflows, selectedId]);

  const stats = useMemo(() => ({
    active: workflows.filter(w => w.status === 'ACTIVE').length,
    completed: workflows.filter(w => w.status === 'COMPLETED').length,
    pendingAction: workflows.filter(w => 
      w.status === 'ACTIVE' && 
      currentUser && 
      w.steps[w.currentStepIndex]?.role.includes(currentUser.role) && 
      !w.steps[w.currentStepIndex]?.isAutomatic
    ).length
  }), [workflows, currentUser]);

  return (
    <div className="h-screen flex overflow-hidden bg-bg">
      {/* Navigation Sidebar */}
      <aside className="w-20 border-r border-line flex flex-col items-center py-8 gap-8 bg-surface z-20">
        <div className="w-12 h-12 bg-ink text-bg flex items-center justify-center rounded-xl shadow-lg shadow-ink/20">
          <Activity size={28} />
        </div>
        
        <nav className="flex-1 flex flex-col gap-4">
          <NavIcon icon={<LayoutDashboard size={20} />} active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} label="Dashboard" />
          <NavIcon icon={<Layers size={20} />} active={activeTab === 'workflows'} onClick={() => setActiveTab('workflows')} label="Workflows" />
          <NavIcon icon={<BarChart3 size={20} />} active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} label="Analytics" />
        </nav>

        <div className="flex flex-col gap-4 mt-auto">
          <NavIcon icon={<Bell size={20} />} label="Notifications" />
          <NavIcon icon={<SettingsIcon size={20} />} label="Settings" />
          <div className="w-10 h-10 rounded-full border border-line flex items-center justify-center bg-bg overflow-hidden cursor-pointer hover:border-ink transition-colors">
            <User size={18} className="opacity-50" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-20 border-b border-line px-8 flex items-center justify-between bg-surface/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h1 className="font-serif italic text-3xl tracking-tight">GeoFlow Ops</h1>
            <div className="h-4 w-px bg-line" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-50">System Live</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 px-4 py-2 glass-panel rounded-lg">
              <Search size={16} className="opacity-30" />
              <input 
                type="text" 
                placeholder="Search workflows..." 
                className="bg-transparent border-none outline-none text-xs font-mono w-64 placeholder:opacity-30"
              />
            </div>

            <div className="flex items-center gap-3 pl-6 border-l border-line">
              <div className="text-right">
                <p className="font-mono text-[9px] uppercase opacity-40 leading-none mb-1">Session Identity</p>
                <select 
                  value={currentUser?.id || ''} 
                  onChange={(e) => setCurrentUser(users.find(u => u.id === e.target.value) || null)}
                  className="bg-transparent border-none outline-none font-bold text-xs font-mono text-right cursor-pointer appearance-none hover:text-ink/70"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden">
          {/* List Section */}
          <section className="w-[45%] border-r border-line flex flex-col bg-surface/20">
            <div className="p-6 border-b border-line flex items-center justify-between bg-surface/40">
              <div className="flex items-center gap-4">
                <h2 className="font-mono text-xs font-bold uppercase tracking-widest">Active Pipeline</h2>
                <div className="flex gap-2">
                  <Badge count={stats.active} label="Active" color="bg-ink" />
                  <Badge count={stats.pendingAction} label="Action" color="bg-warning" pulse />
                </div>
              </div>
              <button onClick={() => setShowNewModal(true)} className="btn-primary">
                <Plus size={16} /> New Workflow
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-[48px_1.5fr_1fr_1fr_1fr] px-6 py-3 border-b border-line sticky top-0 bg-bg/90 backdrop-blur-sm z-10">
                <div className="col-header">ID</div>
                <div className="col-header">Type</div>
                <div className="col-header">Phase</div>
                <div className="col-header">Ticket</div>
                <div className="col-header">Status</div>
              </div>

              {loading ? (
                <LoadingState />
              ) : workflows.length === 0 ? (
                <EmptyState />
              ) : (
                workflows.map((w, i) => (
                  <motion.div 
                    layoutId={`workflow-${w.id}`}
                    key={w.id} 
                    className={`data-row px-6 hover:bg-surface/60 ${selectedId === w.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(w.id)}
                  >
                    <div className="data-value opacity-40">{(i + 1).toString().padStart(2, '0')}</div>
                    <div className="data-value font-bold truncate pr-4">{w.type}</div>
                    <div className="data-value opacity-70">{w.phase}</div>
                    <div className="data-value font-mono">{w.jiraTicket}</div>
                    <div className="data-value flex items-center gap-2">
                      <StatusIndicator status={w.status} />
                      {w.status === 'ACTIVE' && currentUser && w.steps[w.currentStepIndex]?.role.includes(currentUser.role) && !w.steps[w.currentStepIndex]?.isAutomatic && (
                        <motion.span 
                          initial={{ scale: 0.8 }}
                          animate={{ scale: 1 }}
                          className="px-1.5 py-0.5 bg-warning text-ink text-[8px] font-bold rounded-sm"
                        >
                          ACTION
                        </motion.span>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </section>

          {/* Detail Section */}
          <section className="flex-1 overflow-y-auto bg-bg p-10 custom-scrollbar">
            <AnimatePresence mode="wait">
              {selectedWorkflow ? (
                <motion.div 
                  key={selectedWorkflow.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-4xl mx-auto space-y-10"
                >
                  {/* Detail Header */}
                  <div className="flex justify-between items-end">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest opacity-40">
                        <Layers size={12} /> Workflow Instance / {selectedWorkflow.id}
                      </div>
                      <h2 className="font-serif italic text-5xl tracking-tight">{selectedWorkflow.type}</h2>
                      <div className="flex items-center gap-4 mt-4">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-ink/5 border border-line text-[10px] font-mono font-bold">
                          <Zap size={12} className="text-warning" /> {selectedWorkflow.phase.toUpperCase()}
                        </div>
                        <div className="text-[10px] font-mono opacity-40">
                          Started {new Date(selectedWorkflow.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-right">
                        <p className="col-header mb-1">Completion Progress</p>
                        <div className="flex items-center gap-3">
                          <div className="w-48 h-1.5 bg-line rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(selectedWorkflow.currentStepIndex / selectedWorkflow.steps.length) * 100}%` }}
                              className="h-full bg-ink"
                            />
                          </div>
                          <span className="font-mono text-xs font-bold">
                            {Math.round((selectedWorkflow.currentStepIndex / selectedWorkflow.steps.length) * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <InfoCard label="Jira Reference" value={selectedWorkflow.jiraTicket} icon={<ExternalLink size={14} />} />
                    <InfoCard label="Cost Sheet ID" value={selectedWorkflow.costSheetId} icon={<Database size={14} />} />
                    <InfoCard label="Jira LMS" value={selectedWorkflow.jiraLms || '---'} icon={<Activity size={14} />} />
                    <InfoCard label="Cost Sheet LMS" value={selectedWorkflow.costSheetLms || '---'} icon={<Activity size={14} />} />
                    <InfoCard label="Shapefile LMS" value={selectedWorkflow.shapefileLms || '---'} icon={<Box size={14} />} />
                  </div>

                  {selectedWorkflow.s3Path && (
                    <div className="p-4 glass-panel rounded-xl border-l-4 border-ink">
                      <p className="col-header mb-2">Active S3 Source</p>
                      <p className="font-mono text-xs break-all opacity-70">{selectedWorkflow.s3Path}</p>
                    </div>
                  )}

                  {/* Pipeline */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-line pb-4">
                      <h3 className="col-header">Execution Pipeline</h3>
                      <div className="flex gap-4 text-[10px] font-mono opacity-40">
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-success rounded-full" /> Completed</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-ink rounded-full" /> In Progress</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {selectedWorkflow.steps.map((step, idx) => (
                        <StepRow 
                          key={step.id}
                          step={step}
                          index={idx}
                          isCurrent={idx === selectedWorkflow.currentStepIndex}
                          processing={processingStep === step.id || (idx === selectedWorkflow.currentStepIndex && isCompleting)}
                          canExecute={currentUser ? step.role.includes(currentUser.role) : false}
                          onComplete={() => handleCompleteStep(selectedWorkflow.id)}
                          inputs={stepInputs}
                          onInputChange={(key: string, val: string) => setStepInputs(prev => ({ ...prev, [key]: val }))}
                          workflow={selectedWorkflow}
                        />
                      ))}
                    </div>
                  </div>

                  {selectedWorkflow.status === 'COMPLETED' && (
                    <motion.div 
                      initial={{ scale: 0.98, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="p-10 border border-success/30 bg-success/5 rounded-xl flex flex-col items-center text-center gap-6"
                    >
                      <div className="w-16 h-16 bg-success text-white rounded-full flex items-center justify-center shadow-lg shadow-success/20">
                        <CheckCircle2 size={32} />
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-serif italic text-3xl">Workflow Finalized</h4>
                        <p className="font-mono text-xs opacity-50 max-w-md">All geospatial validation checks have passed. The final data package is ready for delivery.</p>
                      </div>
                      <button className="btn-primary bg-success hover:bg-success/90">
                        Download Final Package.zip
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-10 text-center grayscale">
                  <Box size={120} strokeWidth={0.5} />
                  <p className="font-serif italic text-3xl mt-8">Select a workflow instance</p>
                  <p className="font-mono text-xs uppercase tracking-[0.3em] mt-4">Awaiting Pipeline Input</p>
                </div>
              )}
            </AnimatePresence>
          </section>
        </main>
      </div>

      {/* New Workflow Modal */}
      <AnimatePresence>
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNewModal(false)}
              className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-xl bg-surface border border-line p-10 shadow-2xl rounded-2xl"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="font-serif italic text-4xl">Initialize Pipeline</h2>
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-40 mt-2">New Workflow Instance Configuration</p>
                </div>
                <button onClick={() => setShowNewModal(false)} className="p-2 hover:bg-bg rounded-full transition-colors">
                  <Plus className="rotate-45 opacity-40" size={24} />
                </button>
              </div>
              
              <div className="space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="col-header">Workflow Type</label>
                    <select 
                      value={newWorkflow.type}
                      onChange={e => setNewWorkflow({...newWorkflow, type: e.target.value as WorkflowType})}
                      className="w-full bg-bg border border-line p-4 rounded-xl font-mono text-xs outline-none focus:border-ink transition-colors appearance-none"
                    >
                      {Object.values(WorkflowType).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="col-header">Production Phase</label>
                    <div className="flex p-1 bg-bg border border-line rounded-xl">
                      {Object.values(WorkflowPhase).map(p => (
                        <button 
                          key={p}
                          onClick={() => setNewWorkflow({...newWorkflow, phase: p})}
                          className={`flex-1 py-3 rounded-lg font-mono text-[10px] font-bold transition-all ${
                            newWorkflow.phase === p ? 'bg-surface shadow-sm text-ink' : 'text-ink/40 hover:text-ink/60'
                          }`}
                        >
                          {p.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="col-header">Jira Ticket Reference</label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20" size={14} />
                      <input 
                        type="text" 
                        placeholder="ENG-XXXX"
                        value={newWorkflow.jiraTicket}
                        onChange={e => setNewWorkflow({...newWorkflow, jiraTicket: e.target.value})}
                        className="w-full bg-bg border border-line p-4 pl-11 rounded-xl font-mono text-xs outline-none focus:border-ink transition-colors"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="col-header">Cost Sheet ID</label>
                    <div className="relative">
                      <Database className="absolute left-4 top-1/2 -translate-y-1/2 opacity-20" size={14} />
                      <input 
                        type="text" 
                        placeholder="CS-2024-XX"
                        value={newWorkflow.costSheetId}
                        onChange={e => setNewWorkflow({...newWorkflow, costSheetId: e.target.value})}
                        className="w-full bg-bg border border-line p-4 pl-11 rounded-xl font-mono text-xs outline-none focus:border-ink transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    onClick={() => setShowNewModal(false)}
                    className="flex-1 btn-secondary justify-center py-4 rounded-xl"
                  >
                    Discard
                  </button>
                  <button 
                    onClick={handleCreate}
                    className="flex-1 btn-primary justify-center py-4 rounded-xl shadow-lg shadow-ink/10"
                  >
                    Initialize Pipeline
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Status Bar */}
      <footer className="fixed bottom-0 left-20 right-0 h-8 border-t border-line bg-surface/80 backdrop-blur-md px-6 flex items-center justify-between z-10">
        <div className="flex gap-6 items-center">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-success rounded-full" />
            <span className="font-mono text-[8px] tracking-[0.2em] uppercase opacity-50">Operational Status: Nominal</span>
          </div>
          <div className="flex items-center gap-2">
            <Database size={10} className="opacity-30" />
            <span className="font-mono text-[8px] tracking-[0.2em] uppercase opacity-50">DB_SYNC: geoflow.db</span>
          </div>
        </div>
        <div className="font-mono text-[8px] tracking-[0.2em] opacity-30 uppercase">
          {new Date().toISOString()} // UTC_SYNC
        </div>
      </footer>
    </div>
  );
}

// Sub-components for cleaner code
function NavIcon({ icon, active, onClick, label }: { icon: React.ReactNode, active?: boolean, onClick?: () => void, label: string }) {
  return (
    <div className="relative group">
      <button 
        onClick={onClick}
        className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 ${
          active ? 'bg-ink text-bg shadow-md' : 'text-ink/40 hover:bg-bg hover:text-ink'
        }`}
      >
        {icon}
      </button>
      <div className="absolute left-full ml-4 px-2 py-1 bg-ink text-bg text-[10px] font-mono rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
        {label}
      </div>
      {active && <motion.div layoutId="nav-active" className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-6 bg-ink rounded-r-full" />}
    </div>
  );
}

function Badge({ count, label, color, pulse }: { count: number, label: string, color: string, pulse?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-md border border-line bg-surface shadow-sm`}>
      <div className={`w-1.5 h-1.5 rounded-full ${color} ${pulse ? 'animate-pulse' : ''}`} />
      <span className="font-mono text-[9px] font-bold uppercase tracking-wider">{label}</span>
      <span className="font-mono text-[9px] opacity-40">{count}</span>
    </div>
  );
}

function StatusIndicator({ status }: { status: string }) {
  const isCompleted = status === 'COMPLETED';
  const isFailed = status === 'FAILED';
  
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
      isCompleted ? 'border-success/20 bg-success/5 text-success' : 
      isFailed ? 'border-red-500/20 bg-red-500/5 text-red-500' :
      'border-warning/20 bg-warning/5 text-warning'
    }`}>
      <div className={`w-1 h-1 rounded-full ${
        isCompleted ? 'bg-success' : 
        isFailed ? 'bg-red-500' :
        'bg-warning animate-pulse'
      }`} />
      <span className="text-[9px] font-bold uppercase tracking-tighter">{status}</span>
    </div>
  );
}

function InfoCard({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="p-5 glass-panel rounded-2xl space-y-3 group hover:border-ink/20 transition-colors">
      <div className="flex items-center justify-between opacity-40">
        <p className="col-header">{label}</p>
        {icon}
      </div>
      <p className="font-mono text-lg font-bold tracking-tighter group-hover:translate-x-1 transition-transform">{value}</p>
    </div>
  );
}

function StepRow({ step, index, isCurrent, processing, canExecute, onComplete, inputs, onInputChange, workflow }: any) {
  const isLmsInput = step.name.includes('Input Jira & Cost Sheet LMS');
  const isS3Input = step.name.includes('Enter S3 Path');
  const isTriangulation = step.name.includes('Final LMS Triangulation Check');

  const allMatch = workflow?.jiraLms === workflow?.costSheetLms && workflow?.jiraLms === workflow?.shapefileLms;
  const isFailed = step.status === StepStatus.FAILED;

  return (
    <div className={`p-5 border rounded-2xl flex flex-col gap-4 transition-all duration-300 ${
      step.status === StepStatus.COMPLETED ? 'bg-success/5 border-success/10 opacity-60' : 
      isFailed ? 'bg-red-500/5 border-red-500/30' :
      isCurrent ? 'bg-surface border-ink shadow-xl shadow-ink/5 scale-[1.02] z-10' : 
      'bg-surface/40 border-line opacity-40 grayscale'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold border ${
            step.status === StepStatus.COMPLETED ? 'bg-success text-white border-success' : 
            isFailed ? 'bg-red-500 text-white border-red-500' :
            isCurrent ? 'bg-ink text-bg border-ink' : 'border-line opacity-30'
          }`}>
            {(index + 1).toString().padStart(2, '0')}
          </div>
          
          <div>
            <div className="flex items-center gap-3">
              <p className={`font-bold text-sm tracking-tight ${step.status === StepStatus.COMPLETED ? 'line-through opacity-50' : ''}`}>
                {step.name.toUpperCase()}
              </p>
              {step.isAutomatic && (
                <span className="px-1.5 py-0.5 bg-ink/5 text-[8px] font-mono font-bold rounded border border-line">AUTO</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 opacity-40">
              <span className="text-[9px] font-mono uppercase tracking-widest">Role: {step.role.join('/') || 'SYSTEM'}</span>
              {isTriangulation && step.status === StepStatus.COMPLETED && (
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${allMatch ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                  {allMatch ? 'TRIANGULATION_MATCH' : 'TRIANGULATION_MISMATCH'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {step.status === StepStatus.COMPLETED ? (
            <div className="flex items-center gap-2 text-success font-mono text-[10px] font-bold">
              <CheckCircle2 size={16} /> VERIFIED
            </div>
          ) : isFailed ? (
            <div className="flex items-center gap-2 text-red-500 font-mono text-[10px] font-bold">
              <AlertCircle size={16} /> FAILED
            </div>
          ) : processing ? (
            <div className="flex items-center gap-3">
              <div className="w-24 h-1 bg-line rounded-full overflow-hidden">
                <motion.div 
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                  className="w-full h-full bg-ink"
                />
              </div>
              <span className="text-[9px] font-mono animate-pulse font-bold">SYSTEM_PROCESSING</span>
            </div>
          ) : isCurrent ? (
            canExecute ? (
              <button 
                onClick={onComplete}
                disabled={
                  (isLmsInput && (!inputs.jiraLms || !inputs.costSheetLms)) ||
                  (isS3Input && !inputs.s3Path)
                }
                className="btn-primary px-6 py-2 rounded-xl group disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {step.isAutomatic ? 'Run Check' : 'Verify & Complete'}
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>
            ) : (
              <div className="flex items-center gap-2 text-[10px] font-mono opacity-40 italic bg-bg px-3 py-1.5 rounded-lg">
                <AlertCircle size={12} /> Pending Action: {step.role.join('/')}
              </div>
            )
          ) : (
            <Clock size={18} className="opacity-10" />
          )}
        </div>
      </div>

      {isFailed && step.error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-[10px] font-mono text-red-500 font-bold uppercase mb-1">Error Report:</p>
          <p className="text-xs font-mono text-red-400">{step.error}</p>
        </div>
      )}

      {isCurrent && canExecute && !processing && (isLmsInput || isS3Input) && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="grid grid-cols-2 gap-4 pt-2 border-t border-line/10"
        >
          {isLmsInput && (
            <>
              <div className="space-y-1">
                <label className="text-[9px] font-mono uppercase opacity-40">Jira LMS Value</label>
                <input 
                  type="text" 
                  value={inputs.jiraLms}
                  onChange={e => onInputChange('jiraLms', e.target.value)}
                  placeholder="Enter LMS from Jira"
                  className="w-full bg-bg border border-line p-2 rounded-lg font-mono text-[10px] outline-none focus:border-ink"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono uppercase opacity-40">Cost Sheet LMS Value</label>
                <input 
                  type="text" 
                  value={inputs.costSheetLms}
                  onChange={e => onInputChange('costSheetLms', e.target.value)}
                  placeholder="Enter LMS from Cost Sheet"
                  className="w-full bg-bg border border-line p-2 rounded-lg font-mono text-[10px] outline-none focus:border-ink"
                />
              </div>
            </>
          )}
          {isS3Input && (
            <div className="col-span-2 space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[9px] font-mono uppercase opacity-40">S3 Source Path (ZIP)</label>
                <button 
                  onClick={() => onInputChange('s3Path', 's3://testbucket12354555/svec/')}
                  className="text-[8px] font-mono uppercase text-ink/40 hover:text-ink underline underline-offset-2"
                >
                  Use Test Bucket
                </button>
              </div>
              <input 
                type="text" 
                value={inputs.s3Path}
                onChange={e => onInputChange('s3Path', e.target.value)}
                placeholder="s3://bucket/path/to/data.zip"
                className="w-full bg-bg border border-line p-2 rounded-lg font-mono text-[10px] outline-none focus:border-ink"
              />
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="p-20 flex flex-col items-center justify-center gap-4 opacity-20">
      <div className="w-10 h-10 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      <p className="font-mono text-[10px] uppercase tracking-widest">Syncing Data Stream...</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-20 flex flex-col items-center justify-center gap-4 opacity-10 text-center">
      <Layers size={48} strokeWidth={1} />
      <p className="font-serif italic text-xl">No active pipelines found</p>
      <p className="font-mono text-[10px] uppercase tracking-widest">Initialize a new workflow to begin</p>
    </div>
  );
}
