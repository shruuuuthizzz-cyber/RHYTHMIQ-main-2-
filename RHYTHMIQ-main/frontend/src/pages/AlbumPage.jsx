import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { spotifyAPI } from '@/lib/api';
import { usePlayer } from '@/lib/PlayerContext';
import { Play, Clock, Calendar } from 'lucide-react';

export default function AlbumPage() {
  const { id } = useParams();
  const { playTrack } = usePlayer();
  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    spotifyAPI.album(id)
      .then((res) => {
        setAlbum({
          ...res.data,
          tracks: {
            ...res.data?.tracks,
            items: res.data?.tracks?.items || [],
          },
        });
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="flex items-end gap-1 h-8"><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /></div>
    </div>
  );
  if (!album) return <div className="p-10 text-center text-muted-foreground">Album not found</div>;

  const tracks = album.tracks?.items || [];
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-8 p-6 md:p-10 items-end">
        <img
          src={album.images?.[0]?.url}
          alt={album.name}
          className="w-56 h-56 rounded-xl object-cover shadow-2xl shadow-black/50"
        />
        <div>
          <p className="font-clash text-xs tracking-widest uppercase text-primary mb-2">{album.album_type}</p>
          <h1 className="font-syne font-extrabold text-4xl md:text-5xl tracking-tight mb-3">{album.name}</h1>
          <div className="flex items-center gap-3 text-sm text-zinc-400 flex-wrap">
            <span className="font-medium text-white">{album.artists?.map(a => a.name).join(', ')}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{album.release_date}</span>
            <span>{tracks.length} songs</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{Math.floor(totalDuration / 60000)} min</span>
          </div>
        </div>
      </div>

      {/* Track List */}
      <div className="px-6 md:px-10">
        <div className="space-y-1">
          {tracks.map((track, idx) => (
            <div
              key={track.id}
              data-testid={`album-track-${track.id}`}
              onClick={() => {
                const fullTrack = { ...track, album: { name: album.name, images: album.images }, artists: track.artists };
                playTrack(fullTrack, tracks.map(t => ({ ...t, album: { name: album.name, images: album.images }, artists: t.artists })));
              }}
              className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors duration-200 cursor-pointer group"
            >
              <span className="text-sm text-zinc-600 w-6 text-right group-hover:hidden">{idx + 1}</span>
              <Play className="w-4 h-4 text-white hidden group-hover:block w-6" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{track.name}</p>
                <p className="text-xs text-muted-foreground truncate">{track.artists?.map(a => a.name).join(', ')}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {Math.floor(track.duration_ms / 60000)}:{String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}
              </p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
