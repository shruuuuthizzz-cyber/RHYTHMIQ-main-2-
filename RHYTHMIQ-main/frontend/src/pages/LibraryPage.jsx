import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { playlistAPI, likesAPI } from '@/lib/api';
import { deleteOfflineDownload, listOfflineDownloads, OFFLINE_DOWNLOADS_UPDATED_EVENT } from '@/lib/offlineDownloads';
import { usePlayer } from '@/lib/PlayerContext';
import { useNavigate } from 'react-router-dom';
import { Plus, Heart, Music, ListMusic, MoreHorizontal, Trash2, Play, Download, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/sonner';

export default function LibraryPage() {
  const [playlists, setPlaylists] = useState([]);
  const [likedSongs, setLikedSongs] = useState([]);
  const [downloadedSongs, setDownloadedSongs] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('playlists');
  const { playTrack } = usePlayer();
  const navigate = useNavigate();

  useEffect(() => {
    const syncOfflineDownloads = () => {
      void loadData();
    };

    void loadData();
    window.addEventListener(OFFLINE_DOWNLOADS_UPDATED_EVENT, syncOfflineDownloads);

    return () => {
      window.removeEventListener(OFFLINE_DOWNLOADS_UPDATED_EVENT, syncOfflineDownloads);
    };
  }, []);

  const loadData = async () => {
    try {
      const [plRes, likedRes, offlineDownloads] = await Promise.all([
        playlistAPI.getAll(),
        likesAPI.getAll(),
        listOfflineDownloads(),
      ]);
      setPlaylists(plRes.data);
      setLikedSongs(likedRes.data);
      setDownloadedSongs(offlineDownloads);
    } catch (e) {
      console.error('Library load error', e);
    }
  };

  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      await playlistAPI.create({ name: newPlaylistName });
      setNewPlaylistName('');
      setDialogOpen(false);
      loadData();
    } catch (e) {
      console.error('Create playlist error', e);
    }
  };

  const deletePlaylist = async (id) => {
    try {
      await playlistAPI.delete(id);
      loadData();
    } catch (e) {
      console.error('Delete playlist error', e);
    }
  };

  const playLikedSong = (song) => {
    const track = {
      id: song.spotify_track_id,
      name: song.track_name,
      artists: [{ name: song.artist_name }],
      album: { name: song.album_name, images: [{ url: song.album_image }] },
      preview_url: song.preview_url,
      duration_ms: song.duration_ms,
      artist_name: song.artist_name,
      album_image: song.album_image
    };
    const trackList = likedSongs.map(s => ({
      id: s.spotify_track_id, name: s.track_name, artists: [{ name: s.artist_name }],
      album: { name: s.album_name, images: [{ url: s.album_image }] },
      preview_url: s.preview_url, duration_ms: s.duration_ms
    }));
    playTrack(track, trackList);
  };

  const playDownloadedSong = (song) => {
    const track = {
      id: song.spotify_track_id || song.id,
      name: song.track_name,
      artists: [{ name: song.artist_name }],
      album: { name: song.album_name, images: [{ url: song.album_image }] },
      duration_ms: song.duration_ms,
      artist_name: song.artist_name,
      album_image: song.album_image,
      offline_audio_blob: song.audio_blob,
      download_id: song.id,
    };
    const trackList = downloadedSongs.map((entry) => ({
      id: entry.spotify_track_id || entry.id,
      name: entry.track_name,
      artists: [{ name: entry.artist_name }],
      album: { name: entry.album_name, images: [{ url: entry.album_image }] },
      duration_ms: entry.duration_ms,
      artist_name: entry.artist_name,
      album_image: entry.album_image,
      offline_audio_blob: entry.audio_blob,
      download_id: entry.id,
    }));
    playTrack(track, trackList);
  };

  const removeDownloadedSong = async (downloadId) => {
    try {
      await deleteOfflineDownload(downloadId);
      toast.success('Removed from offline downloads');
      await loadData();
    } catch (error) {
      console.error('Delete offline download error', error);
      toast.error('Failed to remove offline download');
    }
  };

  const formatDuration = (durationMs) => (
    durationMs
      ? `${Math.floor(durationMs / 60000)}:${String(Math.floor((durationMs % 60000) / 1000)).padStart(2, '0')}`
      : '--:--'
  );

  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 md:p-10 space-y-8"
    >
      <div className="flex items-center justify-between">
        <h1 className="font-syne font-extrabold text-4xl tracking-tight">Your Library</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-playlist-btn" className="rounded-full bg-primary text-black font-bold hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" /> New Playlist
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-white/10">
            <DialogHeader>
              <DialogTitle className="font-syne">Create Playlist</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input
                data-testid="new-playlist-name"
                placeholder="Playlist name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="bg-white/5 border-white/10"
                onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
              />
              <Button data-testid="save-playlist-btn" onClick={createPlaylist} className="w-full rounded-full bg-primary text-black font-bold">
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <div className="flex gap-3">
        <button
          data-testid="tab-playlists"
          onClick={() => setActiveTab('playlists')}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${activeTab === 'playlists' ? 'bg-white text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
        >
          <ListMusic className="w-4 h-4 inline mr-2" />Playlists ({playlists.length})
        </button>
        <button
          data-testid="tab-liked-songs"
          onClick={() => setActiveTab('liked')}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${activeTab === 'liked' ? 'bg-white text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
        >
          <Heart className="w-4 h-4 inline mr-2" />Liked Songs ({likedSongs.length})
        </button>
        <button
          data-testid="tab-downloaded-songs"
          onClick={() => setActiveTab('downloads')}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${activeTab === 'downloads' ? 'bg-white text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
        >
          <Download className="w-4 h-4 inline mr-2" />Downloaded Songs ({downloadedSongs.length})
        </button>
      </div>

      {/* Playlists */}
      {activeTab === 'playlists' && (
        <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((pl) => (
            <motion.div
              key={pl.id}
              variants={item}
              data-testid={`playlist-card-${pl.id}`}
              className="group bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 rounded-xl p-4 cursor-pointer transition-colors duration-200"
            >
              <div className="flex items-center gap-4" onClick={() => navigate(`/playlist/${pl.id}`)}>
                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {pl.first_image ? (
                    <img src={pl.first_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music className="w-6 h-6 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{pl.name}</p>
                  <p className="text-sm text-muted-foreground">{pl.song_count} songs</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <button className="p-2 rounded-full hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-card border-white/10">
                    <DropdownMenuItem data-testid={`delete-playlist-${pl.id}`} onClick={(e) => { e.stopPropagation(); deletePlaylist(pl.id); }} className="text-destructive">
                      <Trash2 className="w-4 h-4 mr-2" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </motion.div>
          ))}
          {playlists.length === 0 && (
            <div className="col-span-full text-center py-16">
              <ListMusic className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-muted-foreground">No playlists yet. Create your first one!</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Liked Songs */}
      {activeTab === 'liked' && (
        <div className="space-y-2">
          {likedSongs.map((song, idx) => (
            <motion.div
              key={song.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
              data-testid={`liked-song-${song.spotify_track_id}`}
              className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors duration-200 group cursor-pointer"
              onClick={() => playLikedSong(song)}
            >
              <span className="text-sm text-zinc-600 w-6 text-right group-hover:hidden">{idx + 1}</span>
              <Play className="w-4 h-4 text-white hidden group-hover:block w-6" />
              <img src={song.album_image} alt="" className="w-10 h-10 rounded object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{song.track_name}</p>
                <p className="text-xs text-muted-foreground truncate">{song.artist_name}</p>
              </div>
              <p className="text-xs text-muted-foreground">{formatDuration(song.duration_ms)}</p>
            </motion.div>
          ))}
          {likedSongs.length === 0 && (
            <div className="text-center py-16">
              <Heart className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-muted-foreground">No liked songs yet. Start exploring!</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'downloads' && (
        <div className="space-y-2">
          {downloadedSongs.map((song, idx) => (
            <motion.div
              key={song.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
              data-testid={`downloaded-song-${song.id}`}
              className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors duration-200 group cursor-pointer"
              onClick={() => playDownloadedSong(song)}
            >
              <span className="text-sm text-zinc-600 w-6 text-right group-hover:hidden">{idx + 1}</span>
              <Play className="w-4 h-4 text-white hidden group-hover:block w-6" />
              <img src={song.album_image} alt="" className="w-10 h-10 rounded object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{song.track_name}</p>
                <p className="text-xs text-muted-foreground truncate">{song.artist_name}</p>
                <p className="text-[11px] text-emerald-300 flex items-center gap-1 mt-1">
                  <WifiOff className="w-3 h-3" />
                  Saved in {song.storage_location || 'Library > Downloaded Songs'}
                </p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {song.downloaded_at ? `Downloaded ${new Date(song.downloaded_at).toLocaleString()}` : 'Ready without internet'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">{formatDuration(song.duration_ms)}</p>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void removeDownloadedSong(song.id);
                }}
                className="rounded-full p-2 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Remove offline download"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
          {downloadedSongs.length === 0 && (
            <div className="text-center py-16">
              <Download className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-muted-foreground">No offline downloads yet. Download a song from the player to see it here.</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
