import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { playlistAPI } from '@/lib/api';
import { usePlayer } from '@/lib/PlayerContext';
import { Play, Clock, Trash2, Music, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PlaylistPage() {
  const { id } = useParams();
  const { playTrack } = usePlayer();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadPlaylist = useCallback(async () => {
    try {
      const res = await playlistAPI.get(id);
      setPlaylist(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

  const removeSong = async (songId) => {
    try {
      await playlistAPI.removeSong(id, songId);
      loadPlaylist();
    } catch (e) {
      console.error(e);
    }
  };

  const playSong = (song) => {
    const track = {
      id: song.spotify_track_id,
      name: song.track_name,
      artists: [{ name: song.artist_name }],
      album: { name: song.album_name, images: [{ url: song.album_image }] },
      preview_url: song.preview_url,
      duration_ms: song.duration_ms
    };
    const trackList = playlist.songs.map(s => ({
      id: s.spotify_track_id, name: s.track_name, artists: [{ name: s.artist_name }],
      album: { name: s.album_name, images: [{ url: s.album_image }] },
      preview_url: s.preview_url, duration_ms: s.duration_ms
    }));
    playTrack(track, trackList);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="flex items-end gap-1 h-8"><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /></div>
    </div>
  );

  if (!playlist) return <div className="p-10 text-center text-muted-foreground">Playlist not found</div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-10">
      {/* Back button */}
      <button data-testid="back-to-library" onClick={() => navigate('/library')} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-6 transition-colors duration-200">
        <ArrowLeft className="w-4 h-4" /> Back to Library
      </button>

      {/* Header */}
      <div className="flex items-end gap-6 mb-8">
        <div className="w-48 h-48 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center overflow-hidden flex-shrink-0">
          {playlist.songs?.[0]?.album_image ? (
            <img src={playlist.songs[0].album_image} alt="" className="w-full h-full object-cover" />
          ) : (
            <Music className="w-16 h-16 text-primary/50" />
          )}
        </div>
        <div>
          <p className="font-clash text-xs tracking-widest uppercase text-primary mb-2">Playlist</p>
          <h1 className="font-syne font-extrabold text-4xl tracking-tight mb-2">{playlist.name}</h1>
          {playlist.description && <p className="text-sm text-muted-foreground mb-2">{playlist.description}</p>}
          <p className="text-sm text-zinc-400">{playlist.songs?.length || 0} songs</p>
        </div>
      </div>

      {/* Songs */}
      <div className="space-y-1">
        {playlist.songs?.map((song, idx) => (
          <div
            key={song.id}
            data-testid={`playlist-song-${song.spotify_track_id}`}
            className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors duration-200 group cursor-pointer"
            onClick={() => playSong(song)}
          >
            <span className="text-sm text-zinc-600 w-6 text-right group-hover:hidden">{idx + 1}</span>
            <Play className="w-4 h-4 text-white hidden group-hover:block w-6" />
            {song.album_image && <img src={song.album_image} alt="" className="w-10 h-10 rounded object-cover" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{song.track_name}</p>
              <p className="text-xs text-muted-foreground truncate">{song.artist_name} · {song.album_name}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {song.duration_ms ? `${Math.floor(song.duration_ms / 60000)}:${String(Math.floor((song.duration_ms % 60000) / 1000)).padStart(2, '0')}` : '--:--'}
            </p>
            <button
              data-testid={`remove-song-${song.id}`}
              onClick={(e) => { e.stopPropagation(); removeSong(song.id); }}
              className="p-1.5 rounded-full hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            >
              <Trash2 className="w-3.5 h-3.5 text-zinc-500 hover:text-destructive" />
            </button>
          </div>
        ))}
        {(!playlist.songs || playlist.songs.length === 0) && (
          <div className="text-center py-16">
            <Music className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-muted-foreground">This playlist is empty. Search for songs to add!</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
