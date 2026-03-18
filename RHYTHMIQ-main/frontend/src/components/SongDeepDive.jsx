import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { songDiveAPI } from '@/lib/api';
import { X, Music, Zap, Activity, Disc3, Mic2, Piano, Drum, Guitar } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const instrumentIcons = {
  'Piano': Piano,
  'Guitar': Guitar,
  'Acoustic Guitar': Guitar,
  'Electric Guitar': Guitar,
  'Drums': Drum,
  'Vocals': Mic2,
};

export const SongDeepDive = ({ trackId, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!trackId) return;
    songDiveAPI.get(trackId)
      .then(res => setData(res.data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [trackId]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="bg-card border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          data-testid="song-deep-dive-modal"
        >
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex items-end gap-1 h-8"><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /></div>
            </div>
          ) : data ? (
            <div>
              {/* Header */}
              <div className="relative">
                {data.track?.album_image && (
                  <img src={data.track.album_image} alt="" className="w-full h-48 object-cover rounded-t-2xl" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent rounded-t-2xl" />
                <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute bottom-4 left-6">
                  <h2 className="font-syne font-bold text-xl">{data.track?.name}</h2>
                  <p className="text-sm text-zinc-400">{data.track?.artists?.join(', ')}</p>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <p className="text-2xl font-syne font-bold text-primary">{data.audio_features?.bpm || '—'}</p>
                    <p className="text-xs text-muted-foreground">BPM</p>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <p className="text-lg font-syne font-bold text-secondary">{data.audio_features?.key || '—'}</p>
                    <p className="text-xs text-muted-foreground">Key</p>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl p-3 text-center">
                    <p className="text-lg font-syne font-bold text-accent">{data.audio_features?.time_signature || '—'}</p>
                    <p className="text-xs text-muted-foreground">Time Sig</p>
                  </div>
                </div>

                {/* Audio Features Bars */}
                <div>
                  <h3 className="font-clash text-xs tracking-widest uppercase text-muted-foreground mb-4">Audio Features</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Energy', value: data.audio_features?.energy, color: 'bg-primary' },
                      { label: 'Danceability', value: data.audio_features?.danceability, color: 'bg-secondary' },
                      { label: 'Valence', value: data.audio_features?.valence, color: 'bg-accent' },
                      { label: 'Acousticness', value: data.audio_features?.acousticness, color: 'bg-blue-500' },
                      { label: 'Speechiness', value: data.audio_features?.speechiness, color: 'bg-purple-500' },
                      { label: 'Liveness', value: data.audio_features?.liveness, color: 'bg-green-500' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-24">{label}</span>
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${value || 0}%` }}
                            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className={`h-full rounded-full ${color}`}
                          />
                        </div>
                        <span className="text-xs text-zinc-500 w-8 text-right">{value || 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Instruments */}
                {data.instruments?.length > 0 && (
                  <div>
                    <h3 className="font-clash text-xs tracking-widest uppercase text-muted-foreground mb-4">Instruments Detected</h3>
                    <div className="flex flex-wrap gap-2">
                      {data.instruments.map((inst) => {
                        const Icon = instrumentIcons[inst] || Music;
                        return (
                          <span key={inst} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs">
                            <Icon className="w-3.5 h-3.5 text-primary" />
                            {inst}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mood Tags */}
                {data.moods?.length > 0 && (
                  <div>
                    <h3 className="font-clash text-xs tracking-widest uppercase text-muted-foreground mb-4">Mood</h3>
                    <div className="flex flex-wrap gap-2">
                      {data.moods.map((mood) => (
                        <span key={mood} className="px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
                          {mood}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Track Info */}
                <div className="text-xs text-zinc-500 space-y-1 pt-2 border-t border-white/5">
                  <p>Album: {data.track?.album}</p>
                  <p>Released: {data.track?.release_date}</p>
                  <p>Popularity: {data.track?.popularity}/100</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-10 text-center text-muted-foreground">Could not load song details</div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
