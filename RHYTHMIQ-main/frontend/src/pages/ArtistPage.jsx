import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { spotifyAPI } from '@/lib/api';
import { usePlayer } from '@/lib/PlayerContext';
import { Play, Clock, Users } from 'lucide-react';
import { SongCard } from '@/components/SongCard';

export default function ArtistPage() {
  const { id } = useParams();
  const { playTrack } = usePlayer();
  const [artist, setArtist] = useState(null);
  const [topTracks, setTopTracks] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [artistRes, tracksRes, albumsRes, relatedRes] = await Promise.all([
          spotifyAPI.artist(id),
          spotifyAPI.artistTopTracks(id),
          spotifyAPI.artistAlbums(id),
          spotifyAPI.artistRelated(id)
        ]);
        setArtist(artistRes.data);
        setTopTracks(tracksRes.data?.tracks || []);
        setAlbums(albumsRes.data?.items || []);
        setRelated(relatedRes.data?.artists || []);
      } catch (e) {
        console.error('Artist load error', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="flex items-end gap-1 h-8"><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /></div>
    </div>
  );

  if (!artist) return <div className="p-10 text-center text-muted-foreground">Artist not found</div>;

  const imgUrl = artist.images?.[0]?.url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=800';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-8">
      {/* Hero */}
      <div className="relative h-80 overflow-hidden">
        <img src={imgUrl} alt={artist.name} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute bottom-0 left-0 p-6 md:p-10 z-10">
          <p className="font-clash text-xs tracking-widest uppercase text-primary mb-2">Artist</p>
          <h1 className="font-syne font-extrabold text-5xl md:text-6xl tracking-tight mb-3">{artist.name}</h1>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <span className="flex items-center gap-1"><Users className="w-4 h-4" />{artist.followers?.total?.toLocaleString()} followers</span>
            {artist.genres?.length > 0 && <span className="capitalize">{artist.genres.slice(0, 3).join(', ')}</span>}
          </div>
        </div>
      </div>

      <div className="p-6 md:p-10 space-y-10">
        {/* Top Tracks */}
        <section>
          <h2 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground mb-5">Popular</h2>
          <div className="space-y-1">
            {topTracks.slice(0, 10).map((track, idx) => (
              <div
                key={track.id}
                data-testid={`top-track-${track.id}`}
                onClick={() => playTrack(track, topTracks)}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors duration-200 cursor-pointer group"
              >
                <span className="text-sm text-zinc-600 w-6 text-right group-hover:hidden">{idx + 1}</span>
                <Play className="w-4 h-4 text-white hidden group-hover:block w-6" />
                <img src={track.album?.images?.[2]?.url || track.album?.images?.[0]?.url} alt="" className="w-10 h-10 rounded object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{track.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{track.album?.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">{Math.floor(track.duration_ms / 60000)}:{String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Albums */}
        {albums.length > 0 && (
          <section>
            <h2 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground mb-5">Discography</h2>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {albums.map((album) => (
                <a key={album.id} href={`/album/${album.id}`} className="flex-shrink-0 w-40 group">
                  <div className="rounded-xl overflow-hidden mb-2">
                    <img src={album.images?.[0]?.url} alt={album.name} className="w-40 h-40 object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <p className="text-sm font-medium truncate">{album.name}</p>
                  <p className="text-xs text-muted-foreground">{album.release_date?.split('-')[0]} · {album.album_type}</p>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Related Artists */}
        {related.length > 0 && (
          <section>
            <h2 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground mb-5">Fans Also Like</h2>
            <div className="flex gap-5 overflow-x-auto pb-4">
              {related.slice(0, 8).map((r) => (
                <a key={r.id} href={`/artist/${r.id}`} className="flex-shrink-0 text-center group">
                  <div className="w-28 h-28 rounded-full overflow-hidden mx-auto mb-2">
                    <img src={r.images?.[0]?.url} alt={r.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                  </div>
                  <p className="text-sm font-medium">{r.name}</p>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </motion.div>
  );
}
