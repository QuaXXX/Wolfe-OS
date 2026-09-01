/**
 * Obsidian Vault & Local Markdown File Integration Service
 * Uses native File System Access API (showDirectoryPicker) and IndexedDB handle persistence
 */

import { extractTextFromFile } from './documentParser.js';

const DB_NAME = 'wolfe_os_vault_db';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'obsidian_dir_handle';
const FILES_CACHE_KEY = 'wolfe_obsidian_files_cache';
const VAULT_METADATA_KEY = 'wolfe_obsidian_vault_meta';

// Helper to open IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error("IndexedDB is not supported"));
    }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save directory handle to IndexedDB
 */
export async function saveVaultHandle(handle) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to persist vault handle to IndexedDB:", err);
    return false;
  }
}

/**
 * Save indexed files cache to IndexedDB / LocalStorage
 */
export async function saveCachedVaultFiles(files = [], courses = [], folderName = 'school') {
  try {
    const safeFiles = files.map(f => ({
      name: f.name,
      path: f.path,
      extension: f.extension,
      course: f.course,
      size: f.size || 0,
      cachedContent: f.cachedContent ? f.cachedContent.slice(0, 10000) : ''
    }));

    const payload = {
      folderName,
      files: safeFiles,
      courses,
      lastUpdated: new Date().toISOString()
    };

    localStorage.setItem(FILES_CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("Files cache warning:", e);
  }
}

/**
 * Retrieve cached files from storage
 */
export function getCachedVaultFiles() {
  try {
    const raw = localStorage.getItem(FILES_CACHE_KEY);
    if (!raw) return { files: [], courses: [], folderName: null };
    const data = JSON.parse(raw);
    return {
      files: data.files || [],
      courses: data.courses || [],
      folderName: data.folderName || 'school'
    };
  } catch {
    return { files: [], courses: [], folderName: null };
  }
}

/**
 * Retrieve directory handle from IndexedDB
 */
export async function getVaultHandle() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Remove stored vault handle & cache
 */
export async function clearVaultHandle() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
    localStorage.removeItem(VAULT_METADATA_KEY);
    localStorage.removeItem(FILES_CACHE_KEY);
  } catch (err) {
    console.warn("Clear handle notice:", err);
  }
}

/**
 * Verify / request permission for stored handle
 */
export async function verifyHandlePermission(handle, readWrite = false) {
  if (!handle) return false;
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  try {
    if (handle.queryPermission) {
      const status = await handle.queryPermission(options);
      if (status === 'granted') return true;
    }
    if (handle.requestPermission) {
      const status = await handle.requestPermission(options);
      if (status === 'granted') return true;
    }
  } catch (e) {
    console.warn("Permission query notice:", e);
  }
  return false;
}

/**
 * Prompt user to select their Obsidian Vault or School folder
 */
export async function connectObsidianVault() {
  if (typeof window === 'undefined' || !window.showDirectoryPicker) {
    throw new Error("Your browser does not support the File System Access API. Please use the folder selector below.");
  }

  const handle = await window.showDirectoryPicker({
    mode: 'read',
    startIn: 'documents'
  });

  await saveVaultHandle(handle);
  const scanned = await scanVaultDirectory(handle);
  
  const meta = {
    connected: true,
    folderName: handle.name,
    totalNotes: scanned.files.length,
    courses: scanned.courses,
    lastScanned: new Date().toISOString()
  };
  localStorage.setItem(VAULT_METADATA_KEY, JSON.stringify(meta));
  await saveCachedVaultFiles(scanned.files, scanned.courses, handle.name);

  return { handle, ...scanned };
}

/**
 * Extract course tag from any nested subfolder path (e.g. school/FNCE 317/Quizzes/Lecture.md -> FNCE 317)
 */
export function extractCourseFromPath(filePath) {
  if (!filePath) return 'Course Material';
  const parts = filePath.split('/');
  
  // 1. Check if any path segment matches university course code patterns (e.g. FNCE 317, PSYC 203)
  for (const part of parts) {
    const p = part.toLowerCase();
    if (p === 'school' || p === 'quizzes' || p.endsWith('.pdf') || p.endsWith('.md')) continue;
    const match = part.match(/([A-Z]{2,6}\s*\d{2,4})/i);
    if (match) return match[1].toUpperCase().replace(/\s+/, ' ').trim();
  }

  // 2. If under school/ (e.g. school/FNCE 317/Quizzes/doc.md -> parts[1])
  if (parts.length >= 2) {
    const schoolIdx = parts.findIndex(p => p.toLowerCase() === 'school');
    if (schoolIdx !== -1 && parts.length > schoolIdx + 1) {
      const candidate = parts[schoolIdx + 1];
      if (candidate && !candidate.includes('.') && candidate.toLowerCase() !== 'quizzes') return candidate.trim();
    } else if (parts.length > 1 && !parts[0].includes('.') && parts[0].toLowerCase() !== 'quizzes') {
      return parts[0].trim();
    }
  }

  // 3. Regex fallback
  const fullMatch = filePath.match(/([A-Z]{2,6}\s*\d{2,4})/i);
  if (fullMatch) return fullMatch[1].toUpperCase().trim();

  return 'Course Material';
}

