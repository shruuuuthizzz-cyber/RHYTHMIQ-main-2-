import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { dnaAPI } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { BarChart3, Zap, Share2, Music } from 'lucide-react';

const COLORS = ['#FF4D00', '#00F0FF', '#CCFF00', '#FF003C', '#A855F7', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#6366F1'];

export default function DNAPage() {
  const { user } = useAuth();
  const [dna, setDna] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDna = () => {
      setLoading(true);
      dnaAPI.get()
        .then(res => setDna(res.data))
        .catch(e => console.error(e))
        .finally(() => setLoading(false));
    };

    loadDna();
    window.addEventListener('focus', loadDna);
    return () => window.removeEventListener('focus', loadDna);
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="flex items-end gap-1 h-8"><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /></div>
      <span className="ml-4 text-muted-foreground">Analyzing your DNA...</span>
    </div>
  );

  const genreData = dna?.genre_breakdown ? Object.entries(dna.genre_breakdown).map(([name, value]) => ({ name, value })) : [];
  const moodData = dna?.mood_breakdown ? Object.entries(dna.mood_breakdown).map(([subject, value]) => ({ subject, value, fullMark: 100 })) : [];
  const topArtists = dna?.top_artists || [];
  const hasData = genreData.length > 0 || moodData.length > 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-10 space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="w-6 h-6 text-primary" />
          <h1 className="font-syne font-extrabold text-4xl tracking-tight">Music DNA</h1>
        </div>
        <p className="text-muted-foreground">Your listening fingerprint updates as you play, skip, like, and replay songs, {user?.username}</p>
      </div>

      {!hasData ? (
        <div className="text-center py-20">
          <div className="w-24 h-24 mx-auto rounded-full bg-white/5 flex items-center justify-center mb-6">
            <Music className="w-10 h-10 text-zinc-600" />
          </div>
          <h2 className="font-syne font-bold text-2xl mb-2">Your DNA is forming</h2>
          <p className="text-muted-foreground max-w-md mx-auto">Start liking, rating, and listening to songs. Your Music DNA will build over time, showing your unique taste breakdown.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Genre Breakdown - Pie Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/[0.03] border border-white/5 rounded-2xl p-6"
          >
            <h3 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground mb-6">Genre Breakdown</h3>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={genreData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={800}
                  >
                    {genreData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#121212', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    formatter={(val) => `${val}%`}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {genreData.slice(0, 6).map((g, idx) => (
                  <div key={g.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[idx % COLORS.length] }} />
                    <span className="text-sm capitalize truncate flex-1">{g.name}</span>
                    <span className="text-sm font-medium text-muted-foreground">{g.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Mood Radar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/[0.03] border border-white/5 rounded-2xl p-6"
          >
            <h3 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground mb-6">Mood Profile</h3>
            {moodData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={moodData}>
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#A1A1AA', fontSize: 12 }} />
                  <Radar
                    dataKey="value"
                    stroke="#FF4D00"
                    fill="#FF4D00"
                    fillOpacity={0.2}
                    animationBegin={0}
                    animationDuration={800}
                  />
                  <Tooltip
                    contentStyle={{ background: '#121212', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    formatter={(val) => `${val}%`}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-10">More listening data needed</p>
            )}
          </motion.div>

          {/* Top Artists */}
          {topArtists.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 lg:col-span-2"
            >
              <h3 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground mb-6">
                <Zap className="w-4 h-4 inline mr-2 text-accent" />Top Artists
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {topArtists.slice(0, 10).map((artist, idx) => (
                  <div key={artist.name} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02]">
                    <span className="text-xl font-bold text-zinc-600 w-6">#{idx + 1}</span>
                    <div>
                      <p className="text-sm font-medium truncate">{artist.name}</p>
                      <p className="text-xs text-muted-foreground">{artist.count} plays</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 lg:col-span-2"
          >
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-3xl font-syne font-bold text-primary">{dna?.total_tracks || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Tracks Analyzed</p>
              </div>
              <div>
                <p className="text-3xl font-syne font-bold text-secondary">{genreData.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Genres Detected</p>
              </div>
              <div>
                <p className="text-3xl font-syne font-bold text-accent">{dna?.total_listens || topArtists.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Listening Events</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
