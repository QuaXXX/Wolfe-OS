import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FolderSync, 
  Folder, 
  FileText, 
  CheckCircle2, 
  RefreshCw, 
  Unlink, 
  X, 
  ExternalLink,
  BookOpen,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { 
  connectObsidianVault, 
  scanVaultDirectory, 
  getVaultHandle, 
  clearVaultHandle, 
  getVaultMetadata,
  readVaultFileContent,
  SAMPLE_OBSIDIAN_VAULT
} from '../../utils/obsidianService';
import { playSound } from '../../utils/soundFX';

export const ObsidianVaultManagerModal = ({ 
  isOpen, 
  onClose, 
  onVaultUpdated,
  soundEnabled = true 
}) => {
  const [vaultMeta, setVaultMeta] = useState(getVaultMetadata());
  const [isLoading, setIsLoading] = useState(false);
  const [activeHandle, setActiveHandle] = useState(null);
  const [scannedFiles, setScannedFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSelectedFile(null);
      setFileContent('');
      loadExistingHandle();
    }
  }, [isOpen]);

  const loadExistingHandle = async () => {
    setIsLoading(true);
    try {
      const handle = await getVaultHandle();
      if (handle) {
        setActiveHandle(handle);
        const scanned = await scanVaultDirectory(handle);
        setScannedFiles(scanned.files);
        setVaultMeta({
          connected: true,
          folderName: handle.name,
          totalNotes: scanned.files.length,
          courses: scanned.courses,
          lastScanned: new Date().toISOString()
        });
      } else {
        setActiveHandle(null);
        // Fallback sample files for instant demonstration
        setScannedFiles(SAMPLE_OBSIDIAN_VAULT.map(s => ({
          name: s.name,
          path: s.path,
          extension: 'md',
          course: s.course,
          isSample: true,
          sampleContent: s.content
        })));
      }
    } catch (err) {
      console.warn("Load handle notice:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleConnectFolder = async () => {
    playSound('click', soundEnabled);
    setIsLoading(true);
    setError(null);

    try {
      const { handle, files, courses } = await connectObsidianVault();
      setActiveHandle(handle);
      setScannedFiles(files);
      const newMeta = {
        connected: true,
        folderName: handle.name,
        totalNotes: files.length,
        courses,
        lastScanned: new Date().toISOString()
      };
      setVaultMeta(newMeta);
      playSound('success', soundEnabled);
      if (onVaultUpdated) onVaultUpdated(newMeta, files);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || "Could not connect to the selected folder.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    playSound('click', soundEnabled);
    await clearVaultHandle();
    setActiveHandle(null);
    setVaultMeta({ connected: false, folderName: null, totalNotes: 0, courses: [] });
    setScannedFiles(SAMPLE_OBSIDIAN_VAULT.map(s => ({
      name: s.name,
      path: s.path,
      extension: 'md',
      course: s.course,
      isSample: true,
      sampleContent: s.content
    })));
    setSelectedFile(null);
    setFileContent('');
    if (onVaultUpdated) onVaultUpdated({ connected: false }, []);
  };

  const handleFileClick = async (file) => {
    playSound('click', soundEnabled);
    setSelectedFile(file);
    if (file.isSample) {
      setFileContent(file.sampleContent || '');
      return;
    }
    if (file.handle) {
      const text = await readVaultFileContent(file.handle);
      setFileContent(text);
    }
  };

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-4 select-none">
        {/* Frosted Glass Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/50 backdrop-blur-xl transition-all"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-6 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#6d28d9]/15 border border-[#7c3aed]/30 text-[#a78bfa]"
              >
                <FolderSync className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Obsidian Vault Knowledge Base</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#6d28d9]/25 text-[#c4b5fd] font-semibold border border-[#7c3aed]/30">
                    Live Markdown Sync
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Direct disk connection to your school notes, summaries & outlines</p>
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

          {/* Connection Status Card */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${vaultMeta.connected ? 'bg-emerald-400 animate-pulse' : 'bg-purple-400'}`} />
                <span className="text-xs font-bold text-white">
                  {vaultMeta.connected ? `Vault Connected: "${vaultMeta.folderName}"` : "Sample Vault Active (Connect Your Folder)"}
                </span>
              </div>

              {vaultMeta.connected ? (
                <button
                  onClick={handleDisconnect}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Unlink className="w-3 h-3" />
                  <span>Disconnect</span>
                </button>
              ) : (
                <button
                  onClick={handleConnectFolder}
                  disabled={isLoading}
                  className="px-3.5 py-1.5 rounded-xl text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>{isLoading ? "Connecting..." : "Select Obsidian Vault Folder"}</span>
                </button>
              )}
            </div>

            <p className="text-xs text-slate-300">
              {vaultMeta.connected 
                ? `Wolfe OS has live read & write access to ${scannedFiles.length} notes across ${vaultMeta.courses?.length || 0} detected courses. AI automatically retrieves context for study decks and email drafts.`
                : "Select your local Obsidian vault folder once. Wolfe OS uses the browser's File System Access API to index your notes privately on your device without uploading anything to external servers."}
            </p>
          </div>

          {/* Scanned Files Tree & Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px]">
            {/* File List */}
            <div className="space-y-1.5 overflow-y-auto pr-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between pb-1">
                <span>Indexed Notes ({scannedFiles.length})</span>
                {activeHandle && (
                  <button 
                    onClick={loadExistingHandle} 
                    className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Rescan</span>
                  </button>
                )}
              </div>

              {scannedFiles.map((file, idx) => {
                const isSelected = selectedFile?.path === file.path;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleFileClick(file)}
                    className={`w-full text-left p-2 rounded-xl text-xs border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-white/[0.08] border-white/30 text-white shadow-sm'
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </div>
                    {file.course && (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-slate-400 border border-white/10 shrink-0">
                        {file.course}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Note Preview Box */}
            <div className="p-3 rounded-2xl bg-black/40 border border-white/10 overflow-y-auto font-mono text-[11px] text-slate-300">
              {selectedFile ? (
                <div className="space-y-2">
                  <div className="text-xs font-bold font-sans text-white border-b border-white/10 pb-1 flex items-center justify-between">
                    <span className="truncate">{selectedFile.name}</span>
                    <span className="text-[10px] text-purple-300 font-mono">Preview</span>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-xs text-slate-300 leading-relaxed">
                    {fileContent || "Loading content..."}
                  </pre>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
                  <BookOpen className="w-6 h-6 mb-2 opacity-50 text-purple-400" />
                  <p className="text-xs">Click any note to preview its contents and structure.</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