/**
 * Universal HTML5 FileList processor for folder selection (works across ALL browsers & mobile)
 */
export async function processUploadedFolderFiles(fileList) {
  if (!fileList || fileList.length === 0) return { files: [], courses: [] };

  const files = [];
  const coursesSet = new Set();

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const rawPath = file.webkitRelativePath || file.name;
    
    // Skip hidden files (.obsidian, .git, .DS_Store)
    if (rawPath.split('/').some(part => part.startsWith('.'))) continue;

    const lowerName = file.name.toLowerCase();
    const isDoc = lowerName.endsWith('.md') || lowerName.endsWith('.pdf') || lowerName.endsWith('.txt') || 
                  lowerName.endsWith('.docx') || lowerName.endsWith('.doc') || lowerName.endsWith('.canvas') || 
                  lowerName.endsWith('.csv') || lowerName.endsWith('.html') || lowerName.endsWith('.rtf') || 
                  !file.name.includes('.');

    if (!isDoc) continue;

    const detectedCourse = extractCourseFromPath(rawPath);
    if (detectedCourse && detectedCourse !== 'Course Material') coursesSet.add(detectedCourse);

    let cachedText = '';
    try {
      cachedText = await extractTextFromFile(file);
    } catch {}

    files.push({
      name: file.name,
      path: rawPath,
      extension: file.name.split('.').pop().toLowerCase(),
      course: detectedCourse || 'Course Material',
      fileObject: file,
      size: file.size,
      cachedContent: cachedText
    });
  }

  const courses = Array.from(coursesSet);
  const meta = {
    connected: true,
    folderName: files[0]?.path.split('/')[0] || 'school',
    totalNotes: files.length,
    courses,
    lastScanned: new Date().toISOString()
  };
  localStorage.setItem(VAULT_METADATA_KEY, JSON.stringify(meta));
  await saveCachedVaultFiles(files, courses, meta.folderName);

  return { files, courses };
}

/**
 * Recursively scan directory handle for notes, outlines & PDFs
 */
export async function scanVaultDirectory(dirHandle, pathPrefix = '') {
  const files = [];
  const coursesSet = new Set();

  async function traverse(currentHandle, currentPath) {
    let entriesIterable = null;
    try {
      if (typeof currentHandle.values === 'function') {
        entriesIterable = currentHandle.values();
      } else if (typeof currentHandle.entries === 'function') {
        entriesIterable = (async function* () {
          for await (const [, entry] of currentHandle.entries()) {
            yield entry;
          }
        })();
      }
    } catch (e) {
      console.warn("Could not get entries iterable:", e);
      return;
    }

    if (!entriesIterable) return;

    for await (const entry of entriesIterable) {
      const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      
      // Skip hidden folders (.obsidian, .trash, .git, etc.)
      if (entry.name.startsWith('.')) continue;

      if (entry.kind === 'directory') {
        // Detect course folder name
        const folderName = entry.name.trim();
        if (folderName.toLowerCase() !== 'school') {
          coursesSet.add(folderName);
        }
        await traverse(entry, entryPath);
      } else if (entry.kind === 'file') {
        const lowerName = entry.name.toLowerCase();
        // Support any study file format
        const isDoc = lowerName.endsWith('.md') || lowerName.endsWith('.txt') || lowerName.endsWith('.pdf') || 
                      lowerName.endsWith('.docx') || lowerName.endsWith('.doc') || lowerName.endsWith('.canvas') || 
                      lowerName.endsWith('.csv') || lowerName.endsWith('.html') || lowerName.endsWith('.rtf') ||
                      !entry.name.includes('.');

        if (isDoc) {
          const detectedCourse = extractCourseFromPath(entryPath);
          if (detectedCourse && detectedCourse !== 'Course Material') coursesSet.add(detectedCourse);

          let cachedContent = '';
          try {
            const fileObj = await entry.getFile();
            cachedContent = await extractTextFromFile(fileObj);
          } catch {}

          files.push({
            name: entry.name,
            path: entryPath,
            extension: entry.name.split('.').pop().toLowerCase(),
            course: detectedCourse || 'Course Material',
            handle: entry,
            cachedContent
          });
        }
      }
    }
  }

  try {
    await traverse(dirHandle, pathPrefix);
  } catch (err) {
    console.warn("Vault scan error:", err);
  }

  const courses = Array.from(coursesSet);
  return {
    files,
    courses
  };
}

