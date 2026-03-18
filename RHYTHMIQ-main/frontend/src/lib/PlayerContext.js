import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { historyAPI, youtubeAPI } from '@/lib/api';

const PlayerContext = createContext(null);

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
};

export const PlayerProvider = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');
  const [requiresPlaybackGesture, setRequiresPlaybackGesture] = useState(false);

  const audioRef = useRef(new Audio());
  const currentTrackRef = useRef(currentTrack);
  const repeatRef = useRef(repeat);
  const youtubeSearchCacheRef = useRef(new Map());
  const youtubeAudioCacheRef = useRef(new Map());
  const progressRef = useRef(0);
  const durationRef = useRef(0);
  const listeningSessionRef = useRef(null);
  const offlineObjectUrlRef = useRef(null);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const flushListeningEvent = useCallback((reason = 'switch') => {
    const activeTrack = currentTrackRef.current;
    const activeSession = listeningSessionRef.current;

    if (!activeTrack || !activeSession || activeSession.flushed) {
      return;
    }

    const playedSeconds = Math.max(Math.round(progressRef.current || 0), 0);
    if (playedSeconds < 2) {
      listeningSessionRef.current = { ...activeSession, flushed: true };
      return;
    }

    const totalSeconds = durationRef.current || ((activeTrack.duration_ms || 0) / 1000) || playedSeconds;
    const skipped = reason !== 'ended' && playedSeconds < Math.min(45, Math.max(totalSeconds * 0.45, 12));

    historyAPI.log({
      spotify_track_id: activeTrack.id,
      track_name: activeTrack.name || activeTrack.track_name,
      artist_name: activeTrack.artists?.map((artist) => artist.name).join(', ') || activeTrack.artist_name || '',
      genre: activeTrack.genre || '',
      play_duration: playedSeconds,
      skipped,
    }).catch(() => {
      // Ignore history logging errors during playback transitions.
    });

    listeningSessionRef.current = { ...activeSession, flushed: true };
  }, []);

  const beginListeningSession = useCallback((track) => {
    listeningSessionRef.current = {
      sessionId: `${track.id || 'track'}:${Date.now()}`,
      trackId: track.id,
      flushed: false,
    };
  }, []);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    flushListeningEvent('stop');
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (offlineObjectUrlRef.current) {
      URL.revokeObjectURL(offlineObjectUrlRef.current);
      offlineObjectUrlRef.current = null;
    }
    setIsPlaying(false);
    setProgress(0);
  }, [flushListeningEvent]);

  const closePlayer = useCallback(() => {
    stopPlayback();
    setCurrentTrack(null);
    setQueue([]);
    setQueueIndex(-1);
    setDuration(0);
    setRequiresPlaybackGesture(false);
  }, [stopPlayback]);

  const resolveYouTubeVideo = useCallback(async (track) => {
    const trackName = track.name || track.track_name || '';
    const artistName = track.artists?.map((artist) => artist.name).join(', ') || track.artist_name || '';

    if (!trackName) {
      return null;
    }

    const cacheKey = `${track.id || trackName}:${artistName}`;
    if (youtubeSearchCacheRef.current.has(cacheKey)) {
      return youtubeSearchCacheRef.current.get(cacheKey);
    }

    try {
      const response = await youtubeAPI.resolveTrack(trackName, artistName);
      const match = response.data?.video_id ? response.data : null;
      youtubeSearchCacheRef.current.set(cacheKey, match);
      return match;
    } catch (error) {
      youtubeSearchCacheRef.current.set(cacheKey, null);
      return null;
    }
  }, []);

  const resolveYouTubeAudio = useCallback(async (track, youtubeMatch) => {
    const videoId = youtubeMatch?.video_id;
    if (!videoId) {
      return null;
    }

    if (youtubeAudioCacheRef.current.has(videoId)) {
      return youtubeAudioCacheRef.current.get(videoId);
    }

    try {
      const response = await youtubeAPI.audioSource(
        videoId,
        track.name || track.track_name || '',
        track.artists?.map((artist) => artist.name).join(', ') || track.artist_name || ''
      );
      const source = response.data?.stream_url ? response.data : null;
      youtubeAudioCacheRef.current.set(videoId, source);
      return source;
    } catch (error) {
      youtubeAudioCacheRef.current.set(videoId, null);
      return null;
    }
  }, []);

  const startAudioPlayback = useCallback(async (track, sourceUrl, nextDuration = 0) => {
    const audio = audioRef.current;

    flushListeningEvent('switch');
    audio.pause();
    audio.src = sourceUrl;
    audio.currentTime = 0;
    audio.preload = 'auto';
    audio.load();

    setCurrentTrack(track);
    setProgress(0);
    setDuration(nextDuration || ((track.duration_ms || 0) / 1000));

    try {
      await audio.play();
      setIsPlaying(true);
      setRequiresPlaybackGesture(false);
      beginListeningSession(track);
    } catch (error) {
      setIsPlaying(false);
      setRequiresPlaybackGesture(true);
      listeningSessionRef.current = null;
    }

    return track;
  }, [beginListeningSession, flushListeningEvent]);

  const loadTrackPlayback = useCallback(async (track) => {
    if (!track) return null;

    const nextTrack = { ...track };
    const fallbackDuration = track.duration_ms ? track.duration_ms / 1000 : 0;

    setProgress(0);
    setDuration(fallbackDuration);
    setRequiresPlaybackGesture(false);

    if (track.offline_audio_blob instanceof Blob) {
      if (offlineObjectUrlRef.current) {
        URL.revokeObjectURL(offlineObjectUrlRef.current);
      }

      const offlineUrl = URL.createObjectURL(track.offline_audio_blob);
      offlineObjectUrlRef.current = offlineUrl;
      nextTrack.offline_audio_url = offlineUrl;
      nextTrack.playback_mode = 'offline_download';
      return startAudioPlayback(nextTrack, offlineUrl, fallbackDuration);
    }

    if (track.offline_audio_url) {
      nextTrack.playback_mode = 'offline_download';
      return startAudioPlayback(nextTrack, track.offline_audio_url, fallbackDuration);
    }

    const youtubeMatch = track.youtube_video_id ? {
      video_id: track.youtube_video_id,
      embed_url: track.youtube_embed_url,
      watch_url: track.youtube_watch_url,
      title: track.youtube_title,
    } : await resolveYouTubeVideo(track);

    if (youtubeMatch?.video_id) {
      nextTrack.youtube_video_id = youtubeMatch.video_id;
      nextTrack.youtube_embed_url = youtubeMatch.embed_url;
      nextTrack.youtube_watch_url = youtubeMatch.watch_url;
      nextTrack.youtube_title = youtubeMatch.title;

      const audioSource = track.youtube_audio_url ? {
        stream_url: track.youtube_audio_url,
        duration: track.youtube_duration,
      } : await resolveYouTubeAudio(track, youtubeMatch);

      if (audioSource?.stream_url) {
        nextTrack.youtube_audio_url = audioSource.stream_url;
        nextTrack.youtube_duration = audioSource.duration;
        nextTrack.playback_mode = 'youtube_audio';
        return startAudioPlayback(nextTrack, audioSource.stream_url, audioSource.duration || fallbackDuration);
      }
    }

    if (track.preview_url) {
      nextTrack.playback_mode = 'spotify_preview';
      return startAudioPlayback(nextTrack, track.preview_url, fallbackDuration || 30);
    }

    stopPlayback();
    setCurrentTrack(nextTrack);
    setDuration(fallbackDuration);
    return nextTrack;
  }, [resolveYouTubeAudio, resolveYouTubeVideo, startAudioPlayback, stopPlayback]);

  const playTrack = useCallback((track, trackList = null) => {
    if (!track) return;

    if (trackList) {
      setQueue(trackList);
      const idx = trackList.findIndex((item) => item.id === track.id);
      setQueueIndex(idx >= 0 ? idx : 0);
    }

    void loadTrackPlayback(track);
  }, [loadTrackPlayback]);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;

    let nextIdx;
    if (shuffle) {
      if (queue.length === 1) {
        nextIdx = 0;
      } else {
        nextIdx = queueIndex;
        while (nextIdx === queueIndex) {
          nextIdx = Math.floor(Math.random() * queue.length);
        }
      }
    } else {
      nextIdx = queueIndex + 1;
      if (nextIdx >= queue.length) {
        if (repeat === 'all') {
          nextIdx = 0;
        } else {
          setIsPlaying(false);
          return;
        }
      }
    }

    setQueueIndex(nextIdx);
    playTrack(queue[nextIdx]);
  }, [playTrack, queue, queueIndex, repeat, shuffle]);

  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volume;

    const onTimeUpdate = () => {
      progressRef.current = audio.currentTime;
      setProgress(audio.currentTime);
    };
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        durationRef.current = audio.duration;
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      flushListeningEvent('ended');
      if (repeatRef.current === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => setRequiresPlaybackGesture(true));
        beginListeningSession(currentTrackRef.current);
      } else {
        playNext();
      }
    };
    const onError = () => {
      flushListeningEvent('error');
      const activeTrack = currentTrackRef.current;
      if (activeTrack?.playback_mode === 'youtube_audio' && activeTrack.preview_url) {
        void startAudioPlayback(
          { ...activeTrack, playback_mode: 'spotify_preview' },
          activeTrack.preview_url,
          activeTrack.duration_ms ? activeTrack.duration_ms / 1000 : 30
        );
        return;
      }
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [beginListeningSession, flushListeningEvent, playNext, startAudioPlayback, volume]);

  useEffect(() => {
    audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => () => {
    flushListeningEvent('stop');
    audioRef.current.pause();
  }, [flushListeningEvent]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    audio.play()
      .then(() => {
        setIsPlaying(true);
        setRequiresPlaybackGesture(false);
        if (!listeningSessionRef.current?.trackId) {
          beginListeningSession(currentTrackRef.current);
        }
      })
      .catch(() => {
        setIsPlaying(false);
        setRequiresPlaybackGesture(true);
      });
  }, [beginListeningSession, isPlaying]);

  const seekTo = useCallback((time) => {
    audioRef.current.currentTime = time;
    setProgress(time);
  }, []);

  const startCurrentTrackAudio = useCallback(() => {
    audioRef.current.play()
      .then(() => {
        setIsPlaying(true);
        setRequiresPlaybackGesture(false);
        beginListeningSession(currentTrackRef.current);
      })
      .catch(() => {
        setIsPlaying(false);
        setRequiresPlaybackGesture(true);
      });
  }, [beginListeningSession]);

  const playPrev = useCallback(() => {
    if (queue.length === 0) return;
    if (progress > 3) {
      seekTo(0);
      return;
    }

    if (shuffle && queue.length > 1) {
      let prevIdx = queueIndex;
      while (prevIdx === queueIndex) {
        prevIdx = Math.floor(Math.random() * queue.length);
      }
      setQueueIndex(prevIdx);
      playTrack(queue[prevIdx]);
      return;
    }

    let prevIdx = queueIndex - 1;
    if (prevIdx < 0) prevIdx = queue.length - 1;
    setQueueIndex(prevIdx);
    playTrack(queue[prevIdx]);
  }, [playTrack, progress, queue, queueIndex, seekTo, shuffle]);

  const formatTime = (secs) => {
    if (!secs || Number.isNaN(secs)) return '0:00';
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <PlayerContext.Provider value={{
      currentTrack,
      queue,
      queueIndex,
      isPlaying,
      progress,
      duration,
      volume,
      shuffle,
      repeat,
      playTrack,
      togglePlay,
      playNext,
      playPrev,
      seekTo,
      setVolume,
      setShuffle,
      setRepeat,
      formatTime,
      requiresPlaybackGesture,
      startCurrentTrackAudio,
      setQueue,
      setQueueIndex,
      closePlayer,
    }}
    >
      {children}
    </PlayerContext.Provider>
  );
};
