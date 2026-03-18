import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { suggestionsAPI, spotifyAPI, userRecommendationsAPI } from '@/lib/api';
import { usePlayer } from '@/lib/PlayerContext';
import { useAuth } from '@/lib/AuthContext';
import { Clock, TrendingUp, Disc3 } from 'lucide-react';
import { SongCard } from '@/components/SongCard';

const greetings = {
  morning: { text: 'Good Morning', emoji: 'Rise & Grind' },
  afternoon: { text: 'Good Afternoon', emoji: 'Stay Focused' },
  evening: { text: 'Good Evening', emoji: 'Wind Down' },
  night: { text: 'Good Night', emoji: 'Vibe Out' },
  late_night: { text: 'Late Night', emoji: 'Night Owl Mode' }
};

const moodImages = {
  morning: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80&w=1200',
  afternoon: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80&w=1200',
  evening: 'https://images.unsplash.com/photo-1514525253440-b393452e8d26?auto=format&fit=crop&q=80&w=1200',
  night: 'https://images.unsplash.com/photo-1514525253440-b393452e8d26?auto=format&fit=crop&q=80&w=1200',
  late_night: 'https://images.unsplash.com/photo-1514525253440-b393452e8d26?auto=format&fit=crop&q=80&w=1200'
};

const normalizeAdminRecommendation = (recommendation) => ({
  id: recommendation.spotify_track_id || `admin-rec-${recommendation.id}`,
  name: recommendation.track_name || 'Unknown Track',
  artists: [{ name: recommendation.artist_name || 'Unknown Artist' }],
  album: {
    name: recommendation.album_name || 'Recommended for You',
    images: recommendation.album_image ? [{ url: recommendation.album_image }] : [],
  },
  preview_url: recommendation.preview_url || null,
  duration_ms: recommendation.duration_ms || null,
});