/**
 * Extract instructor name, email, section, and course code from outline / syllabus text
 */
export function extractInstructorFromOutline(text) {
  if (!text) return { name: '', email: '', section: '', course: '' };
  
  // 1. Course Code
  const courseMatch = text.match(/([A-Z]{2,6}\s*\d{3,4})/i);
  const course = courseMatch ? courseMatch[1].toUpperCase() : '';

  // 2. Email extraction (prefer university emails like .edu or .ca)
  const emails = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
  const instructorEmail = emails.find(e => !e.includes('example') && !e.includes('placeholder')) || emails[0] || '';

  // 3. Instructor / Professor Name extraction
  let instructorName = '';
  const profMatch = text.match(/(?:Instructor|Professor|Prof\.|Dr\.)\s*:?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})(?:\s*[\r\n]|\s*[,;\-]|\s*Email|\s*Office|$)/i);
  if (profMatch) {
    instructorName = profMatch[1].trim();
  } else {
    const drMatch = text.match(/Dr\.\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})/i);
    if (drMatch) instructorName = `Dr. ${drMatch[1].trim()}`;
  }

  // 4. Section extraction
  let section = '';
  const secMatch = text.match(/\b(L\d{2}|LEC\s*\d{1,2}|Section\s*\d{1,2})\b/i);
  if (secMatch) {
    section = secMatch[1].toUpperCase().trim();
  }

  return {
    course,
    name: instructorName,
    email: instructorEmail,
    section: section || 'L01'
  };
}

/**
 * Search scanned files for a course outline matching a target course keyword (e.g. "FNCE", "BTMA", "OPMA")
 */
