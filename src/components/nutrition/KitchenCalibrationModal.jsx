import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Ruler, 
  X, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Scale,
  UtensilsCrossed,
  Layers,
  Edit3
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { getCalibrationProgress, DEFAULT_CALIBRATION_TASKS } from '../../utils/nutritionEngine.js';

export const KitchenCalibrationModal = ({
  isOpen,
  onClose,
  kitchenCalibration = {},
  onUpdateCalibration,
  soundEnabled = true
}) => {
  const tasks = (kitchenCalibration?.tasks && kitchenCalibration.tasks.length > 0)
    ? kitchenCalibration.tasks
    : DEFAULT_CALIBRATION_TASKS;

  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'dishware' | 'staples' | 'recipes'
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  // Custom measurement state
  const [customTitle, setCustomTitle] = useState('');
  const [customCategory, setCustomCategory] = useState('dishware');
  const [customInstruction, setCustomInstruction] = useState('');
  const [customDiameter, setCustomDiameter] = useState('');
  const [customVolume, setCustomVolume] = useState('');
  const [customTare, setCustomTare] = useState('');

  const progress = getCalibrationProgress(tasks);

  if (!isOpen) return null;

  const filteredTasks = tasks.filter(t => {
    if (activeTab === 'all') return true;
    return t.category === activeTab;
  });

  const handleToggleExpand = (task) => {
    playSound('click', soundEnabled);
    if (expandedTaskId === task.id) {
      setExpandedTaskId(null);
    } else {
      setExpandedTaskId(task.id);
      // Pre-fill existing values or defaults
      const existing = task.values || {};
      const initial = {};
      task.fields.forEach(f => {
        initial[f.key] = existing[f.key] !== undefined ? existing[f.key] : (f.default || '');
      });
      setFormValues(initial);
    }
  };

  const handleFieldChange = (key, val) => {
    setFormValues(prev => ({ ...prev, [key]: val }));
  };

  const handleSaveTask = (taskId) => {
    playSound('success', soundEnabled);
    const updatedTasks = tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          completed: true,
          completedAt: new Date().toISOString(),
          values: { ...formValues }
        };
      }
      return t;
    });

    if (onUpdateCalibration) {
      onUpdateCalibration({ ...kitchenCalibration, tasks: updatedTasks });
    }
    setExpandedTaskId(null);
  };

  const handleClearTask = (taskId) => {
    playSound('click', soundEnabled);
    const updatedTasks = tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          completed: false,
          completedAt: null,
          values: null
        };
      }
      return t;
    });

    if (onUpdateCalibration) {
      onUpdateCalibration({ ...kitchenCalibration, tasks: updatedTasks });
    }
  };

  const handleDeleteCustomTask = (taskId) => {
    playSound('click', soundEnabled);
    const updatedTasks = tasks.filter(t => t.id !== taskId);
    if (onUpdateCalibration) {
      onUpdateCalibration({ ...kitchenCalibration, tasks: updatedTasks });
    }
    setExpandedTaskId(null);
  };

  const handleCreateCustomTask = (e) => {
    e.preventDefault();
    if (!customTitle.trim()) return;

    playSound('success', soundEnabled);
    const newTask = {
      id: `task-custom-${Date.now()}`,
      category: customCategory,
      title: customTitle.trim(),
      shortDesc: "Custom calibrated item",
      icon: customCategory === 'dishware' ? "🥣" : customCategory === 'staples' ? "🏷️" : "🥗",
      instruction: customInstruction.trim() || "Physical measurements recorded for AI vision scale calibration.",
      fields: [
        { key: "diameterInches", label: "Diameter / Width (inches)", placeholder: "e.g. 7.5", type: "number", step: "0.1" },
        { key: "volumeMl", label: "Volume capacity (ml or oz)", placeholder: "e.g. 500 ml", type: "text" },
        { key: "tareWeightG", label: "Empty weight (g)", placeholder: "e.g. 350", type: "number" }
      ],
      completed: true,
      completedAt: new Date().toISOString(),
      values: {
        name: customTitle.trim(),
        diameterInches: customDiameter,
        volumeMl: customVolume,
        tareWeightG: customTare
      }
    };

    const updatedTasks = [...tasks, newTask];
    if (onUpdateCalibration) {
      onUpdateCalibration({ ...kitchenCalibration, tasks: updatedTasks });
    }

    setIsAddingCustom(false);
    setCustomTitle('');
    setCustomDiameter('');
    setCustomVolume('');
    setCustomTare('');
  };

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[110] flex items-center justify-center p-4 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/80 backdrop-blur-xl"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="relative w-full max-w-2xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/[0.04]"
                style={{ border: '1px solid var(--accent-border)' }}
              >
                <Ruler className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Kitchen Hardware Calibration</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-300 border border-white/10">
                    Vision Scale Ground Truth
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Measure your bowls and dishes so Gemini Vision calculates exact portions from your photos
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                playSound('click', soundEnabled);
                onClose();
              }}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress Banner */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">Calibration Progress</span>
                <span className="font-mono text-[11px] text-slate-400">
                  ({progress.completed} of {progress.total} Tasks Completed)
                </span>
              </div>
              <span className="font-mono font-bold" style={{ color: 'var(--accent-primary)' }}>
                {progress.percentage}%
              </span>
            </div>

            {/* Progress Track */}
            <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ 
                  width: `${progress.percentage}%`,
                  backgroundColor: progress.isAllCompleted ? '#10b981' : 'var(--accent-primary)'
                }}
              />
            </div>

            {progress.isAllCompleted ? (
              <div className="flex items-center gap-2 pt-1 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>All hardware measured! Gemini Vision is now using your physical dimensions as a scale ruler.</span>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Complete the to-do tasks below. Each physical measurement anchors the AI model to eliminate portion hallucination.
              </p>
            )}
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {[
              { id: 'all', label: `All (${tasks.length})` },
              { id: 'dishware', label: '🥣 Dishware & Bowls' },
              { id: 'staples', label: '🏷️ Pantry Brands' },
              { id: 'recipes', label: '🥗 Signature Recipes' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  playSound('click', soundEnabled);
                  setActiveTab(tab.id);
                }}
                className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'bg-white/[0.03] hover:bg-white/[0.06] text-slate-400 hover:text-white border border-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Task Checklist */}
          <div className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-1">
            {filteredTasks.map(task => {
              const isExpanded = expandedTaskId === task.id;
              const isDone = task.completed && task.values;

              return (
                <div
                  key={task.id}
                  className={`rounded-2xl border transition-all overflow-hidden ${
                    isDone 
                      ? 'bg-white/[0.02] border-emerald-500/20' 
                      : isExpanded
                        ? 'bg-white/[0.04] border-white/20'
                        : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/[0.08]'
                  }`}
                >
                  {/* Task Summary Row */}
                  <div
                    onClick={() => handleToggleExpand(task)}
                    className="p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 border ${
                        isDone 
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                          : 'bg-white/[0.04] border-white/10 text-slate-300'
                      }`}>
                        {isDone ? <Check className="w-4 h-4" /> : <span>{task.icon || '📏'}</span>}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`text-xs font-bold ${isDone ? 'text-emerald-300' : 'text-white'}`}>
                            {task.title}
                          </h4>
                          {isDone && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Calibrated
                            </span>
                          )}
                        </div>

                        {isDone ? (
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            {Object.entries(task.values || {}).map(([k, v]) => (
                              v ? <span key={k}>• {v}</span> : null
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {task.shortDesc}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isDone && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleExpand(task);
                          }}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] font-medium border border-white/5 cursor-pointer flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      )}
                      <div className="p-1 text-slate-500">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Measurement Form */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-3.5 pb-4 pt-1 border-t border-white/[0.06] space-y-3"
                      >
                        {/* Step-by-Step Instructions */}
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-[11px] text-slate-300 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-white">
                            <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
                            <span>How to Measure:</span>
                          </div>
                          <p className="leading-relaxed text-slate-400">
                            {task.instruction}
                          </p>
                        </div>

                        {/* Input Fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {task.fields.map(field => (
                            <div key={field.key} className="space-y-1">
                              <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold">
                                {field.label}
                              </label>
                              <input
                                type={field.type || 'text'}
                                step={field.step}
                                value={formValues[field.key] !== undefined ? formValues[field.key] : ''}
                                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono placeholder-slate-500 focus:outline-none focus:border-white/25 transition-all"
                              />
                            </div>
                          ))}
                        </div>

                        {/* Save & Reset Actions */}
                        <div className="flex items-center justify-between gap-2 pt-1">
                          {task.id.startsWith('task-custom-') ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomTask(task.id)}
                              className="px-3 py-1.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs font-medium transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Custom Item</span>
                            </button>
                          ) : isDone ? (
                            <button
                              type="button"
                              onClick={() => handleClearTask(task.id)}
                              className="px-3 py-1.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs font-medium transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Reset Task</span>
                            </button>
                          ) : <div />}

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedTaskId(null)}
                              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/5 cursor-pointer transition-all"
                            >
                              Cancel
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSaveTask(task.id)}
                              className="px-4 py-1.5 rounded-xl text-white text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                              style={{ backgroundColor: 'var(--accent-primary)' }}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save Measurement</span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* Add Custom Hardware Measurement Form */}
          {isAddingCustom ? (
            <form onSubmit={handleCreateCustomTask} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span>Add New Dish or Measurement</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingCustom(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400">Item Name</label>
                  <input
                    type="text"
                    required
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="e.g. Glass Meal Prep Container, Tall Tumbler"
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs placeholder-slate-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400">Category</label>
                  <select
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-white text-xs font-mono outline-none"
                  >
                    <option value="dishware">🥣 Dishware / Container</option>
                    <option value="staples">🏷️ Pantry Staple</option>
                    <option value="recipes">🥗 Signature Recipe</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400">Diameter / Width (inches)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={customDiameter}
                    onChange={(e) => setCustomDiameter(e.target.value)}
                    placeholder="e.g. 7.5"
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono placeholder-slate-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400">Volume Capacity</label>
                  <input
                    type="text"
                    value={customVolume}
                    onChange={(e) => setCustomVolume(e.target.value)}
                    placeholder="e.g. 500 ml or 16 oz"
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono placeholder-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingCustom(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl text-white text-xs font-bold shadow-md transition-all active:scale-95"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  Save Custom Item
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setIsAddingCustom(true);
              }}
              className="w-full py-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-dashed border-white/15 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Another Bowl, Plate, or Measurement</span>
            </button>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
