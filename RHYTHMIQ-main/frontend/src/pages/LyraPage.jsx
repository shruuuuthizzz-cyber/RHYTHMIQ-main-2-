import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { lyraAPI, spotifyAPI, likesAPI, playlistAPI } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { usePlayer } from '@/lib/PlayerContext';
import { Send, Sparkles, Mic, Music, Heart, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

export default function LyraPage() {
  const { user } = useAuth();
  const { playTrack, setQueue, currentTrack, queue, isPlaying, progress, duration, volume, shuffle, repeat, setShuffle, setRepeat, togglePlay, playNext, playPrev, seekTo, setVolume, formatTime, requiresPlaybackGesture, startCurrentTrackAudio } = usePlayer();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [provider, setProvider] = useState('local');
  const [playerOpen, setPlayerOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const bottomRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    lyraAPI.history(50)
      .then(res => { setMessages((res.data || []).map(message => ({ ...message, tracks: [] }))); setLoaded(true); })
      .catch(() => setLoaded(true));
    lyraAPI.config()
      .then(res => setProvider(res.data?.provider || 'local'))
      .catch(() => setProvider('local'));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!currentTrack?.id) {
      setLiked(false);
      return;
    }

    likesAPI.check(currentTrack.id)
      .then(res => setLiked(res.data.liked))
      .catch(() => setLiked(false));
  }, [currentTrack]);

  const createMessageId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const normalizeTracks = useCallback((tracks = []) => {
    const seen = new Set();
    return tracks.reduce((acc, track) => {
      const normalized = track?.id ? track : {
        id: track?.spotify_track_id,
        name: track?.track_name,
        artists: [{ name: track?.artist_name || 'Unknown Artist' }],
        album: {
          name: track?.album_name,
          images: [{ url: track?.album_image || '' }],
        },
        preview_url: track?.preview_url,
        duration_ms: track?.duration_ms,
        artist_name: track?.artist_name,
        album_image: track?.album_image,
      };
      const key = normalized?.id;
      if (!key || seen.has(key)) {
        return acc;
      }
      seen.add(key);
      acc.push(normalized);
      return acc;
    }, []);
  }, []);

  const appendAssistantMessage = useCallback((content, tracks = []) => {
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content,
        tracks: normalizeTracks(tracks),
        id: createMessageId(),
      },
    ]);
  }, [normalizeTracks]);

  const buildQueueFromTrack = useCallback(async (seedTrack, seedMatches = []) => {
    const artistId = seedTrack?.artists?.[0]?.id;
    const artistName = seedTrack?.artists?.map((artist) => artist.name).join(', ') || seedTrack?.artist_name || '';

    const [topTracksRes, recsRes] = await Promise.all([
      artistId ? spotifyAPI.artistTopTracks(artistId).catch(() => null) : Promise.resolve(null),
      spotifyAPI.recommendations({
        query: [seedTrack?.name || seedTrack?.track_name || '', artistName, 'songs like this'].filter(Boolean).join(' '),
        limit: 12,
      }).catch(() => null),
    ]);

    const topTracks = normalizeTracks(topTracksRes?.data?.tracks || []);
    const recommendedTracks = normalizeTracks(recsRes?.data?.tracks || []);

    return normalizeTracks([
      seedTrack,
      ...seedMatches,
      ...topTracks,
      ...recommendedTracks,
    ]).slice(0, 20);
  }, [normalizeTracks]);

  const playRequestedTrack = useCallback(async (query, announce = true) => {
    if (!query?.trim()) {
      return false;
    }

    try {
      const res = await spotifyAPI.search(query, 'track', 10);
      const searchMatches = normalizeTracks(res.data?.tracks?.items || []);
      if (searchMatches.length === 0) {
        if (announce) {
          appendAssistantMessage(`I couldn't find "${query}" yet. Try saying the song name with the artist too.`);
        }
        return false;
      }

      const selectedTrack = searchMatches[0];
      const smartQueue = await buildQueueFromTrack(selectedTrack, searchMatches.slice(1));
      setQueue(smartQueue);
      playTrack(selectedTrack, smartQueue);
      setPlayerOpen(true);

      if (announce) {
        const artistName = selectedTrack.artists?.map((artist) => artist.name).join(', ') || 'Unknown Artist';
        appendAssistantMessage(
          `Playing ${selectedTrack.name} by ${artistName}. I also queued similar tracks for you.`,
          smartQueue.slice(0, 8),
        );
      }
      return true;
    } catch (error) {
      console.error('Voice search failed', error);
      if (announce) {
        appendAssistantMessage('I hit a snag while trying to play that. Try again in a second.');
      }
      return false;
    }
  }, [appendAssistantMessage, buildQueueFromTrack, normalizeTracks, playTrack, setQueue]);

  const sendLyraMessage = useCallback(async (rawText) => {
    const text = rawText?.trim();
    if (!text || sending) {
      return;
    }

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text, id: createMessageId(), tracks: [] }]);
    const playMatch = text.match(/^(?:please\s+)?play\s+(.+)/i);

    setSending(true);
    try {
      if (playMatch?.[1]) {
        await playRequestedTrack(playMatch[1].trim());
        return;
      }

      const res = await lyraAPI.chat(text);
      appendAssistantMessage(res.data?.response || "Here's something you can play next.", res.data?.tracks || []);
    } catch (error) {
      appendAssistantMessage("Hmm, I hit a snag. Try again?");
    } finally {
      setSending(false);
    }
  }, [appendAssistantMessage, playRequestedTrack, sending]);

  const handleVoiceResult = useCallback((transcript) => {
    setInput(transcript);
    void sendLyraMessage(transcript);
  }, [sendLyraMessage]);

  const {
    supported: voiceSupported,
    listening: voiceListening,
    startListening: startVoiceListening,
  } = useSpeechRecognition({ onResult: handleVoiceResult });

  const addCurrentTrackToPlaylist = async (playlistId) => {
    if (!currentTrack) return;

    try {
      await playlistAPI.addSong(playlistId, {
        spotify_track_id: currentTrack.id,
        track_name: currentTrack.name || currentTrack.track_name,
        artist_name: currentTrack.artists?.map((a) => a.name).join(', ') || currentTrack.artist_name,
        album_name: currentTrack.album?.name,
        album_image: currentTrack.album?.images?.[0]?.url || currentTrack.album_image,
        duration_ms: currentTrack.duration_ms,
        preview_url: currentTrack.preview_url,
      });
    } catch (e) {
      console.error('Add to playlist error', e);
    }
  };

  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      const res = await playlistAPI.create({ name: newPlaylistName.trim() });
      setNewPlaylistName('');
      setCreateDialogOpen(false);
      if (res.data?.id) {
        await addCurrentTrackToPlaylist(res.data.id);
      }
    } catch (e) {
      console.error('Create playlist error', e);
    }
  };

  const toggleLike = async () => {
    if (!currentTrack?.id) return;

    try {
      const res = await likesAPI.toggle({
        spotify_track_id: currentTrack.id,
        track_name: currentTrack.name || currentTrack.track_name,
        artist_name: currentTrack.artists?.map((a) => a.name).join(', ') || currentTrack.artist_name,
        album_name: currentTrack.album?.name,
        album_image: currentTrack.album?.images?.[0]?.url || currentTrack.album_image,
        duration_ms: currentTrack.duration_ms,
        preview_url: currentTrack.preview_url,
      });
      setLiked(res.data.liked);
    } catch (e) {
      console.error('Toggle like error', e);
    }
  };

  const suggestions = [
    'Hi LYRA',
    'Play Tum Hi Ho',
    "I'm feeling melancholic today",
    'Give me a chill evening vibe',
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-[calc(100vh-6rem)] flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="font-syne font-bold text-xl">LYRA</h1>
              <p className="text-xs text-muted-foreground">Your AI music companion · {provider}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="lyra-voice-btn"
              onClick={startVoiceListening}
              disabled={!voiceSupported || voiceListening || sending}
              className="flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-2 text-xs font-medium transition-colors duration-200 hover:bg-white/10 disabled:opacity-40"
            >
              <Mic className="w-4 h-4" />
              <span>{voiceListening ? 'Listening...' : 'Voice'} </span>
            </button>
            <button
              data-testid="lyra-player-open-btn"
              onClick={() => setPlayerOpen(true)}
              className="flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-2 text-xs font-medium transition-colors duration-200 hover:bg-white/10"
            >
              <Music className="w-4 h-4" />
              <span>Player</span>
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-6 py-4">
        {messages.length === 0 && loaded && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-6">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-syne font-bold text-2xl mb-2">Hey {user?.username}!</h2>
            <p className="text-muted-foreground text-center max-w-md mb-8">
              I'm LYRA, your music-native AI. I know your taste, mood, and listening patterns. Ask me anything about music.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg">
              {suggestions.map((s) => (
                <button
                  key={s}
                  data-testid={`lyra-suggestion-${s.split(' ').slice(0, 3).join('-').toLowerCase()}`}
                  onClick={() => { void sendLyraMessage(s); }}
                  className="text-left p-3 rounded-xl bg-white/[0.03] border border-white/5 text-sm text-zinc-300 hover:bg-white/[0.06] hover:border-white/10 transition-colors duration-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.map((msg, idx) => (
            <motion.div
              key={msg.id || idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-black" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-primary/20 border border-primary/30'
                  : 'bg-white/[0.04] border border-white/5'
              }`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                {msg.role === 'assistant' && msg.tracks?.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {normalizeTracks(msg.tracks).slice(0, 6).map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => {
                          const playableTracks = normalizeTracks(msg.tracks);
                          setQueue(playableTracks);
                          playTrack(track, playableTracks);
                          setPlayerOpen(true);
                        }}
                        className="w-full rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 px-3 py-2 text-left transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={track.album?.images?.[0]?.url || track.album_image || 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&q=80&w=200'}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{track.name || track.track_name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {track.artists?.map((artist) => artist.name).join(', ') || track.artist_name}
                            </p>
                          </div>
                          <Music className="w-4 h-4 text-primary flex-shrink-0" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-xs font-bold">
                  {user?.username?.[0]?.toUpperCase()}
                </div>
              )}
            </motion.div>
          ))}
          {sending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-black" />
              </div>
              <div className="bg-white/[0.04] border border-white/5 rounded-2xl px-4 py-3">
                <div className="flex items-end gap-1 h-5">
                  <div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-white/5 flex-shrink-0">
        {!voiceSupported && (
          <p className="max-w-3xl mx-auto mb-3 text-xs text-muted-foreground">
            Voice input is not available in this browser. You can still type requests like <span className="text-primary">play tum hi ho</span>.
          </p>
        )}
        <div className="max-w-3xl mx-auto flex gap-3">
          <Input
            data-testid="lyra-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void sendLyraMessage(input)}
            placeholder="Ask LYRA anything about music..."
            className="flex-1 h-12 rounded-full bg-white/5 border-white/10 px-5 placeholder:text-zinc-600 focus:ring-primary/50"
            disabled={sending}
          />
          <button
            data-testid="lyra-send-btn"
            onClick={() => void sendLyraMessage(input)}
            disabled={sending || !input.trim()}
            className="w-12 h-12 rounded-full bg-primary text-black flex items-center justify-center hover:opacity-90 transition-opacity duration-200 disabled:opacity-40"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      <Dialog open={playerOpen} onOpenChange={setPlayerOpen}>
        <DialogContent className="m-0 h-full w-full max-w-none rounded-none p-0">
          <div className="h-full flex flex-col bg-black">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <DialogTitle className="text-lg font-semibold">Now Playing</DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="rounded-full bg-white/5 border-white/10 text-xs text-white hover:bg-white/10"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Create Playlist
                </Button>
                <DialogClose className="text-zinc-200 hover:text-white" />
              </div>
            </div>

            {/* Big player area */}
            <div className="p-4 border-b border-white/10">
              {currentTrack ? (
                <div className="grid grid-cols-1 md:grid-cols-[4rem,1fr,auto] gap-4 items-center">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-white/5">
                    <img
                      src={currentTrack.album?.images?.[0]?.url || currentTrack.album_image || ''}
                      alt={currentTrack.name || currentTrack.track_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-semibold truncate">{currentTrack.name || currentTrack.track_name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {currentTrack.artists?.map((a) => a.name).join(', ') || currentTrack.artist_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      data-testid="lyra-like-btn"
                      onClick={toggleLike}
                      className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                    >
                      <Heart className={`w-4 h-4 ${liked ? 'fill-primary text-primary' : 'text-white'}`} />
                      {liked ? 'Liked' : 'Like'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">No track playing yet. Use Voice AI to start something.</p>
              )}

              {currentTrack && (
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setShuffle(!shuffle)}
                        className={`text-xs rounded-full p-2 ${shuffle ? 'bg-primary text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                      >
                        Shuffle
                      </button>
                      <button
                        onClick={playPrev}
                        className="text-xs rounded-full bg-white/5 px-3 py-2 hover:bg-white/10"
                      >
                        Prev
                      </button>
                      <button
                        onClick={togglePlay}
                        className="text-xs rounded-full bg-primary px-4 py-2 text-black hover:opacity-90"
                      >
                        {isPlaying ? 'Pause' : 'Play'}
                      </button>
                      <button
                        onClick={playNext}
                        className="text-xs rounded-full bg-white/5 px-3 py-2 hover:bg-white/10"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
                        className={`text-xs rounded-full p-2 ${repeat !== 'off' ? 'bg-primary text-black' : 'bg-white/5 text-white hover:bg-white/10'}`}
                      >
                        {repeat === 'one' ? 'Repeat 1' : repeat === 'all' ? 'Repeat All' : 'Repeat'}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatTime(progress)}</span>
                      <span>/</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Slider
                      value={[progress]}
                      max={duration || 30}
                      step={0.1}
                      onValueChange={([v]) => seekTo(v)}
                      className="w-full"
                    />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Volume</span>
                    <Slider
                      value={[volume * 100]}
                      max={100}
                      step={1}
                      onValueChange={([v]) => setVolume(v / 100)}
                      className="flex-1"
                    />
                    <button
                      onClick={() => setVolume(volume === 0 ? 0.7 : 0)}
                      className="text-xs rounded-full bg-white/5 px-3 py-2 hover:bg-white/10"
                    >
                      {volume === 0 ? 'Unmute' : 'Mute'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto p-4">
              {queue.length === 0 ? (
                <p className="text-sm text-zinc-400">No queued tracks yet. Use Voice AI to play a song.</p>
              ) : (
                <div className="space-y-2">
                  {queue.map((track, index) => (
                    <button
                      key={track.id || `${track.name}-${index}`}
                      onClick={() => playTrack(track, queue)}
                      className={`w-full text-left rounded-lg px-4 py-3 transition-colors duration-200 ${
                        currentTrack?.id === track.id ? 'bg-white/10' : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{track.name || track.track_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {track.artists?.map((a) => a.name).join(', ') || track.artist_name}
                          </p>
                        </div>
                        <span className="text-xs text-zinc-400">{index + 1}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
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
                Create and Add Current Track
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Dialog>
    </motion.div>
  );
}