export async function findCourseOutlineContent(scannedFiles = [], courseQuery = "") {
  if (!scannedFiles || scannedFiles.length === 0 || !courseQuery) return null;
  const cleanQ = courseQuery.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Find file with matching course in path or filename
  const matchingFile = scannedFiles.find(f => {
    const p = (f.path || f.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return p.includes(cleanQ) && (p.includes('outline') || p.includes('syllabus') || p.includes('course') || f.name.endsWith('.pdf') || f.name.endsWith('.md'));
  }) || scannedFiles.find(f => {
    const p = (f.path || f.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return p.includes(cleanQ);
  });

  if (!matchingFile) return null;

  try {
    if (matchingFile.handle) {
      const content = await readVaultFileContent(matchingFile.handle);
      return {
        file: matchingFile,
        content,
        info: extractInstructorFromOutline(content)
      };
    }
  } catch (err) {
    console.warn("Could not read matching outline:", err);
  }

  return null;
}

/**
 * Read text content from a file or file handle
 */
export async function readVaultFileContent(fileOrHandle) {
  if (!fileOrHandle) return '';
  if (typeof fileOrHandle === 'string') return fileOrHandle;
  if (fileOrHandle.cachedContent) return fileOrHandle.cachedContent;
  
  try {
    if (fileOrHandle.fileObject) {
      return await extractTextFromFile(fileOrHandle.fileObject);
    }
    if (fileOrHandle.handle) {
      const fileObj = await fileOrHandle.handle.getFile();
      return await extractTextFromFile(fileObj);
    }
    if (fileOrHandle.getFile) {
      const fileObj = await fileOrHandle.getFile();
      return await extractTextFromFile(fileObj);
    }
    if (typeof File !== 'undefined' && fileOrHandle instanceof File) {
      return await extractTextFromFile(fileOrHandle);
    }
  } catch (err) {
    console.warn("Read file error:", err);
  }
  return fileOrHandle.cachedContent || '';
}

/**
 * Save a new or updated Markdown note into the Obsidian Vault
 */
export async function saveMarkdownToVault(dirHandle, subfolder, filename, content) {
  if (!dirHandle) throw new Error("No Obsidian vault connected.");
  const hasPermission = await verifyHandlePermission(dirHandle, true);
  if (!hasPermission) throw new Error("Permission to write to Obsidian vault was not granted.");

  let targetDir = dirHandle;
  if (subfolder && subfolder !== '.') {
    const parts = subfolder.split('/').filter(Boolean);
    for (const part of parts) {
      targetDir = await targetDir.getDirectoryHandle(part, { create: true });
    }
  }

  const cleanFilename = filename.endsWith('.md') ? filename : `${filename}.md`;
  const fileHandle = await targetDir.getFileHandle(cleanFilename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();

  return { success: true, path: subfolder ? `${subfolder}/${cleanFilename}` : cleanFilename };
}

/**
 * Get current connected vault metadata
 */
export function getVaultMetadata() {
  try {
    const meta = localStorage.getItem(VAULT_METADATA_KEY);
    return meta ? JSON.parse(meta) : { connected: false, folderName: null, totalNotes: 0, courses: [] };
  } catch {
    return { connected: false, folderName: null, totalNotes: 0, courses: [] };
  }
}

/**
 * Export quiz results or in-progress quizzes as formatted Markdown notes into Obsidian Vault
 */
export async function saveQuizToObsidian(quiz) {
  try {
    const handle = await getVaultHandle();
    if (!handle) return false;

    const rootName = (handle.name || '').toLowerCase();
    const isSchoolFolder = rootName === 'school';

    let courseFolder = 'General';
    if (quiz.courseCode) {
      const match = quiz.courseCode.toUpperCase().match(/([A-Z]{2,6}\s*\d{2,4})/);
      if (match) {
        courseFolder = match[1].trim();
      } else {
        courseFolder = quiz.courseCode.replace(/[^A-Za-z0-9\s]/g, '').trim() || 'General';
      }
    }

    // Save directly into {Course}/Quizzes
    const subfolder = isSchoolFolder ? `${courseFolder}/Quizzes` : `School/${courseFolder}/Quizzes`;
    const cleanDate = new Date(quiz.completedAt || quiz.lastUpdated || Date.now()).toISOString().split('T')[0];
    const safeTitle = (quiz.topic || quiz.title || 'Practice Quiz').replace(/[^a-zA-Z0-9\s-_]/g, '').trim() || 'Quiz';
    const filename = `${safeTitle} Quiz (${cleanDate})`;

    const scoreLine = quiz.isInProgress 
      ? `**Status:** In Progress (${quiz.userAnswers ? quiz.userAnswers.filter(a => a !== null && a !== undefined).length : 0}/${quiz.questions?.length || 0} Answered)` 
      : `**Score:** ${quiz.score || 0}/${quiz.questions?.length || 0} (${Math.round(((quiz.score || 0) / (quiz.questions?.length || 1)) * 100)}%)`;

    let md = `# 📝 ${quiz.courseCode || 'Course'}: ${quiz.topic || quiz.title || 'Practice Exam'}\n\n`;
    md += `- **Date:** ${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })}\n`;
    md += `- ${scoreLine}\n`;
    md += `- **Mode:** ${quiz.depthMode || 'Exam Prep'}\n\n`;
    md += `---\n\n## Questions & Detailed Solutions\n\n`;

    (quiz.questions || []).forEach((q, idx) => {
      const userChoice = quiz.userAnswers?.[idx];
      const isCorrect = userChoice === q.correctIndex;
      const statusIcon = userChoice === undefined ? '⚪' : (isCorrect ? '✅' : '❌');
      
      md += `### ${idx + 1}. ${q.question}\n\n`;
      (q.options || []).forEach((opt, optIdx) => {
        const isSelected = userChoice === optIdx;
        const isRight = q.correctIndex === optIdx;
        let prefix = '- [ ]';
        if (isRight) prefix = '- [x] 🟢';
        else if (isSelected && !isRight) prefix = '- [x] 🔴';
        md += `${prefix} ${opt}\n`;
      });
      md += `\n> **Result:** ${statusIcon} ${userChoice !== undefined ? (isCorrect ? 'Correct' : 'Incorrect') : 'Unanswered'}\n`;
      if (q.explanation) {
        md += `> **Explanation:** ${q.explanation}\n`;
      }
      md += `\n---\n\n`;
    });

    await saveMarkdownToVault(handle, subfolder, filename, md);
    return true;
  } catch (err) {
    console.warn("Could not export quiz to Obsidian:", err);
    return false;
  }
}

/**
 * Vault sample notes (empty until user connects their personal Obsidian vault)
 */
export const SAMPLE_OBSIDIAN_VAULT = [];


