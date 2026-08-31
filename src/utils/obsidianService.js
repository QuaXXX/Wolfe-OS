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
 * Fallback Sample Notes for instant testing before user links folder
 */
export const SAMPLE_OBSIDIAN_VAULT = [
  {
    name: "FNCE 317 - Capital Budgeting & NPV.md",
    path: "FNCE 317/FNCE 317 - Capital Budgeting & NPV.md",
    course: "FNCE 317",
    content: `# FNCE 317: Capital Budgeting & NPV Decision Rules
**Instructor**: Dr. Marcus Vance | **Term**: Fall 2026

## 1. Net Present Value (NPV)
- **Formula**: $$NPV = \\sum_{t=1}^T \\frac{CF_t}{(1 + r)^t} - CF_0$$
- **Rule**: Accept project if $NPV > 0$. NPV represents value added directly to firm equity.
- **Why NPV is Superior**: Accounts for time value of money, considers all cash flows, and does not depend on arbitrary hurdle rates.

## 2. Internal Rate of Return (IRR)
- The discount rate $r$ that sets $NPV = 0$.
- **Pitfalls of IRR**:
  1. Multiple IRRs when cash flows alternate signs (non-conventional).
  2. Scale problem: High IRR on $10 investment vs. Lower IRR on $1,000,000 investment.
  3. Mutually exclusive projects: IRR can choose sub-optimal project. Use **Incremental IRR** or NPV!

## 3. Weighted Average Cost of Capital (WACC)
- $$WACC = \\frac{E}{V}r_e + \\frac{D}{V}r_d(1 - T_c)$$
- Used as the standard discount rate for average-risk projects.`
  },
  {
    name: "MKTG 317 - STP Framework & Consumer Insights.md",
    path: "MKTG 317/MKTG 317 - STP Framework & Consumer Insights.md",
    course: "MKTG 317",
    content: `# MKTG 317: STP Framework & Market Strategy
**Instructor**: Prof. A. Dupuis | **Term**: Fall 2026

## Segmentation, Targeting & Positioning (STP)
1. **Segmentation**: Dividing market into distinct groups based on:
   - Demographic (Age, income, education)
   - Psychographic (Lifestyle, values, personality)
   - Behavioral (Usage rate, brand loyalty, benefits sought)
2. **Targeting**: Evaluating segment attractiveness (Market size, growth, competition) and selecting target segments.
3. **Positioning**: Designing company offering and image to occupy a distinctive place in customer mind.
   - **Formula**: For [Target Market], [Brand] is the [Category] that [Key Benefit/Point of Difference] because [Reason to Believe].`
  },
  {
    name: "CPSC 331 - Tree Traversals & Balanced BSTs.md",
    path: "CPSC 331/CPSC 331 - Tree Traversals & Balanced BSTs.md",
    course: "CPSC 331",
    content: `# CPSC 331: Trees, AVL Trees & Red-Black Trees
**Instructor**: Dr. Elena Rostova

## Tree Traversals
- **Pre-Order** (Root, Left, Right): Useful for cloning/serializing trees.
- **In-Order** (Left, Root, Right): Produces sorted sequence in Binary Search Trees (BST).
- **Post-Order** (Left, Right, Root): Useful for deleting trees or calculating directory sizes.

## Balanced Trees (AVL & Red-Black)
- Standard BST worst-case lookup: $O(n)$ if inserted in sorted order (degenerate linked list).
- **AVL Tree**: Balance factor between -1, 0, +1. Strict height balancing gives guaranteed $O(\\log n)$ search, insert, and delete.`
  }
];