export default function HomePage() {
  const { user } = useAuth();
  const { playTrack } = usePlayer();
  const [todSuggestions, setTodSuggestions] = useState(null);
  const [newReleases, setNewReleases] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState({
    timeOfDay: true,
    newReleases: true,
    recommendations: true,
  });

  useEffect(() => {
    const load = async () => {
      setSectionLoading({
        timeOfDay: true,
        newReleases: true,
        recommendations: true,
      });

      const results = await Promise.allSettled([
          suggestionsAPI.timeOfDay(new Date().getHours(), 12),
          spotifyAPI.newReleases(12),
          userRecommendationsAPI.getMine(),
      ]);

      const [todRes, releasesRes, adminRecsRes] = results;

      if (todRes.status === 'fulfilled') {
        setTodSuggestions({ ...todRes.value.data, tracks: todRes.value.data?.tracks || [] });
      } else {
        console.error('Time of day load error', todRes.reason);
      }

      if (releasesRes.status === 'fulfilled') {
        setNewReleases(releasesRes.value.data?.tracks || []);
      } else {
        console.error('New releases load error', releasesRes.reason);
      }

      if (adminRecsRes.status === 'fulfilled') {
        const nextRecommendations = (adminRecsRes.value.data?.recommendations || []).map(normalizeAdminRecommendation);
        setRecommendations(nextRecommendations);
      } else {
        console.error('Admin recommendations load error', adminRecsRes.reason);
        setRecommendations([]);
      }

      setSectionLoading({
        timeOfDay: false,
        newReleases: false,
        recommendations: false,
      });
      setLoading(false);
    };

    load();
    const intervalId = window.setInterval(load, 30000);
    window.addEventListener('focus', load);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', load);
    };
  }, []);

  const period = todSuggestions?.period || 'morning';
  const greeting = greetings[period] || greetings.morning;
  const vibeTitles = {
    morning: 'Morning Vibes',
    afternoon: 'Afternoon Vibes',
    evening: 'Evening Vibes',
    night: 'Night Vibes',
    late_night: 'Late Night Vibes',
  };
  const vibeTitle = vibeTitles[period] || 'Daily Vibes';

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } }
  };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="p-6 md:p-10 space-y-10"
    >
      {/* Hero greeting */}
      <motion.div variants={container} initial="hidden" animate="show" className="relative rounded-2xl overflow-hidden h-64 md:h-72">
        <img src={moodImages[period]} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
        <div className="relative z-10 h-full flex flex-col justify-end p-8">
          <motion.p variants={item} className="font-clash font-medium text-sm tracking-widest uppercase text-primary mb-2">
            {greeting.emoji}
          </motion.p>
          <motion.h1 variants={item} className="font-syne font-extrabold text-4xl sm:text-5xl tracking-tight mb-2">
            {greeting.text}, {user?.username || 'Music Lover'}
          </motion.h1>
          <motion.p variants={item} className="text-zinc-400 text-base">
            {todSuggestions?.mood || 'Loading your vibe...'}
          </motion.p>
        </div>
      </motion.div>

      {/* Time-of-Day Tracks */}
      {todSuggestions?.tracks?.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-primary" />
              <h2 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground">
                {vibeTitle}
              </h2>
            </div>
          </div>
          <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {todSuggestions.tracks.slice(0, 12).map((track, i) => (
              <motion.div key={track.id || i} variants={item}>
                <SongCard track={track} onPlay={() => playTrack(track, todSuggestions.tracks)} />
              </motion.div>
            ))}
          </motion.div>
        </section>
      )}
      {!todSuggestions?.tracks?.length && sectionLoading.timeOfDay && (
        <section>
          <div className="flex items-center gap-3 mb-5">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground">{vibeTitle}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="rounded-xl border border-white/5 bg-white/[0.03] p-3 animate-pulse">
                <div className="aspect-square rounded-lg bg-white/10 mb-3" />
                <div className="h-4 bg-white/10 rounded mb-2" />
                <div className="h-3 bg-white/5 rounded w-2/3" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* New Releases */}
      {newReleases.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <Disc3 className="w-5 h-5 text-secondary" />
              <h2 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground">New Releases</h2>
            </div>
          </div>
          <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {newReleases.slice(0, 12).map((track, index) => (
              <motion.div key={track.id || index} variants={item}>
                <SongCard track={track} onPlay={() => playTrack(track, newReleases)} />
              </motion.div>
            ))}
          </motion.div>
        </section>
      )}
      {newReleases.length === 0 && sectionLoading.newReleases && (
        <section>
          <div className="flex items-center gap-3 mb-5">
            <Disc3 className="w-5 h-5 text-secondary" />
            <h2 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground">New Releases</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="rounded-xl border border-white/5 bg-white/[0.03] p-3 animate-pulse">
                <div className="aspect-square rounded-lg bg-white/10 mb-3" />
                <div className="h-4 bg-white/10 rounded mb-2" />
                <div className="h-3 bg-white/5 rounded w-2/3" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommended for You */}
      {recommendations.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-accent" />
              <h2 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground">Recommended for You</h2>
            </div>
          </div>
          <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {recommendations.slice(0, 12).map((track, i) => (
              <motion.div key={track.id || i} variants={item}>
                <SongCard track={track} onPlay={() => playTrack(track, recommendations)} />
              </motion.div>
            ))}
          </motion.div>
        </section>
      )}
      {recommendations.length === 0 && sectionLoading.recommendations && (
        <section>
          <div className="flex items-center gap-3 mb-5">
            <TrendingUp className="w-5 h-5 text-accent" />
            <h2 className="font-clash font-medium text-sm tracking-widest uppercase text-muted-foreground">Recommended for You</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="rounded-xl border border-white/5 bg-white/[0.03] p-3 animate-pulse">
                <div className="aspect-square rounded-lg bg-white/10 mb-3" />
                <div className="h-4 bg-white/10 rounded mb-2" />
                <div className="h-3 bg-white/5 rounded w-2/3" />
              </div>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-end gap-1 h-8">
            <div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" /><div className="sound-bar" />
          </div>
          <span className="ml-4 text-muted-foreground">Loading your vibe...</span>
        </div>
      )}
    </motion.div>
  );
}
