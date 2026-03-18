import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { spotifyAPI } from '@/lib/api';
import { usePlayer } from '@/lib/PlayerContext';
import { Search as SearchIcon, X, Music, User, Disc, Mic } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SongCard } from '@/components/SongCard';
import { useNavigate } from 'react-router-dom';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ tracks: [], artists: [], albums: [] });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const { playTrack } = usePlayer();
  const navigate = useNavigate();

  const debounceRef = React.useRef(null);

  const handleSearch = useCallback((val) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setResults({ tracks: [], artists: [], albums: [] });
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const [trackRes, artistRes, albumRes] = await Promise.all([
          spotifyAPI.search(val, 'track', 20),
          spotifyAPI.search(val, 'artist', 10),
          spotifyAPI.search(val, 'album', 10)
        ]);
        setResults({
          tracks: trackRes.data?.tracks?.items || [],
          artists: artistRes.data?.artists?.items || [],
          albums: albumRes.data?.albums?.items || []
        });
      } catch (e) {
        console.error('Search error', e);
      } finally {
        setLoading(false);
      }
    }, 400);
  }, []);

  const { supported: voiceSupported, listening: voiceListening, startListening } = useSpeechRecognition({
    onResult: (transcript) => {
      handleSearch(transcript);
    },
  });

  const quickSearches = ['Chill Vibes', 'Lo-Fi Beats', 'Party Mix', 'Acoustic', 'Hip Hop', '90s Rock', 'K-Pop', 'Jazz'];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-6 md:p-10"
    >
      {/* Search Input */}
      <div className="relative max-w-2xl mb-8">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <Input
          data-testid="search-input"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="What do you want to listen to?"
          className="pl-12 pr-24 h-14 rounded-full bg-white/5 border-white/10 text-lg placeholder:text-zinc-600 focus:ring-primary/50"
        />
        {voiceSupported && (
          <button
            type="button"
            data-testid="search-voice-btn"
            onClick={startListening}
            disabled={voiceListening}
            className={`absolute right-12 top-1/2 -translate-y-1/2 transition-colors ${
              voiceListening ? 'text-primary' : 'text-zinc-500 hover:text-white'
            }`}
            title={voiceListening ? 'Listening...' : 'Search by voice'}
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
        {query && (
          <button data-testid="search-clear" onClick={() => handleSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      {voiceSupported && voiceListening && (
        <p className="text-sm text-primary -mt-5 mb-6">Listening... say a track, artist, or album name.</p>
      )}

      {/* Quick searches */}
      {!searched && (
        <div className="mb-10">
          <h2 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground mb-4">Browse All</h2>
          <div className="flex flex-wrap gap-3">
            {quickSearches.map((term) => (
              <button
                key={term}
                data-testid={`quick-search-${term.toLowerCase().replace(/\s/g, '-')}`}
                onClick={() => handleSearch(term)}
                className="px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 hover:border-white/20 transition-colors duration-200"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-end gap-1 h-8">
            <div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" />
          </div>
          <span className="ml-4 text-muted-foreground">Searching...</span>
        </div>
      )}

      {/* Results */}
      {searched && !loading && (
        <Tabs defaultValue="tracks" className="space-y-6">
          <TabsList className="bg-white/5 border border-white/10 rounded-full p-1">
            <TabsTrigger data-testid="tab-tracks" value="tracks" className="rounded-full data-[state=active]:bg-white/10 px-6">
              <Music className="w-4 h-4 mr-2" />Tracks ({results.tracks.length})
            </TabsTrigger>
            <TabsTrigger data-testid="tab-artists" value="artists" className="rounded-full data-[state=active]:bg-white/10 px-6">
              <User className="w-4 h-4 mr-2" />Artists ({results.artists.length})
            </TabsTrigger>
            <TabsTrigger data-testid="tab-albums" value="albums" className="rounded-full data-[state=active]:bg-white/10 px-6">
              <Disc className="w-4 h-4 mr-2" />Albums ({results.albums.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tracks">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {results.tracks.map((track) => (
                <SongCard key={track.id} track={track} onPlay={() => playTrack(track, results.tracks)} />
              ))}
            </div>
            {results.tracks.length === 0 && <p className="text-center text-muted-foreground py-10">No tracks found</p>}
          </TabsContent>

          <TabsContent value="artists">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
              {results.artists.map((artist) => (
                <div
                  key={artist.id}
                  data-testid={`artist-result-${artist.id}`}
                  onClick={() => navigate(`/artist/${artist.id}`)}
                  className="group cursor-pointer text-center"
                >
                  <div className="relative mx-auto w-32 h-32 rounded-full overflow-hidden mb-3">
                    <img
                      src={artist.images?.[0]?.url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=200'}
                      alt={artist.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  </div>
                  <p className="font-medium text-sm">{artist.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{artist.type}</p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="albums">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {results.albums.map((album) => (
                <div
                  key={album.id}
                  data-testid={`album-result-${album.id}`}
                  onClick={() => navigate(`/album/${album.id}`)}
                  className="group cursor-pointer"
                >
                  <div className="relative rounded-xl overflow-hidden mb-3">
                    <img src={album.images?.[0]?.url} alt={album.name} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <p className="text-sm font-medium truncate">{album.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{album.artists?.map(a => a.name).join(', ')}</p>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </motion.div>
  );
}
