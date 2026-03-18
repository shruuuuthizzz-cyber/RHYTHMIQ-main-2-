import React from 'react';
import { usePlayer } from '@/lib/PlayerContext';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, VolumeX, Heart, Plus, Download, List, Maximize2, Minimize2, X, Check } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { buildApiUrl, likesAPI, playlistAPI } from '@/lib/api';
import { getOfflineDownloadForTrack, OFFLINE_DOWNLOADS_UPDATED_EVENT, saveOfflineDownload } from '@/lib/offlineDownloads';
import { toast } from '@/components/ui/sonner';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export const PlayerBar = () => {
  const {
    currentTrack, isPlaying, progress, duration, volume, shuffle, repeat,
    togglePlay, playTrack, playNext, playPrev, seekTo, setVolume, setShuffle, setRepeat, formatTime,
    requiresPlaybackGesture, startCurrentTrackAudio, queue, closePlayer
  } = usePlayer();
  const [liked, setLiked] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlists, setPlaylists] = useState([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [playlistBusy, setPlaylistBusy] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('idle');
  const [showMiniBar, setShowMiniBar] = useState(true);

  useEffect(() => {
    if (currentTrack?.id) {
      likesAPI.check(currentTrack.id).then(res => setLiked(res.data.liked)).catch(() => {});
      setShowMiniBar(true);
    }
  }, [currentTrack?.id]);

  useEffect(() => {
    let isActive = true;

    const syncDownloadState = async () => {
      if (!currentTrack) {
        if (isActive) {
          setDownloadStatus('idle');
        }
        return;
      }

      try {
        const existingDownload = await getOfflineDownloadForTrack(currentTrack);
        if (isActive) {
          setDownloadStatus(existingDownload ? 'downloaded' : 'idle');
        }
      } catch (error) {
        if (isActive) {
          setDownloadStatus('idle');
        }
      }
    };

    const handleDownloadsChanged = () => {
      void syncDownloadState();
    };

    void syncDownloadState();
    window.addEventListener(OFFLINE_DOWNLOADS_UPDATED_EVENT, handleDownloadsChanged);

    return () => {
      isActive = false;
      window.removeEventListener(OFFLINE_DOWNLOADS_UPDATED_EVENT, handleDownloadsChanged);
    };
  }, [
    currentTrack?.id,
    currentTrack?.spotify_track_id,
    currentTrack?.youtube_video_id,
    currentTrack?.name,
    currentTrack?.track_name,
    currentTrack?.artist_name,
  ]);

  const handleLike = async () => {
    if (!currentTrack) return;
    try {
      const res = await likesAPI.toggle({
        spotify_track_id: currentTrack.id,
        track_name: currentTrack.name,
        artist_name: currentTrack.artists?.map(a => a.name).join(', '),
        album_name: currentTrack.album?.name,
        album_image: currentTrack.album?.images?.[0]?.url,
        duration_ms: currentTrack.duration_ms,
        preview_url: currentTrack.preview_url
      });
      setLiked(res.data.liked);
    } catch (e) { /* ignore */ }
  };

  const cycleRepeat = () => {
    if (repeat === 'off') setRepeat('all');
    else if (repeat === 'all') setRepeat('one');
    else setRepeat('off');
  };

  const addCurrentTrackToPlaylist = async (playlistId) => {
    if (!currentTrack) return;

    try {
      setPlaylistBusy(true);
      await playlistAPI.addSong(playlistId, {
        spotify_track_id: currentTrack.id,
        track_name: currentTrack.name || currentTrack.track_name,
        artist_name: currentTrack.artists?.map((a) => a.name).join(', ') || currentTrack.artist_name,
        album_name: currentTrack.album?.name,
        album_image: currentTrack.album?.images?.[0]?.url || currentTrack.album_image,
        duration_ms: currentTrack.duration_ms,
        preview_url: currentTrack.preview_url,
      });
      setCreateDialogOpen(false);
    } catch (e) {
      console.error('Add to playlist error', e);
    } finally {
      setPlaylistBusy(false);
    }
  };

  const loadPlaylists = async () => {
    try {
      setLoadingPlaylists(true);
      const res = await playlistAPI.getAll();
      setPlaylists(res.data || []);
    } catch (e) {
      console.error('Load playlists error', e);
      setPlaylists([]);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const openPlaylistDialog = async () => {
    setCreateDialogOpen(true);
    await loadPlaylists();
  };

  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      setPlaylistBusy(true);
      const res = await playlistAPI.create({ name: newPlaylistName.trim() });
      setNewPlaylistName('');
      if (res.data?.id) {
        await addCurrentTrackToPlaylist(res.data.id);
        await loadPlaylists();
      }
    } catch (e) {
      console.error('Create playlist error', e);
    } finally {
      setPlaylistBusy(false);
    }
  };

  const downloadTrack = async () => {
    if (!currentTrack || downloadStatus === 'downloading' || downloadStatus === 'downloaded') return;

    const trackLabel = currentTrack.name || currentTrack.track_name || 'RHYTHMIQ Track';
    const artistLabel = currentTrack.artists?.map(a => a.name).join(', ') || currentTrack.artist_name || '';
    const params = new URLSearchParams();
    const token = localStorage.getItem('rhythmiq_token');
    if (currentTrack.youtube_video_id) {
      params.set('video_id', currentTrack.youtube_video_id);
    }
    params.set('track_name', trackLabel);
    if (artistLabel) {
      params.set('artist_name', artistLabel);
    }
    if (token) {
      params.set('authorization', `Bearer ${token}`);
    }

    try {
      setDownloadStatus('downloading');
      const response = await fetch(buildApiUrl(`/youtube/download?${params.toString()}`));
      if (!response.ok) {
        let detail = 'Download request failed';
        const responseType = response.headers.get('content-type') || '';
        if (responseType.includes('application/json')) {
          const payload = await response.json().catch(() => null);
          detail = payload?.detail || detail;
        }
        throw new Error(detail);
      }

      const blob = await response.blob();
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error('Downloaded audio file was empty');
      }

      const contentDisposition = response.headers.get('content-disposition') || '';
      const matchedFilename = contentDisposition.match(/filename="([^"]+)"/i);
      const resolvedFilename = matchedFilename?.[1] || `${trackLabel}${artistLabel ? ` - ${artistLabel}` : ''}.mp3`;
      const savedRecord = await saveOfflineDownload({
        track: currentTrack,
        audioBlob: blob,
        filename: resolvedFilename,
        contentType: blob.type || response.headers.get('content-type') || 'audio/mpeg',
      });

      toast.success('Saved for offline playback', {
        description: `${savedRecord.track_name} is now in ${savedRecord.storage_location}.`,
      });
      setDownloadStatus('downloaded');
    } catch (error) {
      console.error('Download error', error);
      setDownloadStatus('idle');
      toast.error('Offline save failed', {
        description: error?.message || 'We could not prepare this song for offline playback.',
      });
    }
  };

  const handleCloseMiniBar = () => {
    setFullScreen(false);
    setShowMiniBar(false);
    closePlayer();
  };

  if (!currentTrack || !showMiniBar) {
    return null; // Hide when no track or user manually closed the mini player
  }

  const albumImage = currentTrack.album?.images?.[0]?.url || currentTrack.album_image || '';
  const trackName = currentTrack.name || currentTrack.track_name || 'Unknown';
  const artistName = currentTrack.artists?.map(a => a.name).join(', ') || currentTrack.artist_name || 'Unknown';
  const playbackMode = currentTrack.playback_mode || null;
  const hasPreview = playbackMode === 'spotify_preview';
  const hasYouTubeFallback = playbackMode === 'youtube_audio';
  const isDownloading = downloadStatus === 'downloading';
  const isDownloaded = downloadStatus === 'downloaded';
  const downloadButtonLabel = isDownloading ? 'Downloading...' : isDownloaded ? 'Downloaded' : 'Download';
  const downloadButtonTitle = isDownloading ? 'Downloading for offline playback...' : isDownloaded ? 'Already saved in Library > Downloaded Songs' : 'Download for offline playback';

  return (
    <>
      <div data-testid="player-bar" className="fixed bottom-0 left-0 w-full h-24 border-t border-white/10 bg-black/90 backdrop-blur-2xl z-50 cursor-pointer overflow-x-auto" onClick={() => setFullScreen(true)}>
        {/* Progress bar at top */}
        <div className="absolute top-0 left-0 w-full h-1 bg-white/5 cursor-pointer group" onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          seekTo(pct * duration);
        }}>
          <div className="h-full bg-primary transition-all duration-100 group-hover:h-1.5" style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }} />
        </div>

        <div className="flex items-center h-full px-4 md:px-6 gap-4">
          {/* Track info */}
          <div className="flex items-center gap-3 w-1/4 min-w-0">
            {albumImage && (
              <img src={albumImage} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{trackName}</p>
              <p className="text-xs text-muted-foreground truncate">{artistName}</p>
            </div>
            <button data-testid="player-like-btn" onClick={(e) => { e.stopPropagation(); handleLike(); }} className="ml-2 flex-shrink-0">
              <Heart className={`w-4 h-4 transition-colors duration-200 ${liked ? 'fill-primary text-primary' : 'text-zinc-400 hover:text-white'}`} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); void openPlaylistDialog(); }}
              className="ml-2 flex-shrink-0 text-zinc-400 hover:text-white transition-colors duration-200"
              title="Add to Playlist"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); void downloadTrack(); }}
              disabled={isDownloading}
              className={`ml-2 flex-shrink-0 transition-colors duration-200 disabled:opacity-50 ${isDownloaded ? 'text-emerald-300 hover:text-emerald-200' : 'text-zinc-400 hover:text-white'}`}
              title={downloadButtonTitle}
            >
              {isDownloaded ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            </button>
            {hasYouTubeFallback && (
              <span className="ml-2 text-[10px] text-red-300 bg-red-500/10 px-2 py-0.5 rounded-full">YouTube Audio</span>
            )}
            {!hasPreview && !hasYouTubeFallback && (
              <span className="ml-2 text-[10px] text-zinc-600 bg-white/5 px-2 py-0.5 rounded-full">Playback N/A</span>
            )}
          </div>

          {/* Controls */}
          <div className="flex-1 flex flex-col items-center gap-1">
            <div className="flex items-center gap-4">
              <button data-testid="shuffle-btn" onClick={(e) => { e.stopPropagation(); setShuffle(!shuffle); }} className={`transition-colors duration-200 ${shuffle ? 'text-primary' : 'text-zinc-400 hover:text-white'}`}>
                <Shuffle className="w-4 h-4" />
              </button>
              <button data-testid="prev-btn" onClick={(e) => { e.stopPropagation(); playPrev(); }} className="text-zinc-300 hover:text-white transition-colors duration-200">
                <SkipBack className="w-5 h-5" />
              </button>
              <button data-testid="play-pause-btn" onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform duration-200">
                {isPlaying ? <Pause className="w-5 h-5 text-black" /> : <Play className="w-5 h-5 text-black ml-0.5" />}
              </button>
              <button data-testid="next-btn" onClick={(e) => { e.stopPropagation(); playNext(); }} className="text-zinc-300 hover:text-white transition-colors duration-200">
                <SkipForward className="w-5 h-5" />
              </button>
              <button data-testid="repeat-btn" onClick={(e) => { e.stopPropagation(); cycleRepeat(); }} className={`transition-colors duration-200 ${repeat !== 'off' ? 'text-primary' : 'text-zinc-400 hover:text-white'}`}>
                {repeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 w-full max-w-md">
              <span className="w-10 text-right">{formatTime(progress)}</span>
              <Slider
                data-testid="progress-slider"
                value={[progress]}
                max={duration || 30}
                step={0.1}
                onValueChange={([v]) => seekTo(v)}
                className="flex-1"
              />
              <span className="w-10">{formatTime(duration)}</span>
            </div>
            {hasYouTubeFallback && requiresPlaybackGesture && (
              <button
                onClick={(e) => { e.stopPropagation(); startCurrentTrackAudio(); }}
                className="mt-1 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-[11px] text-red-200 hover:bg-red-500/20 transition-colors duration-200"
              >
                Tap to start audio
              </button>
            )}
          </div>

          {/* Volume */}
          <div className="w-1/4 flex items-center justify-end gap-2">
            {/* Sound bars when playing */}
            {isPlaying && (
              <div className="flex items-end gap-0.5 h-4 mr-3">
                <div className="sound-bar" style={{ animationDelay: '0s' }} />
                <div className="sound-bar" style={{ animationDelay: '0.15s' }} />
                <div className="sound-bar" style={{ animationDelay: '0.3s' }} />
                <div className="sound-bar" style={{ animationDelay: '0.45s' }} />
              </div>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); setShowQueue(true); }} 
              className="text-zinc-400 hover:text-white transition-colors duration-200"
              title="View Queue"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setFullScreen(true); }}
              className="text-zinc-400 hover:text-white transition-colors duration-200"
              title="Open full player"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleCloseMiniBar(); }}
              className="text-zinc-400 hover:text-white transition-colors duration-200"
              title="Close player"
            >
              <X className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setVolume(volume === 0 ? 0.7 : 0); }} className="text-zinc-400 hover:text-white transition-colors duration-200">
              {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <Slider
              data-testid="volume-slider"
              value={[volume * 100]}
              max={100}
              step={1}
              onValueChange={([v]) => setVolume(v / 100)}
              className="w-24"
            />
          </div>
        </div>
      </div>

      {/* Full Screen Player */}
      <Dialog open={fullScreen} onOpenChange={setFullScreen}>
        <DialogContent hideClose className="m-0 h-full w-full max-w-none rounded-none p-0">
          <div className="h-full flex flex-col bg-black overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div>
                <DialogTitle className="text-lg font-semibold">Now Playing</DialogTitle>
                <p className="text-xs text-muted-foreground">{trackName} • {artistName}</p>
              </div>
            <div className="flex items-center gap-2">
                <button
                  onClick={() => setFullScreen(false)}
                  className="rounded-full bg-white/5 p-2 text-white hover:bg-white/10"
                  title="Minimize player"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center gap-6 px-6 py-8">
              <div className="w-[70vw] max-w-md sm:w-96 sm:max-w-xl aspect-square rounded-3xl overflow-hidden bg-white/5 shadow-lg">
                <img
                  src={albumImage}
                  alt={trackName}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="text-center space-y-1">
                <p className="text-2xl font-semibold truncate">{trackName}</p>
                <p className="text-sm text-muted-foreground truncate">{artistName}</p>
                {currentTrack.album?.name && (
                  <p className="text-xs text-zinc-400">{currentTrack.album.name}</p>
                )}
              </div>

              <div className="flex flex-col items-center w-full max-w-xl gap-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleLike}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${liked ? 'bg-primary text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                  >
                    <Heart className="w-4 h-4" />
                    {liked ? 'Liked' : 'Like'}
                  </button>

                  <button
                    onClick={() => { void openPlaylistDialog(); }}
                    className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
                  >
                    <Plus className="w-4 h-4" />
                    Playlist
                  </button>

                  <button
                    onClick={() => { void downloadTrack(); }}
                    disabled={isDownloading}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${isDownloaded ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20' : 'bg-white/5 text-white hover:bg-white/10'}`}
                  >
                    {isDownloaded ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                    {downloadButtonLabel}
                  </button>
                </div>

                <div className="flex items-center gap-6">
                  <button
                    onClick={() => setShuffle(!shuffle)}
                    className={`rounded-full p-3 transition ${shuffle ? 'bg-primary text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                  >
                    <Shuffle className="w-5 h-5" />
                  </button>
                  <button
                    onClick={playPrev}
                    className="rounded-full p-3 bg-white/5 text-white hover:bg-white/10"
                  >
                    <SkipBack className="w-5 h-5" />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="rounded-full bg-white p-4 flex items-center justify-center shadow-lg hover:scale-[1.03] transition-transform"
                  >
                    {isPlaying ? <Pause className="w-6 h-6 text-black" /> : <Play className="w-6 h-6 text-black" />}
                  </button>
                  <button
                    onClick={playNext}
                    className="rounded-full p-3 bg-white/5 text-white hover:bg-white/10"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                  <button
                    onClick={cycleRepeat}
                    className={`rounded-full p-3 transition ${repeat !== 'off' ? 'bg-primary text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                  >
                    {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
                  </button>
                </div>

                <div className="flex items-center gap-4 w-full">
                  <span className="text-xs text-muted-foreground w-12 text-right">{formatTime(progress)}</span>
                  <Slider
                    value={[progress]}
                    max={duration || 30}
                    step={0.1}
                    onValueChange={([v]) => seekTo(v)}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-12 text-left">{formatTime(duration)}</span>
                </div>

                <div className="flex items-center justify-between w-full max-w-xl gap-4">
                  <button
                    onClick={() => setShowQueue(true)}
                    className="flex-1 rounded-full bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
                  >
                    View Queue
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setVolume(volume === 0 ? 0.7 : 0)}
                      className="rounded-full bg-white/5 p-3 text-white hover:bg-white/10"
                    >
                      {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </button>
                    <Slider
                      value={[volume * 100]}
                      max={100}
                      step={1}
                      onValueChange={([v]) => setVolume(v / 100)}
                      className="w-28"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="bg-card border-white/10">
            <DialogHeader>
              <DialogTitle className="font-syne">Add to Playlist</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Create new playlist</p>
              <Input
                placeholder="Playlist name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="bg-white/5 border-white/10"
                onKeyDown={(e) => e.key === 'Enter' && !playlistBusy && createPlaylist()}
              />
              <Button onClick={createPlaylist} disabled={playlistBusy || !newPlaylistName.trim()} className="w-full rounded-full bg-primary text-black font-bold">
                Create and Add Current Track
              </Button>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Or add to existing playlist</p>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {loadingPlaylists ? (
                    <p className="text-sm text-muted-foreground">Loading playlists...</p>
                  ) : playlists.length > 0 ? (
                    playlists.map((playlist) => (
                      <button
                        key={playlist.id}
                        type="button"
                        disabled={playlistBusy}
                        onClick={() => addCurrentTrackToPlaylist(playlist.id)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10 disabled:opacity-60"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{playlist.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {playlist.song_count || 0} songs
                            </p>
                          </div>
                          <Plus className="w-4 h-4 text-zinc-400" />
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No playlists yet. Create your first one above.</p>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Queue View Dialog */}
        <Dialog open={showQueue} onOpenChange={setShowQueue}>
          <DialogContent className="bg-black border-white/10 max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="font-syne">Next Up</DialogTitle>
              <p className="text-xs text-muted-foreground">Upcoming tracks and recommendations</p>
              <DialogClose />
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-4">
              {queue.length === 0 ? (
                <p className="text-sm text-zinc-400 p-4">No queued tracks. Add songs to get started!</p>
              ) : (
                <>
                  <div className="px-4 py-2 bg-white/5 rounded-lg">
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Queue ({queue.length})</p>
                  </div>
                  {queue.map((track, index) => {
                    const isActive = currentTrack?.id && track.id === currentTrack.id;
                    return (
                      <div
                        key={track.id || `${track.name}-${index}`}
                        onClick={() => playTrack(track, queue)}
                        className={`flex items-center gap-3 rounded-lg px-4 py-2 transition-colors duration-200 cursor-pointer ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
                      >
                        <span className="text-xs text-zinc-500 w-6 text-right">{index + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{track.name || track.track_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {track.artists?.map(a => a.name).join(', ') || track.artist_name || 'Unknown'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
    </>
  );
};
