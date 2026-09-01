/**
 * IndexedDB storage utility for caching user-uploaded study audio (MP3/WAV/M4A)
 * Persists across browser sessions without consuming localStorage limits.
 */

const DB_NAME = 'wolfe_os_audio_db';
const DB_VERSION = 1;
const STORE_NAME = 'audio_tracks';

function openAudioDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save an audio file (Blob/File) to IndexedDB
 */
export async function saveAudioTrack(file) {
  try {
    const db = await openAudioDB();
    const id = `track_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const track = {
      id,
      name: file.name.replace(/\.[^/.]+$/, ''),
      fileName: file.name,
      type: file.type || 'audio/mpeg',
      size: file.size,
      blob: file,
      createdAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.add(track);

      req.onsuccess = () => resolve({ id: track.id, name: track.name, fileName: track.fileName });
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to save audio track:", err);
    throw err;
  }
}

/**
 * Get all saved audio tracks metadata
 */
export async function getAllAudioTracks() {
  try {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const tracks = (req.result || []).map(t => ({
          id: t.id,
          name: t.name,
          fileName: t.fileName,
          type: t.type,
          size: t.size,
          createdAt: t.createdAt
        }));
        resolve(tracks);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to list audio tracks:", err);
    return [];
  }
}

/**
 * Get an audio track blob URL for playback
 */
export async function getAudioTrackUrl(id) {
  try {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          const url = URL.createObjectURL(req.result.blob);
          resolve(url);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to load audio track blob:", err);
    return null;
  }
}

/**
 * Delete an audio track from IndexedDB
 */
export async function deleteAudioTrack(id) {
  try {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to delete audio track:", err);
    return false;
  }
}
