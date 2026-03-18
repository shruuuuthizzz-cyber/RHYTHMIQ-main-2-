import axios from 'axios';

const inferredProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https:' : 'http:';
const inferredHost = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
const inferredPort = typeof window !== 'undefined' ? window.location.port : '';
const inferredOrigin = typeof window !== 'undefined' ? window.location.origin : `${inferredProtocol}//${inferredHost}`;
const backendUrl = process.env.REACT_APP_BACKEND_URL || (
  inferredPort === '3000' || inferredPort === '3001'
    ? `${inferredProtocol}//${inferredHost}:8000`
    : inferredOrigin
);
const API_BASE = `${backendUrl}/api`;
const adminMode = process.env.REACT_APP_ADMIN_MODE === 'true';

export const buildApiUrl = (path) => `${API_BASE}${path}`;

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rhythmiq_token');
  if (token) {
    config.params = { ...config.params, authorization: `Bearer ${token}` };
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('rhythmiq_token');
      localStorage.removeItem('rhythmiq_user');
      window.location.href = adminMode ? '/admin/login' : '/auth';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  googleLogin: (credential) => api.post('/auth/google', { credential }),
  me: () => api.get('/auth/me'),
};

// Spotify
export const spotifyAPI = {
  search: (q, type = 'track', limit = 20) => api.get('/spotify/search', { params: { q, type, limit } }),
  track: (id) => api.get(`/spotify/track/${id}`),
  trackFeatures: (id) => api.get(`/spotify/track/${id}/features`),
  artist: (id) => api.get(`/spotify/artist/${id}`),
  artistTopTracks: (id) => api.get(`/spotify/artist/${id}/top-tracks`),
  artistRelated: (id) => api.get(`/spotify/artist/${id}/related`),
  artistAlbums: (id) => api.get(`/spotify/artist/${id}/albums`),
  album: (id) => api.get(`/spotify/album/${id}`),
  newReleases: (limit = 20) => api.get('/spotify/browse/new-releases', { params: { limit } }),
  featuredPlaylists: (limit = 20) => api.get('/spotify/browse/featured-playlists', { params: { limit } }),
  categories: (limit = 20) => api.get('/spotify/browse/categories', { params: { limit } }),
  recommendations: (params) => api.get('/spotify/recommendations', { params }),
};

export const youtubeAPI = {
  resolveTrack: (trackName, artistName = '') => api.get('/youtube/search', { params: { track_name: trackName, artist_name: artistName } }),
  batchResolveTracks: (items) => api.post('/youtube/batch-resolve', items),
  audioSource: (videoId, trackName = '', artistName = '') => api.post('/youtube/audio-source', {
    video_id: videoId || null,
    track_name: trackName || null,
    artist_name: artistName || null,
  }),
};

export const attachYouTubeFallbacks = async (tracks = []) => {
  const normalizedTracks = tracks.filter(Boolean);
  if (normalizedTracks.length === 0) {
    return [];
  }

  try {
    const payload = normalizedTracks.map((track) => ({
      track_name: track.name || track.track_name || '',
      artist_name: track.artists?.map((artist) => artist.name).join(', ') || track.artist_name || '',
    }));

    const response = await youtubeAPI.batchResolveTracks(payload);
    const matches = response.data?.items || [];

    return normalizedTracks.map((track, index) => {
      const match = matches[index];
      if (!match?.video_id) {
        return track;
      }
      return {
        ...track,
        youtube_video_id: match.video_id,
        youtube_embed_url: match.embed_url,
        youtube_watch_url: match.watch_url,
        youtube_title: match.title,
      };
    });
  } catch (error) {
    return normalizedTracks;
  }
};

// Playlists
export const playlistAPI = {
  getAll: () => api.get('/playlists'),
  get: (id) => api.get(`/playlists/${id}`),
  create: (data) => api.post('/playlists', data),
  update: (id, data) => api.put(`/playlists/${id}`, data),
  delete: (id) => api.delete(`/playlists/${id}`),
  addSong: (id, data) => api.post(`/playlists/${id}/songs`, data),
  removeSong: (playlistId, songId) => api.delete(`/playlists/${playlistId}/songs/${songId}`),
};

// Likes
export const likesAPI = {
  toggle: (data) => api.post('/likes/toggle', data),
  getAll: () => api.get('/likes'),
  check: (trackId) => api.get(`/likes/check/${trackId}`),
};

// Ratings
export const ratingsAPI = {
  set: (data) => api.post('/ratings', data),
  getAll: () => api.get('/ratings'),
  check: (trackId) => api.get(`/ratings/check/${trackId}`),
};

// History
export const historyAPI = {
  log: (data) => api.post('/history', data),
  getAll: (limit = 50) => api.get('/history', { params: { limit } }),
};

// DNA
export const dnaAPI = {
  get: () => api.get('/dna'),
};

// LYRA
export const lyraAPI = {
  chat: (message) => api.post('/lyra/chat', { message }),
  history: (limit = 50) => api.get('/lyra/history', { params: { limit } }),
  config: () => api.get('/lyra/config'),
};

// Song Deep Dive
export const songDiveAPI = {
  get: (trackId) => api.get(`/song-dive/${trackId}`),
};

// Admin
export const adminAPI = {
  getUsers: () => api.get('/admin/users'),
  getRecommendations: (userId = null) => api.get('/admin/recommendations', { params: userId ? { user_id: userId } : {} }),
  getUserStatistics: () => api.get('/admin/user-statistics'),
  getLoginHistory: (userId = null) => api.get('/admin/login-history', { params: userId ? { user_id: userId } : {} }),
  sendRecommendation: (data) => api.post('/admin/recommendations', data),
};

export const userRecommendationsAPI = {
  getMine: () => api.get('/recommendations/admin'),
};

// Time of Day
export const suggestionsAPI = {
  timeOfDay: (hour, limit = 20) => api.get('/suggestions/time-of-day', { params: { hour, limit } }),
};

export default api;
