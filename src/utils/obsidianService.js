/**
 * Obsidian Vault & Local Markdown File Integration Service
 * Uses native File System Access API (showDirectoryPicker) and IndexedDB handle persistence
 */

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
          // Detect course codes from filename or path (e.g. FNCE 317, MKTG 317, CS 301)
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
    if (file.name.toLowerCase().endsWith('.pdf')) {
      return `[PDF File: ${file.name} (${Math.round(file.size / 1024)} KB)]`;
    }
    return await file.text();
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
 * Vault sample notes (empty until user connects their personal Obsidian vault)
 */
export const SAMPLE_OBSIDIAN_VAULT = [];
