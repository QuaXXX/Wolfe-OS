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
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const p = part.toLowerCase();
    if (p === 'school' || p === 'quizzes') continue;
    const match = part.match(/([A-Z]{2,6})\s*(\d{2,4})/i);
    if (match) return `${match[1].toUpperCase()} ${match[2]}`.trim();
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
  const fullMatch = filePath.match(/([A-Z]{2,6})\s*(\d{2,4})/i);
  if (fullMatch) return `${fullMatch[1].toUpperCase()} ${fullMatch[2]}`.trim();

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
                  lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt') ||
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
                      lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt') ||
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
 * Find all files belonging to a specific course (lecture notes, slides, PowerPoints, outlines, PDFs)
 */
export function getCourseFiles(courseCode, scannedFiles = null) {
  const files = scannedFiles || (getCachedVaultFiles()?.files || []);
  if (!files || files.length === 0 || !courseCode) return [];
  const target = courseCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Synonyms map (e.g. FNCE 317 <-> Finance 317)
  const synonyms = [target];
  if (target.includes('FNCE')) synonyms.push(target.replace('FNCE', 'FINANCE'));
  if (target.includes('FINANCE')) synonyms.push(target.replace('FINANCE', 'FNCE'));
  if (target.includes('BTMA')) synonyms.push(target.replace('BTMA', 'IT'), target.replace('BTMA', 'TECH'));
  if (target.includes('OPMA')) synonyms.push(target.replace('OPMA', 'OPERATIONS'));
  if (target.includes('MKTG')) synonyms.push(target.replace('MKTG', 'MARKETING'));
  if (target.includes('PSYC')) synonyms.push(target.replace('PSYC', 'PSYCHOLOGY'), target.replace('PSYC', 'PSYCH'));

  return files.filter(f => {
    const c = (f.course || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const p = (f.path || f.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return synonyms.some(s => c.includes(s) || s.includes(c) || p.includes(s));
  });
}

/**
 * Extract formatted sources metadata for a course
 */
export function getCourseSourcesMetadata(courseCode, scannedFiles = null) {
  const files = getCourseFiles(courseCode, scannedFiles);
  return files.map(f => {
    const name = f.name || '';
    const lowerName = name.toLowerCase();
    const ext = (f.extension || (name.includes('.') ? name.split('.').pop() : '')).toLowerCase();
    const isSlides = ext.includes('ppt') || lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt');
    const isPdf = ext.includes('pdf') || lowerName.endsWith('.pdf');
    const isOutline = lowerName.includes('outline') || lowerName.includes('syllabus');

    const text = f.cachedContent || f.content || '';
    const slideMatches = text.match(/(?:===|---) Slide \d+ (?:===|---)/g);
    const slideCount = slideMatches ? slideMatches.length : null;

    let type = 'note';
    if (isSlides) type = 'pptx';
    else if (isPdf) type = 'pdf';

    return {
      name,
      path: f.path || name,
      extension: ext,
      type,
      isSlides,
      isPdf,
      isOutline,
      slideCount,
      size: f.size || 0
    };
  });
}

/**
 * Aggregates all course documents (PowerPoint slides, lecture notes, study guides, outlines)
 * into a rich, comprehensive context block for AI quiz, flashcard, and cheat sheet generation.
 * Prioritizes actual lecture content and slides over syllabus metadata.
 */
export async function getCombinedCourseNotes(courseCode, scannedFiles = null, maxTotalChars = 40000) {
  const courseFiles = getCourseFiles(courseCode, scannedFiles);
  if (!courseFiles || courseFiles.length === 0) return '';

  // Sort files so that lecture notes, slides, and PowerPoints appear first, followed by outlines
  const sortedFiles = [...courseFiles].sort((a, b) => {
    const aName = (a.name || a.path || '').toLowerCase();
    const bName = (b.name || b.path || '').toLowerCase();
    const aIsOutline = aName.includes('outline') || aName.includes('syllabus');
    const bIsOutline = bName.includes('outline') || bName.includes('syllabus');
    const aIsSlides = aName.endsWith('.pptx') || aName.endsWith('.ppt') || aName.includes('slide') || aName.includes('lecture') || aName.includes('powerpoint');
    const bIsSlides = bName.endsWith('.pptx') || bName.endsWith('.ppt') || bName.includes('slide') || bName.includes('lecture') || bName.includes('powerpoint');

    if (aIsSlides && !bIsSlides) return -1;
    if (!aIsSlides && bIsSlides) return 1;
    if (aIsOutline && !bIsOutline) return 1;
    if (!aIsOutline && bIsOutline) return -1;
    return 0;
  });

  let combined = '';
  for (const file of sortedFiles) {
    let content = file.cachedContent || '';
    if (!content) {
      try {
        content = await readVaultFileContent(file);
      } catch {}
    }
    if (content && content.trim().length > 10) {
      const isPptx = (file.name || '').toLowerCase().endsWith('.pptx') || (file.name || '').toLowerCase().endsWith('.ppt');
      const docType = isPptx ? 'PowerPoint Lecture Slides' : (file.name?.toLowerCase().endsWith('.pdf') ? 'PDF Document' : 'Notes');
      const header = `\n\n=== [Document: ${file.name}] (Type: ${docType}) ===\n`;
      const added = header + content.trim();
      if (combined.length + added.length > maxTotalChars) {
        const remaining = maxTotalChars - combined.length;
        if (remaining > 200) {
          combined += added.slice(0, remaining) + '\n... [truncated]';
        }
        break;
      } else {
        combined += added;
      }
    }
  }

  return combined.trim();
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
 * Save any dropped raw File object (PDF, DOCX, TXT, MD, images, etc.) into a target subfolder in Obsidian Vault
 */
export async function saveFileObjectToVault(dirHandle, subfolder, fileObj) {
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

  const fileHandle = await targetDir.getFileHandle(fileObj.name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(fileObj);
  await writable.close();

  return { success: true, path: subfolder ? `${subfolder}/${fileObj.name}` : fileObj.name, name: fileObj.name };
}

/**
 * Intelligent file classifier for university study notes
 * Analyzes filename and extracted content against known course scopes
 */
export function classifyStudyFile(file, extractedText = '') {
  const name = (file?.name || '').toLowerCase();
  const text = (extractedText || '').toLowerCase();
  const combined = `${name} ${text}`;

  const scores = {
    'FNCE 317': 0,
    'BTMA 317': 0,
    'OPMA 317': 0,
    'MKTG 317': 0,
    'PSYC 203': 0,
  };

  // FNCE 317 keywords
  if (name.includes('fnce') || name.includes('finance')) scores['FNCE 317'] += 10;
  if (text.includes('fnce 317') || text.includes('financial management')) scores['FNCE 317'] += 10;
  ['wacc', 'capm', 'npv', 'irr', 'bond', 'dividend', 'perrot', 'holloway', 'cash flow', 'amortization', 'time value of money', 'cost of capital', 'beta', 'portfolio'].forEach(kw => {
    if (combined.includes(kw)) scores['FNCE 317'] += 2;
  });

  // BTMA 317 keywords
  if (name.includes('btma') || name.includes('it_') || name.includes('tech')) scores['BTMA 317'] += 10;
  if (text.includes('btma 317') || text.includes('business technology')) scores['BTMA 317'] += 10;
  ['power bi', 'sql', 'database', 'datacamp', 'michael saar', 'duy dao', 'relational', 'queries', 'cloud', 'cybersecurity', 'enterprise systems', 'erp', 'crm'].forEach(kw => {
    if (combined.includes(kw)) scores['BTMA 317'] += 2;
  });

  // OPMA 317 keywords
  if (name.includes('opma') || name.includes('operations') || name.includes('supply_chain')) scores['OPMA 317'] += 10;
  if (text.includes('opma 317') || text.includes('operations management')) scores['OPMA 317'] += 10;
  ['inventory', 'supply chain', 'eoq', 'lean', 'six sigma', 'bottleneck', 'sabouri', 'capacity', 'forecasting', 'kanban', 'jit', 'process analysis', 'little\'s law'].forEach(kw => {
    if (combined.includes(kw)) scores['OPMA 317'] += 2;
  });

  // MKTG 317 keywords
  if (name.includes('mktg') || name.includes('marketing')) scores['MKTG 317'] += 10;
  if (text.includes('mktg 317') || text.includes('principles of marketing') || text.includes('foundations of marketing')) scores['MKTG 317'] += 10;
  ['qiao liu', 'kulchitsky', 'consumer behavior', 'segmentation', 'targeting', 'positioning', '4p', 'product', 'promotion', 'pricing', 'distribution', 'brand', 'swot'].forEach(kw => {
    if (combined.includes(kw)) scores['MKTG 317'] += 2;
  });

  // PSYC 203 keywords
  if (name.includes('psyc') || name.includes('psychology')) scores['PSYC 203'] += 10;
  if (text.includes('psyc 203') || text.includes('psychology for everyday')) scores['PSYC 203'] += 10;
  ['kertesz', 'mental health', 'resilience', 'coping', 'identity development', 'interpersonal', 'counseling', 'behavior', 'cognition', 'stress', 'wellness'].forEach(kw => {
    if (combined.includes(kw)) scores['PSYC 203'] += 2;
  });

  let bestCourse = null;
  let highestScore = 0;
  for (const [course, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score;
      bestCourse = course;
    }
  }

  // If score is confident (>= 4), auto-classify; otherwise return null to trigger manual selection popup
  if (highestScore >= 4 && bestCourse) {
    return { courseCode: bestCourse, confidence: 'high', score: highestScore };
  }

  return { courseCode: null, confidence: 'low', score: highestScore };
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
 * Generates Obsidian-compatible YAML frontmatter properties
 */
export function generateYamlFrontmatter(fields = {}) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${k}: []`);
      } else {
        const formatted = v.map(item => {
          const str = String(item).trim();
          if (str.startsWith('[[') && str.endsWith(']]')) {
            return `"${str}"`;
          }
          return `"${str.replace(/"/g, '\\"')}"`;
        });
        lines.push(`${k}: [${formatted.join(', ')}]`);
      }
    } else if (typeof v === 'boolean' || typeof v === 'number') {
      lines.push(`${k}: ${v}`);
    } else {
      lines.push(`${k}: "${String(v).replace(/"/g, '\\"')}"`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

/**
 * Builds standard obsidian:// deep link URI
 */
export function getObsidianUri(filePath, vaultName) {
  const vName = vaultName || getVaultMetadata()?.folderName || 'Vault';
  const cleanPath = (filePath || '').replace(/^\/+/, '').replace(/\.md$/, '');
  return `obsidian://open?vault=${encodeURIComponent(vName)}&file=${encodeURIComponent(cleanPath)}`;
}

/**
 * Trigger opening a file in Obsidian desktop or mobile app
 */
export function openInObsidianApp(filePath) {
  if (typeof window === 'undefined') return;
  const uri = getObsidianUri(filePath);
  window.open(uri, '_self');
}

/**
 * Helper to resolve consistent course folder and subfolder paths for Obsidian notes
 */
function resolveObsidianCoursePath(handle, courseCode, subCategory) {
  const rootName = (handle?.name || '').toLowerCase();
  const isSchoolFolder = rootName === 'school';

  let courseFolder = 'General';
  if (courseCode) {
    const match = courseCode.toUpperCase().match(/([A-Z]{2,6}\s*\d{2,4})/);
    if (match) {
      courseFolder = match[1].trim();
    } else {
      courseFolder = courseCode.replace(/[^A-Za-z0-9\s]/g, '').trim() || 'General';
    }
  }

  const subfolder = isSchoolFolder 
    ? (subCategory ? `${courseFolder}/${subCategory}` : courseFolder)
    : (subCategory ? `School/${courseFolder}/${subCategory}` : `School/${courseFolder}`);

  return { courseFolder, subfolder };
}

/**
 * Export quiz results or in-progress quizzes as formatted Markdown notes into Obsidian Vault
 */
export async function saveQuizToObsidian(quiz) {
  try {
    const handle = await getVaultHandle();
    if (!handle) return false;

    const { courseFolder, subfolder } = resolveObsidianCoursePath(handle, quiz.courseCode, 'Quizzes');
    const cleanDate = new Date(quiz.completedAt || quiz.lastUpdated || Date.now()).toISOString().split('T')[0];
    const safeTitle = (quiz.topic || quiz.title || 'Practice Quiz').replace(/[^a-zA-Z0-9\s-_]/g, '').trim() || 'Quiz';
    const filename = `${safeTitle} Quiz (${cleanDate})`;
    const answeredCount = quiz.userAnswers ? quiz.userAnswers.filter(a => a !== null && a !== undefined).length : 0;
    const totalQ = quiz.questions?.length || 0;
    const scoreVal = quiz.score || 0;
    const masteryPct = Math.round(((scoreVal) / (totalQ || 1)) * 100);

    const frontmatter = generateYamlFrontmatter({
      type: 'study/quiz',
      course: courseFolder,
      topic: safeTitle,
      date: cleanDate,
      score: scoreVal,
      total_questions: totalQ,
      mastery_percent: masteryPct,
      in_progress: !!quiz.isInProgress,
      mode: quiz.depthMode || 'Exam Prep',
      tags: ['school', 'quiz', courseFolder.toLowerCase().replace(/\s+/g, '-')],
      references: [`[[${courseFolder}]]`, `[[Daily/${cleanDate}]]`]
    });

    const scoreLine = quiz.isInProgress 
      ? `**Status:** In Progress (${answeredCount}/${totalQ} Answered)` 
      : `**Score:** ${scoreVal}/${totalQ} (${masteryPct}%)`;

    let md = `${frontmatter}\n\n`;
    md += `# 📝 [[${courseFolder}]]: ${quiz.topic || quiz.title || 'Practice Exam'}\n\n`;
    md += `- **Course Hub:** [[${courseFolder}]]\n`;
    md += `- **Date:** [[Daily/${cleanDate}|${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })}]]\n`;
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
 * Export Flashcard deck as a formatted Markdown study note into Obsidian Vault
 */
export async function saveDeckToObsidian(deck) {
  try {
    const handle = await getVaultHandle();
    if (!handle) return false;

    const { courseFolder, subfolder } = resolveObsidianCoursePath(handle, deck.courseCode, 'Flashcards');
    const cleanDate = new Date(deck.lastStudied || deck.updatedAt || Date.now()).toISOString().split('T')[0];
    const safeTitle = (deck.title || deck.topic || 'Flashcard Deck').replace(/[^a-zA-Z0-9\s-_]/g, '').trim() || 'Deck';
    const filename = `${safeTitle} (${cleanDate})`;
    const cardCount = deck.cards?.length || 0;
    const masteryPct = deck.masteryPercent || 0;

    const frontmatter = generateYamlFrontmatter({
      type: 'study/flashcards',
      course: courseFolder,
      topic: safeTitle,
      date: cleanDate,
      card_count: cardCount,
      mastery_percent: masteryPct,
      mode: deck.depthMode || 'Active Recall',
      tags: ['school', 'flashcards', 'flashcards-deck', courseFolder.toLowerCase().replace(/\s+/g, '-'), '#flashcards'],
      references: [`[[${courseFolder}]]`, `[[Daily/${cleanDate}]]`]
    });

    let md = `${frontmatter}\n\n`;
    md += `# 🃏 [[${courseFolder}]]: ${deck.title || deck.topic || 'Study Flashcards'}\n\n`;
    md += `- **Course Hub:** [[${courseFolder}]]\n`;
    md += `- **Date:** [[Daily/${cleanDate}|${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })}]]\n`;
    md += `- **Card Count:** ${cardCount}\n`;
    md += `- **Mastery:** ${masteryPct}%\n`;
    md += `- **Mode:** ${deck.depthMode || 'Active Recall'}\n\n`;
    md += `---\n\n## Flashcards\n\n`;

    (deck.cards || []).forEach((c, idx) => {
      md += `### Card ${idx + 1}: ${c.concept || 'Concept'}\n\n`;
      md += `**Q:** ${c.front}\n\n`;
      md += `**A:** ${c.back}\n\n`;
      // Dual-compatibility: standard reader view + Obsidian Spaced Repetition plugin (front::back)
      const cleanFront = (c.front || '').replace(/\r?\n+/g, ' ').trim();
      const cleanBack = (c.back || '').replace(/\r?\n+/g, ' ').trim();
      md += `<!-- srs-card: ${cleanFront} :: ${cleanBack} -->\n\n`;
      if (c.yieldReason) {
        md += `> 💡 *Exam Note:* ${c.yieldReason}\n\n`;
      }
      md += `---\n\n`;
    });

    await saveMarkdownToVault(handle, subfolder, filename, md);
    return true;
  } catch (err) {
    console.warn("Could not export deck to Obsidian:", err);
    return false;
  }
}

/**
 * Export Exam Formula & Cheat Sheet as a formatted Markdown note into Obsidian Vault
 */
export async function saveCheatSheetToObsidian(sheet) {
  try {
    const handle = await getVaultHandle();
    if (!handle) return false;

    const { courseFolder, subfolder } = resolveObsidianCoursePath(handle, sheet.courseCode, 'Cheat Sheets');
    const cleanDate = new Date(sheet.updatedAt || Date.now()).toISOString().split('T')[0];
    const safeTitle = (sheet.title || 'Formula Sheet').replace(/[^a-zA-Z0-9\s-_]/g, '').trim() || 'Cheat Sheet';
    const filename = `${safeTitle} (${cleanDate})`;

    const frontmatter = generateYamlFrontmatter({
      type: 'study/cheatsheet',
      course: courseFolder,
      title: safeTitle,
      date: cleanDate,
      scope: sheet.chapterScope || 'All Chapters',
      tags: ['school', 'cheatsheet', 'formulas', courseFolder.toLowerCase().replace(/\s+/g, '-')],
      references: [`[[${courseFolder}]]`, `[[Daily/${cleanDate}]]`]
    });

    let md = `${frontmatter}\n\n`;
    md += `# ⚡ [[${courseFolder}]]: ${sheet.title || 'Formula & Cheat Sheet'}\n\n`;
    md += `- **Course Hub:** [[${courseFolder}]]\n`;
    md += `- **Scope:** ${sheet.chapterScope || 'All Chapters'}\n`;
    md += `- **Generated:** [[Daily/${cleanDate}|${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })}]]\n\n`;
    md += `---\n\n`;

    (sheet.sections || []).forEach(sec => {
      md += `## 📌 ${sec.category}\n\n`;
      (sec.items || []).forEach(item => {
        if (item.formula) {
          md += `### 📐 ${item.name}\n\n`;
          md += `$$\\mathbf{${item.formula}}$$\n\n`;
          if (item.variables) md += `* **Variables:** ${item.variables}\n`;
          if (item.notes) md += `* **Exam Note:** ${item.notes}\n`;
        } else if (item.rule) {
          md += `### ⚖️ ${item.name || 'Decision Rule'}\n\n`;
          md += `> **Rule:** ${item.rule}\n\n`;
          if (item.notes) md += `* **Application:** ${item.notes}\n`;
        } else if (item.term) {
          md += `### 📖 ${item.term}\n\n`;
          md += `${item.definition}\n\n`;
        } else if (item.trap) {
          md += `### ⚠️ Trap: ${item.trap}\n\n`;
          md += `> **Fix / Key Rule:** ${item.correction}\n\n`;
        }
        md += `\n`;
      });
      md += `---\n\n`;
    });

    await saveMarkdownToVault(handle, subfolder, filename, md);
    return true;
  } catch (err) {
    console.warn("Could not export cheat sheet to Obsidian:", err);
    return false;
  }
}

/**
 * Export completed trade log into Obsidian Trading Journal
 */
export async function saveTradeToObsidian(trade) {
  try {
    const handle = await getVaultHandle();
    if (!handle) return false;

    const rootName = (handle.name || '').toLowerCase();
    const isSchoolFolder = rootName === 'school';
    const subfolder = isSchoolFolder ? `../Trading/Trades` : `Trading/Trades`;

    const cleanDate = new Date(trade.closedAt || trade.openedAt || Date.now()).toISOString().split('T')[0];
    const cleanTicker = (trade.ticker || 'TRADE').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanId = (trade.id || String(Date.now())).slice(-6);
    const filename = `${cleanDate}_${cleanTicker}_${trade.side || 'LONG'}_${cleanId}`;

    const pnl = Number(trade.pnlUSD || 0);
    const isWin = pnl >= 0;

    const frontmatter = generateYamlFrontmatter({
      type: 'trading/journal',
      ticker: cleanTicker,
      side: trade.side || 'LONG',
      entry_price: Number(trade.entryPrice || 0),
      exit_price: Number(trade.exitPrice || 0),
      size: Number(trade.size || 0),
      pnl_usd: pnl,
      return_percent: Number(trade.returnPct || 0),
      is_win: isWin,
      strategy: trade.strategy || 'Discretionary',
      date: cleanDate,
      tags: ['trading', 'journal', cleanTicker.toLowerCase(), isWin ? 'win' : 'loss', ...(trade.tags || []).map(t => t.toLowerCase().replace(/\s+/g, '-'))],
      references: [`[[Trading/Playbook]]`, `[[Daily/${cleanDate}]]`]
    });

    let md = `${frontmatter}\n\n`;
    md += `# 📈 [[Trading]]: ${cleanTicker} (${trade.side || 'LONG'}) — ${isWin ? '🟢 +$' : '🔴 -$'}${Math.abs(pnl).toFixed(2)}\n\n`;
    md += `- **Date:** [[Daily/${cleanDate}|${new Date(trade.closedAt || Date.now()).toLocaleDateString('en-US', { dateStyle: 'full' })}]]\n`;
    md += `- **Strategy:** ${trade.strategy || 'Discretionary'}\n`;
    md += `- **P&L:** $${pnl.toFixed(2)} (${trade.returnPct || 0}%)\n`;
    md += `- **Entry:** $${trade.entryPrice} ➔ **Exit:** $${trade.exitPrice}\n`;
    md += `- **Position Size:** ${trade.size}\n\n`;

    if (trade.tags && trade.tags.length > 0) {
      md += `### Execution Tags\n`;
      trade.tags.forEach(tag => {
        md += `- \`#${tag.replace(/\s+/g, '-')}\`\n`;
      });
      md += `\n`;
    }

    if (trade.notes) {
      md += `### Trader Notes\n${trade.notes}\n\n`;
    }

    if (trade.aiPostMortem) {
      md += `### 🧠 AI Coach Post-Mortem\n> ${trade.aiPostMortem.replace(/\n+/g, '\n> ')}\n\n`;
    }

    md += `---\n*Logged via Wolfe OS Networked Thought Architecture*\n`;

    await saveMarkdownToVault(handle, subfolder, filename, md);
    return true;
  } catch (err) {
    console.warn("Could not export trade to Obsidian:", err);
    return false;
  }
}

/**
 * Synchronize daily performance, tasks, nutrition, trades, and study to Obsidian Daily Note
 */
export async function syncDailySummaryToObsidian(summaryData = {}) {
  try {
    const handle = await getVaultHandle();
    if (!handle) return false;

    const rootName = (handle.name || '').toLowerCase();
    const isSchoolFolder = rootName === 'school';
    const subfolder = isSchoolFolder ? `../Daily` : `Daily`;

    const date = summaryData.date || new Date().toISOString().split('T')[0];
    const filename = `${date}`;

    const frontmatter = generateYamlFrontmatter({
      type: 'daily/summary',
      date: date,
      calories: summaryData.calories || 0,
      target_calories: summaryData.targetCalories || 0,
      protein_g: summaryData.protein || 0,
      tasks_completed: summaryData.tasksCompleted || 0,
      tasks_total: summaryData.tasksTotal || 0,
      study_sessions_count: summaryData.studySessions?.length || 0,
      trades_count: summaryData.trades?.length || 0,
      net_trading_pnl: summaryData.tradingPnl || 0,
      tags: ['daily', 'journal', 'summary']
    });

    let md = `${frontmatter}\n\n`;
    md += `# 📅 Daily Log: ${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { dateStyle: 'full' })}\n\n`;

    // 1. Tasks & Agenda
    if (summaryData.tasks && summaryData.tasks.length > 0) {
      md += `## ⚡ Tasks & Agenda\n\n`;
      summaryData.tasks.forEach(t => {
        const check = t.completed ? 'x' : ' ';
        md += `- [${check}] ${t.title || t.text} ${t.course ? `[[${t.course}]]` : ''}\n`;
      });
      md += `\n`;
    }

    // 2. Study & Academics
    if (summaryData.studySessions && summaryData.studySessions.length > 0) {
      md += `## 📚 Academics & Study Mastery\n\n`;
      summaryData.studySessions.forEach(s => {
        md += `- **[[${s.course || 'School'}]]**: ${s.topic || 'Review'} — ${s.type || 'Session'} (${s.score !== undefined ? `Score: ${s.score}%` : 'Completed'})\n`;
      });
      md += `\n`;
    }

    // 3. Trading Journal
    if (summaryData.trades && summaryData.trades.length > 0) {
      md += `## 📈 Trading Journal\n\n`;
      const netPnl = summaryData.trades.reduce((acc, tr) => acc + (Number(tr.pnlUSD) || 0), 0);
      md += `- **Net P&L:** ${netPnl >= 0 ? '🟢 +$' : '🔴 -$'}${Math.abs(netPnl).toFixed(2)}\n`;
      summaryData.trades.forEach(tr => {
        md += `- [[Trading/Trades/${date}_${tr.ticker}|${tr.ticker}]] (${tr.side}): ${tr.pnlUSD >= 0 ? '+' : ''}$${tr.pnlUSD}\n`;
      });
      md += `\n`;
    }

    // 4. Nutrition & Biofeedback
    if (summaryData.calories !== undefined) {
      md += `## 🥗 Nutrition & Fuel\n\n`;
      md += `- **Calories:** ${summaryData.calories} / ${summaryData.targetCalories || 2500} kcal\n`;
      if (summaryData.protein) md += `- **Protein:** ${summaryData.protein}g\n`;
      if (summaryData.carbs) md += `- **Carbs:** ${summaryData.carbs}g\n`;
      if (summaryData.fat) md += `- **Fat:** ${summaryData.fat}g\n`;
      md += `\n`;
    }

    md += `---\n*Generated by Wolfe OS Networked Thought Architecture*\n`;

    await saveMarkdownToVault(handle, subfolder, filename, md);
    return true;
  } catch (err) {
    console.warn("Could not sync daily note to Obsidian:", err);
    return false;
  }
}

/**
 * Generates an Obsidian Infinite Canvas (.canvas JSON) visual mind map
 */
export async function saveObsidianCanvasToVault(title, courseCode = 'General', nodes = [], edges = []) {
  try {
    const handle = await getVaultHandle();
    if (!handle) return false;

    const rootName = (handle.name || '').toLowerCase();
    const isSchoolFolder = rootName === 'school';
    const subfolder = isSchoolFolder ? `${courseCode}/Canvases` : `School/${courseCode}/Canvases`;
    const safeTitle = (title || 'MindMap').replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
    const filename = `${safeTitle}.canvas`;

    const canvasJson = {
      nodes: nodes.map((n, idx) => ({
        id: n.id || `node_${idx}`,
        x: n.x || (idx % 3) * 320,
        y: n.y || Math.floor(idx / 3) * 200,
        width: n.width || 280,
        height: n.height || 140,
        type: n.type || 'text',
        text: n.text || `# ${n.title || 'Concept'}\n\n${n.description || ''}`,
        color: n.color || '1'
      })),
      edges: edges.map((e, idx) => ({
        id: e.id || `edge_${idx}`,
        fromNode: e.fromNode,
        toNode: e.toNode,
        fromSide: e.fromSide || 'right',
        toSide: e.toSide || 'left',
        label: e.label || ''
      }))
    };

    const content = JSON.stringify(canvasJson, null, 2);
    let targetDir = handle;
    if (subfolder && subfolder !== '.') {
      const parts = subfolder.split('/').filter(Boolean);
      for (const part of parts) {
        targetDir = await targetDir.getDirectoryHandle(part, { create: true });
      }
    }

    const fileHandle = await targetDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();

    return { success: true, path: `${subfolder}/${filename}` };
  } catch (err) {
    console.warn("Could not save canvas to Obsidian:", err);
    return false;
  }
}

/**
 * Vault sample notes (empty until user connects their personal Obsidian vault)
 */
export const SAMPLE_OBSIDIAN_VAULT = [];



