import React, { useState } from 'react';
import { Play, Heart, Star, Plus, MoreHorizontal, Info } from 'lucide-react';
import { likesAPI, ratingsAPI, playlistAPI } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SongDeepDive } from '@/components/SongDeepDive';

export const SongCard = ({ track, onPlay }) => {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [showDive, setShowDive] = useState(false);
  const [playlists, setPlaylists] = useState([]);

  const albumImage = track.album?.images?.[0]?.url || track.album?.images?.[1]?.url || '';
  const trackName = track.name || 'Unknown';
  const artistName = track.artists?.map(a => a.name).join(', ') || '';
  const artistId = track.artists?.[0]?.id;

  const handleLike = async (e) => {
    e.stopPropagation();
    try {
      const res = await likesAPI.toggle({
        spotify_track_id: track.id,
        track_name: trackName,
        artist_name: artistName,
        album_name: track.album?.name,
        album_image: albumImage,
        duration_ms: track.duration_ms,
        preview_url: track.preview_url
      });
      setLiked(res.data.liked);
    } catch (e) { /* ignore */ }
  };

  const loadPlaylists = async () => {
    try {
      const res = await playlistAPI.getAll();
      setPlaylists(res.data);
    } catch (e) { /* ignore */ }
  };

  const addToPlaylist = async (playlistId) => {
    try {
      await playlistAPI.addSong(playlistId, {
        spotify_track_id: track.id,
        track_name: trackName,
        artist_name: artistName,
        album_name: track.album?.name,
        album_image: albumImage,
        duration_ms: track.duration_ms,
        preview_url: track.preview_url
      });
    } catch (e) { /* ignore */ }
  };

  return (
    <>
      <div
        data-testid={`song-card-${track.id}`}
        className="group cursor-pointer"
      >
        <div className="relative rounded-xl overflow-hidden mb-3" onClick={onPlay}>
          {albumImage ? (
            <img src={albumImage} alt={trackName} loading="lazy" className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="w-full aspect-square bg-white/5 flex items-center justify-center">
              <Play className="w-8 h-8 text-zinc-600" />
            </div>
          )}
          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-300 shadow-lg shadow-primary/30">
              <Play className="w-5 h-5 text-black ml-0.5" />
            </div>
          </div>
          {/* Actions */}
          <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button data-testid={`like-${track.id}`} onClick={handleLike} className="w-7 h-7 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
              <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-primary text-primary' : 'text-white'}`} />
            </button>
            <DropdownMenu onOpenChange={(open) => { if (open) loadPlaylists(); }}>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="w-7 h-7 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
                  <MoreHorizontal className="w-3.5 h-3.5 text-white" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-white/10 min-w-[180px]">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><Plus className="w-3.5 h-3.5 mr-2" />Add to Playlist</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-card border-white/10">
                    {playlists.map(pl => (
                      <DropdownMenuItem key={pl.id} onClick={() => addToPlaylist(pl.id)}>{pl.name}</DropdownMenuItem>
                    ))}
                    {playlists.length === 0 && <DropdownMenuItem disabled>No playlists</DropdownMenuItem>}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => setShowDive(true)}>
                  <Info className="w-3.5 h-3.5 mr-2" />Song Details
                </DropdownMenuItem>
                {artistId && (
                  <DropdownMenuItem onClick={() => navigate(`/artist/${artistId}`)}>
                    Go to Artist
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-sm font-medium truncate" onClick={onPlay}>{trackName}</p>
        <p className="text-xs text-muted-foreground truncate">{artistName}</p>
      </div>

      {showDive && <SongDeepDive trackId={track.id} onClose={() => setShowDive(false)} />}
    </>
  );
};
