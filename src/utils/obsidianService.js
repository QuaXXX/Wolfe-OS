/**
 * Obsidian Vault & Local Markdown File Integration Service
 * Uses native File System Access API (showDirectoryPicker) and IndexedDB handle persistence
 */

import { extractTextFromFile } from './documentParser.js';

const DB_NAME = 'wolfe_os_vault_db';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'obsidian_dir_handle';
const VAULT_METADATA_KEY = 'wolfe_obsidian_vault_meta';

// Helper to open IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error("IndexedDB is not supported"));
    }
    const request = indexedDB.open(DB_NAME, 1);
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
 * Remove stored vault handle
 */
export async function clearVaultHandle() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
    localStorage.removeItem(VAULT_METADATA_KEY);
  } catch (err) {
    console.warn("Clear handle notice:", err);
  }
}

/**
 * Verify / request permission for stored handle
 */
export async function verifyHandlePermission(handle, readWrite = true) {
  if (!handle) return false;
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  try {
    if ((await handle.queryPermission(options)) === 'granted') {
      return true;
    }
    if ((await handle.requestPermission(options)) === 'granted') {
      return true;
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
    throw new Error("Your browser does not support the File System Access API. Please use Chrome, Edge, or Brave.");
  }

  const handle = await window.showDirectoryPicker({
    mode: 'readwrite',
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

  return { handle, ...scanned };
}

/**
 * Recursively scan directory handle for .md, .txt, .pdf files
 */
export async function scanVaultDirectory(dirHandle, pathPrefix = '') {
  const files = [];
  const coursesSet = new Set();

  async function traverse(currentHandle, currentPath) {
    for await (const entry of currentHandle.values()) {
      const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      
      // Skip hidden folders (.obsidian, .trash, .git, etc.)
      if (entry.name.startsWith('.')) continue;

      if (entry.kind === 'directory') {
        await traverse(entry, entryPath);
      } else if (entry.kind === 'file') {
        const lowerName = entry.name.toLowerCase();
        if (lowerName.endsWith('.md') || lowerName.endsWith('.txt') || lowerName.endsWith('.pdf')) {
          // Detect course codes from filename or path (e.g. CPSC 331, MATH 211, PSYC 203)
          const courseMatch = entryPath.match(/([A-Z]{2,6}\s*\d{3,4})/i);
          const detectedCourse = courseMatch ? courseMatch[1].toUpperCase() : null;
          if (detectedCourse) coursesSet.add(detectedCourse);

          files.push({
            name: entry.name,
            path: entryPath,
            extension: entry.name.split('.').pop().toLowerCase(),
            course: detectedCourse,
            handle: entry
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

  return {
    files,
    courses: Array.from(coursesSet)
  };
}

/**
 * Read text content from a file handle
 */
export async function readVaultFileContent(fileHandle) {
  if (!fileHandle) return '';
  try {
    const file = await fileHandle.getFile();
    return await extractTextFromFile(file);
  } catch (err) {
    console.warn("Read file error:", err);
    return '';
  }
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
 * Vault sample notes (empty until user connects their personal Obsidian vault)
 */
export const SAMPLE_OBSIDIAN_VAULT = [];

