import React, { useState, useMemo } from 'react';
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
  Edit3,
  Search,
  RefreshCw
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { getCalibrationProgress, getMergedCalibrationTasks, DEFAULT_CALIBRATION_TASKS } from '../../utils/nutritionEngine.js';
import { searchBrandedFoodDatabase } from '../../utils/aiService.js';

export const KitchenCalibrationModal = ({
  isOpen,
  onClose,
  kitchenCalibration = {},
  onUpdateCalibration,
  aiConfig = {},
  soundEnabled = true
}) => {
  const tasks = useMemo(() => {
    return getMergedCalibrationTasks(kitchenCalibration);
  }, [kitchenCalibration]);

  const [activeTab, setActiveTab] = useState('all');
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [isBrandSearchOpen, setIsBrandSearchOpen] = useState(false);

  const availableTabs = useMemo(() => {
    const dishwareTasks = tasks.filter(t => t.category === 'dishware');
    const staplesTasks = tasks.filter(t => t.category === 'staples');
    const recipeTasks = tasks.filter(t => t.category === 'recipes');

    const tabs = [
      { id: 'all', label: `All (${tasks.filter(t => t.completed).length}/${tasks.length})` }
    ];
    if (dishwareTasks.length > 0) {
      tabs.push({ id: 'dishware', label: `🥣 Dishware (${dishwareTasks.filter(t => t.completed).length}/${dishwareTasks.length})` });
    }
    if (staplesTasks.length > 0) {
      tabs.push({ id: 'staples', label: `🏷️ Saved Staples (${staplesTasks.filter(t => t.completed).length}/${staplesTasks.length})` });
    }
    if (recipeTasks.length > 0) {
      tabs.push({ id: 'recipes', label: `🥗 Custom Builds (${recipeTasks.filter(t => t.completed).length}/${recipeTasks.length})` });
    }
    return tabs;
  }, [tasks]);

  // Global Brand Search State
  const [globalBrandQuery, setGlobalBrandQuery] = useState('');
  const [globalBrandResults, setGlobalBrandResults] = useState([]);
  const [isGlobalSearching, setIsGlobalSearching] = useState(false);
  const [globalSearchError, setGlobalSearchError] = useState(null);

  // Per-Task Inline Brand Search State
  const [taskBrandQueries, setTaskBrandQueries] = useState({});
  const [taskBrandResults, setTaskBrandResults] = useState({});
  const [taskIsSearching, setTaskIsSearching] = useState({});
  const [taskSearchError, setTaskSearchError] = useState({});

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
      onUpdateCalibration({ 
        ...kitchenCalibration, 
        tasks: updatedTasks,
        updatedAt: Date.now(),
        lastUpdatedTaskId: taskId
      });
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
          clearedAt: new Date().toISOString(),
          values: null
        };
      }
      return t;
    });

    if (onUpdateCalibration) {
      onUpdateCalibration({ 
        ...kitchenCalibration, 
        tasks: updatedTasks,
        updatedAt: Date.now(),
        lastClearedTaskId: taskId
      });
    }
  };

  const handleDeleteCustomTask = (taskId) => {
    playSound('click', soundEnabled);
    const updatedTasks = tasks.filter(t => t.id !== taskId);
    if (onUpdateCalibration) {
      onUpdateCalibration({ 
        ...kitchenCalibration, 
        tasks: updatedTasks,
        updatedAt: Date.now(),
        deletedTaskId: taskId
      });
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
      onUpdateCalibration({ 
        ...kitchenCalibration, 
        tasks: updatedTasks,
        updatedAt: Date.now(),
        lastUpdatedTaskId: newTask.id
      });
    }

    setIsAddingCustom(false);
    setCustomTitle('');
    setCustomDiameter('');
    setCustomVolume('');
    setCustomTare('');
  };

  const handleGlobalBrandSearch = async (e) => {
    if (e) e.preventDefault();
    const q = globalBrandQuery.trim();
    if (!q) return;

    playSound('click', soundEnabled);
    setIsGlobalSearching(true);
    setGlobalSearchError(null);

    try {
      const items = await searchBrandedFoodDatabase({ query: q, aiConfig });
      if (items && items.length > 0) {
        setGlobalBrandResults(items);
        playSound('success', soundEnabled);
      } else {
        setGlobalBrandResults([]);
        setGlobalSearchError(`No verified label found for "${q}". Try typing the full brand name.`);
      }
    } catch (err) {
      setGlobalSearchError("Brand search encountered an issue. Please try again.");
    } finally {
      setIsGlobalSearching(false);
    }
  };

  const handleTaskBrandSearch = async (taskId, defaultQuery = '') => {
    const q = (taskBrandQueries[taskId] !== undefined ? taskBrandQueries[taskId] : (defaultQuery || formValues.brand || '')).trim();
    if (!q) return;

    playSound('click', soundEnabled);
    setTaskIsSearching(prev => ({ ...prev, [taskId]: true }));
    setTaskSearchError(prev => ({ ...prev, [taskId]: null }));

    try {
      const items = await searchBrandedFoodDatabase({ query: q, aiConfig });
      if (items && items.length > 0) {
        setTaskBrandResults(prev => ({ ...prev, [taskId]: items }));
        playSound('success', soundEnabled);
      } else {
        setTaskBrandResults(prev => ({ ...prev, [taskId]: [] }));
        setTaskSearchError(prev => ({ ...prev, [taskId]: `No product found for "${q}".` }));
      }
    } catch (err) {
      setTaskSearchError(prev => ({ ...prev, [taskId]: "Search failed. Please try again." }));
    } finally {
      setTaskIsSearching(prev => ({ ...prev, [taskId]: false }));
    }
  };

  const handleApplyBrandToTask = (task, item) => {
    playSound('success', soundEnabled);
    const updated = { ...formValues };

    const fullTitle = item.brand ? `${item.brand} ${item.name}` : item.name;
    if (task.fields.some(f => f.key === 'brand')) {
      updated.brand = fullTitle;
    }
    if (task.fields.some(f => f.key === 'name')) {
      updated.name = fullTitle;
    }

    const cals = Number(item.calories) || 0;
    ['cals', 'calsPerHalfCup', 'calsPerSlice', 'calsPerCup', 'calsPerBar', 'calsPerUnit', 'calsPerScoop'].forEach(k => {
      if (task.fields.some(f => f.key === k)) updated[k] = cals;
    });

    const protein = Number(item.protein) || 0;
    ['protein', 'proteinPerHalfCup', 'proteinPerServing', 'proteinPerScoop', 'proteinPerCup', 'proteinPerBar', 'proteinPerUnit'].forEach(k => {
      if (task.fields.some(f => f.key === k)) updated[k] = protein;
    });

    const carbs = Number(item.carbs) || 0;
    ['carbs', 'carbsPerCup', 'carbsPerUnit'].forEach(k => {
      if (task.fields.some(f => f.key === k)) updated[k] = carbs;
    });

    const fats = Number(item.fats) || 0;
    ['fat', 'fats'].forEach(k => {
      if (task.fields.some(f => f.key === k)) updated[k] = fats;
    });

    const sSize = item.servingSize || '';
    const matchGrams = sSize.match(/(\d+(?:\.\d+)?)\s*g/i);
    const gramsNum = matchGrams ? matchGrams[1] : null;

    if (task.fields.some(f => f.key === 'sliceWeightG') && gramsNum) {
      updated.sliceWeightG = gramsNum;
    }
    if (task.fields.some(f => f.key === 'servingGrams')) {
      updated.servingGrams = sSize;
    }
    if (task.fields.some(f => f.key === 'scoopGrams') && gramsNum) {
      updated.scoopGrams = `${gramsNum}g`;
    }

    setFormValues(updated);
  };

  const handleAddSearchedBrandAsStaple = (item) => {
    playSound('success', soundEnabled);
    const title = `${item.brand || ''} ${item.name}`.trim();
    const newTask = {
      id: `task-custom-${Date.now()}`,
      category: 'staples',
      title: title,
      shortDesc: `${item.servingSize || '1 serving'} • ${item.calories} kcal • ${item.protein}g P`,
      icon: "🏷️",
      instruction: `Verified manufacturer nutrition facts for ${title}.`,
      fields: [
        { key: "brand", label: "Brand & Product Name", type: "text" },
        { key: "servingSize", label: "Serving Size", type: "text" },
        { key: "calories", label: "Calories", type: "number" },
        { key: "protein", label: "Protein (g)", type: "number" },
        { key: "carbs", label: "Carbs (g)", type: "number" },
        { key: "fats", label: "Fats (g)", type: "number" }
      ],
      completed: true,
      completedAt: new Date().toISOString(),
      values: {
        brand: title,
        servingSize: item.servingSize || '1 serving',
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fats: item.fats,
        source: item.source || 'Verified Label'
      }
    };

    const updatedTasks = [...tasks, newTask];
    if (onUpdateCalibration) {
      onUpdateCalibration({ 
        ...kitchenCalibration, 
        tasks: updatedTasks,
        updatedAt: Date.now(),
        lastUpdatedTaskId: newTask.id
      });
    }
    setGlobalBrandResults([]);
    setGlobalBrandQuery('');
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

          {/* Category Filter Tabs (Only shown if user has custom staples / builds) */}
          {availableTabs.length > 2 ? (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              {availableTabs.map(tab => (
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
          ) : (
            <div className="flex items-center justify-between text-xs text-slate-300 px-0.5">
              <div className="flex items-center gap-2 font-bold text-white">
                <Ruler className="w-3.5 h-3.5 text-indigo-400" />
                <span>Necessary Hardware Scale Tasks ({tasks.filter(t => t.completed).length}/{tasks.length})</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">Physical measurements for vision scale</span>
            </div>
          )}

          {/* Action Toolbar: Collapsible Brand Search & Custom Hardware */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setIsBrandSearchOpen(prev => !prev);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isBrandSearchOpen 
                  ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' 
                  : 'bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 border-white/10'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-indigo-400" />
              <span>Search Brand & Save Staple</span>
              {isBrandSearchOpen ? <ChevronUp className="w-3.5 h-3.5 ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setIsAddingCustom(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 border border-white/10 text-xs font-semibold transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-slate-400" />
              <span>+ Add Hardware</span>
            </button>
          </div>

          {/* Collapsible Brand Search Bar */}
          {isBrandSearchOpen && (
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Search Branded Food Database</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Direct Nutrition Facts Label Lookup
                </span>
              </div>

              <form onSubmit={handleGlobalBrandSearch} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={globalBrandQuery}
                    onChange={(e) => setGlobalBrandQuery(e.target.value)}
                    placeholder='Search any food brand (e.g. "Good Culture 2%", "Kirkland PB", "Fairlife", "Barebells")...'
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isGlobalSearching || !globalBrandQuery.trim()}
                  className="px-4 py-2 rounded-xl text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  {isGlobalSearching ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>{isGlobalSearching ? 'Searching...' : 'Search'}</span>
                </button>
              </form>

            {/* Global Search Results List */}
            {globalBrandResults.length > 0 && (
              <div className="space-y-1.5 pt-1.5 max-h-52 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1">
                  <span>Found {globalBrandResults.length} verified products:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setGlobalBrandResults([]);
                      setGlobalBrandQuery('');
                    }}
                    className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                </div>

                {globalBrandResults.map(item => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-black/60 border border-white/10 hover:border-white/20 flex items-center justify-between gap-3 transition-all"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white">{item.name}</span>
                        {item.brand && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10">
                            {item.brand}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-emerald-400">
                          {item.source}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        <span>{item.servingSize}</span> • <span className="text-amber-300 font-semibold">{item.calories} kcal</span> • <span className="text-indigo-300 font-semibold">{item.protein}g P</span> • <span className="text-sky-300">{item.carbs}g C</span> • <span className="text-rose-300">{item.fats}g F</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {expandedTaskId && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentTask = tasks.find(t => t.id === expandedTaskId);
                            if (currentTask) handleApplyBrandToTask(currentTask, item);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                          title="Fill into currently open task"
                        >
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          <span>Fill Open Task</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleAddSearchedBrandAsStaple(item)}
                        className="px-3 py-1.5 rounded-lg text-white text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                        style={{ backgroundColor: 'var(--accent-primary)' }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Save as Staple</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {globalSearchError && (
              <p className="text-xs text-amber-300 pt-1">{globalSearchError}</p>
            )}
          </div>
        )}

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

                        {/* Inline Brand Search & Auto-Fill */}
                        {(task.category === 'staples' || task.fields.some(f => f.key === 'brand')) && (
                          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                <Search className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Look Up Your Brand</span>
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                Auto-fills exact nutrition
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={taskBrandQueries[task.id] !== undefined ? taskBrandQueries[task.id] : (formValues.brand || '')}
                                onChange={(e) => setTaskBrandQueries(prev => ({ ...prev, [task.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleTaskBrandSearch(task.id);
                                  }
                                }}
                                placeholder='e.g. "Good Culture 2%", "Dave’s Killer Bread", "Fairlife 2%"...'
                                className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30"
                              />
                              <button
                                type="button"
                                onClick={() => handleTaskBrandSearch(task.id)}
                                disabled={taskIsSearching[task.id]}
                                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shrink-0 disabled:opacity-50"
                              >
                                {taskIsSearching[task.id] ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Search className="w-3.5 h-3.5" />
                                )}
                                <span>{taskIsSearching[task.id] ? 'Searching...' : 'Search'}</span>
                              </button>
                            </div>

                            {/* Task Brand Results */}
                            {taskBrandResults[task.id] && taskBrandResults[task.id].length > 0 && (
                              <div className="space-y-1.5 pt-1 max-h-44 overflow-y-auto">
                                {taskBrandResults[task.id].map(item => (
                                  <div
                                    key={item.id}
                                    className="p-2 rounded-xl bg-black/60 border border-white/10 flex items-center justify-between gap-3 text-xs"
                                  >
                                    <div className="min-w-0">
                                      <div className="font-bold text-white truncate">{item.name}</div>
                                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                        {item.servingSize} • <span className="text-amber-300">{item.calories} kcal</span> • <span className="text-indigo-300">{item.protein}g P</span> • <span className="text-sky-300">{item.carbs}g C</span> • <span className="text-rose-300">{item.fats}g F</span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleApplyBrandToTask(task, item)}
                                      className="px-2.5 py-1 rounded-lg text-white text-xs font-semibold shrink-0 transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                                      style={{ backgroundColor: 'var(--accent-primary)' }}
                                    >
                                      <Sparkles className="w-3 h-3" />
                                      <span>Apply</span>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {taskSearchError[task.id] && (
                              <p className="text-[10px] text-amber-400">{taskSearchError[task.id]}</p>
                            )}
                          </div>
                        )}

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
