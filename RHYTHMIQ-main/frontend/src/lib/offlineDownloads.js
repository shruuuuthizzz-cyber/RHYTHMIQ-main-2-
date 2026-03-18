const DB_NAME = 'rhythmiq-offline-downloads';
const STORE_NAME = 'downloads';
const DB_VERSION = 1;
export const OFFLINE_DOWNLOADS_UPDATED_EVENT = 'rhythmiq-offline-downloads-updated';

const normalizeText = (value) => (value || '').toString().trim().toLowerCase();

export const getOfflineDownloadId = (track) => {
  if (!track) {
    return null;
  }

  const primaryId = track.id || track.spotify_track_id || track.youtube_video_id;
  if (primaryId) {
    return primaryId;
  }

  const trackName = normalizeText(track.name || track.track_name);
  const artistName = normalizeText(track.artists?.map((artist) => artist.name).join(', ') || track.artist_name);

  if (!trackName) {
    return null;
  }

  return `offline:${trackName}:${artistName}`;
};

const notifyOfflineDownloadsChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_DOWNLOADS_UPDATED_EVENT));
  }
};

const openDatabase = () => new Promise((resolve, reject) => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    reject(new Error('Offline downloads are not supported in this browser.'));
    return;
  }

  const request = window.indexedDB.open(DB_NAME, DB_VERSION);

  request.onerror = () => reject(request.error || new Error('Failed to open offline downloads database.'));
  request.onsuccess = () => resolve(request.result);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('downloaded_at', 'downloaded_at');
    }
  };
});

const runTransaction = async (mode, executor) => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Offline download transaction failed.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('Offline download transaction was aborted.'));
    };

    executor(store, resolve, reject);
  });
};

export const saveOfflineDownload = async ({ track, audioBlob, filename, contentType }) => {
  if (!track || !(audioBlob instanceof Blob)) {
    throw new Error('A valid track and audio file are required for offline download.');
  }

  const record = {
    id: getOfflineDownloadId(track) || `offline-${Date.now()}`,
    spotify_track_id: track.id || track.spotify_track_id || null,
    track_name: track.name || track.track_name || 'Unknown Track',
    artist_name: track.artists?.map((artist) => artist.name).join(', ') || track.artist_name || 'Unknown Artist',
    album_name: track.album?.name || track.album_name || '',
    album_image: track.album?.images?.[0]?.url || track.album_image || '',
    duration_ms: track.duration_ms || null,
    filename: filename || `${track.name || track.track_name || 'RHYTHMIQ Track'}.mp3`,
    mime_type: contentType || audioBlob.type || 'audio/mpeg',
    file_size: audioBlob.size || 0,
    downloaded_at: new Date().toISOString(),
    storage_location: 'Library > Downloaded Songs',
    youtube_video_id: track.youtube_video_id || null,
    audio_blob: audioBlob,
  };

  await runTransaction('readwrite', (store) => {
    store.put(record);
  });
  notifyOfflineDownloadsChanged();

  return record;
};

export const listOfflineDownloads = async () => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => {
      database.close();
      reject(request.error || new Error('Failed to read offline downloads.'));
    };

    request.onsuccess = () => {
      database.close();
      const records = request.result || [];
      resolve(records.sort((a, b) => (
        new Date(b.downloaded_at || 0).getTime() - new Date(a.downloaded_at || 0).getTime()
      )));
    };
  });
};

export const getOfflineDownloadForTrack = async (track) => {
  if (!track) {
    return null;
  }

  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const downloadId = getOfflineDownloadId(track);

    const finish = (value) => {
      database.close();
      resolve(value || null);
    };

    const fail = (error) => {
      database.close();
      reject(error || new Error('Failed to read offline download.'));
    };

    if (downloadId) {
      const request = store.get(downloadId);
      request.onerror = () => fail(request.error);
      request.onsuccess = () => {
        if (request.result) {
          finish(request.result);
          return;
        }

        const allRequest = store.getAll();
        allRequest.onerror = () => fail(allRequest.error);
        allRequest.onsuccess = () => {
          const trackName = normalizeText(track.name || track.track_name);
          const artistName = normalizeText(track.artists?.map((artist) => artist.name).join(', ') || track.artist_name);
          const matched = (allRequest.result || []).find((entry) => (
            normalizeText(entry.track_name) === trackName &&
            normalizeText(entry.artist_name) === artistName
          ));
          finish(matched || null);
        };
      };
      return;
    }

    const request = store.getAll();
    request.onerror = () => fail(request.error);
    request.onsuccess = () => {
      const trackName = normalizeText(track.name || track.track_name);
      const artistName = normalizeText(track.artists?.map((artist) => artist.name).join(', ') || track.artist_name);
      const matched = (request.result || []).find((entry) => (
        normalizeText(entry.track_name) === trackName &&
        normalizeText(entry.artist_name) === artistName
      ));
      finish(matched || null);
    };
  });
};

export const deleteOfflineDownload = async (id) => {
  if (!id) {
    return;
  }

  await runTransaction('readwrite', (store) => {
    store.delete(id);
  });
  notifyOfflineDownloadsChanged();
};
