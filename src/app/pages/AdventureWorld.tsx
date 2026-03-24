import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { useFamilyContext } from "../contexts/FamilyContext";
import { Sparkles, Map, User, TreePine, Award, ArrowLeft } from "lucide-react";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { toast } from "sonner";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

interface WorldZone {
  id: string;
  name: string;
  nameArabic: string;
  description: string;
  unlocked: boolean;
  progress: number;
  difficulty: string;
  color: string;
  icon: string;
  minLevel: number;
}

interface AdventureProfile {
  childId: string;
  avatarStyle: any;
  level: number;
  xp: number;
  title: string;
  barakahCoins: number;
  completedQuests: number;
  gardenProgress: number;
}

export function AdventureWorld() {
  const { accessToken } = useAuth();
  const { getCurrentChild, familyId } = useFamilyContext();
  const child = getCurrentChild();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AdventureProfile | null>(null);
  const [zones, setZones] = useState<WorldZone[]>([]);
  const [showAvatarCreator, setShowAvatarCreator] = useState(false);

  // Default world zones
  const defaultZones: WorldZone[] = [
    {
      id: "makkah",
      name: "Makkah",
      nameArabic: "مكة المكرمة",
      description: "Learn the stories of Prophet Ibrahim ﷺ and the sacred Kaaba",
      unlocked: true,
      progress: 0,
      difficulty: "beginner",
      color: "from-amber-500 to-orange-600",
      icon: "🕋",
      minLevel: 1
    },
    {
      id: "madinah",
      name: "Madinah",
      nameArabic: "المدينة المنورة",
      description: "Discover the life and teachings of Prophet Muhammad ﷺ",
      unlocked: false,
      progress: 0,
      difficulty: "beginner",
      color: "from-emerald-500 to-teal-600",
      icon: "🕌",
      minLevel: 3
    },
    {
      id: "quran-valley",
      name: "Quran Valley",
      nameArabic: "وادي القرآن",
      description: "Memorize beautiful ayahs and unlock Quranic wisdom",
      unlocked: false,
      progress: 0,
      difficulty: "intermediate",
      color: "from-blue-500 to-indigo-600",
      icon: "📖",
      minLevel: 5
    },
    {
      id: "desert-trials",
      name: "Desert of Trials",
      nameArabic: "صحراء الاختبارات",
      description: "Test your Islamic knowledge and character",
      unlocked: false,
      progress: 0,
      difficulty: "intermediate",
      color: "from-yellow-600 to-amber-700",
      icon: "🏜️",
      minLevel: 7
    },
    {
      id: "barakah-garden",
      name: "Barakah Garden",
      nameArabic: "حديقة البركة",
      description: "Your personal garden that grows with every good deed",
      unlocked: true,
      progress: 0,
      difficulty: "all",
      color: "from-green-500 to-emerald-600",
      icon: "🌺",
      minLevel: 1
    }
  ];

  useEffect(() => {
    loadAdventureData();
  }, [child, familyId, accessToken]);

  const loadAdventureData = async () => {
    if (!child || !familyId || !accessToken) return;

    try {
      setLoading(true);

      // Load adventure profile
      const profileRes = await fetch(
        `${API_BASE}/families/${familyId}/adventure/profile/${child.id}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile(profileData);

        // Check if avatar is created
        if (!profileData.avatarStyle || Object.keys(profileData.avatarStyle).length === 0) {
          setShowAvatarCreator(true);
        }
      } else {
        // Create default profile
        const defaultProfile = {
          childId: child.id,
          avatarStyle: {},
          level: 1,
          xp: 0,
          title: "Student",
          barakahCoins: child.currentPoints || 0,
          completedQuests: 0,
          gardenProgress: 0
        };
        setProfile(defaultProfile);
        setShowAvatarCreator(true);
      }

      // Load zones progress
      const zonesRes = await fetch(
        `${API_BASE}/families/${familyId}/adventure/zones/${child.id}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (zonesRes.ok) {
        const zonesData = await zonesRes.json();
        // Merge backend progress with our updated zone definitions
        const mergedZones = defaultZones.map(defaultZone => {
          const backendZone = zonesData.find((z: WorldZone) => z.id === defaultZone.id);
          return backendZone 
            ? { ...defaultZone, progress: backendZone.progress, unlocked: backendZone.unlocked }
            : defaultZone;
        });
        setZones(mergedZones);
      } else {
        setZones(defaultZones);
      }
    } catch (error) {
      console.error('Failed to load adventure data:', error);
      toast.error('Failed to load adventure world');
      setZones(defaultZones);
    } finally {
      setLoading(false);
    }
  };

  const handleZoneClick = (zone: WorldZone) => {
    if (!zone.unlocked) {
      toast.error(`Reach level ${zone.minLevel} to unlock ${zone.name}!`);
      return;
    }

    // Navigate to zone-specific pages
    const zoneRoutes: Record<string, string> = {
      'makkah': '/kid/adventure-zones/makkah',
      'madinah': '/kid/adventure-zones/madinah',
      'quran-valley': '/kid/adventure-zones/quran-valley',
      'desert-trials': '/kid/adventure-zones/desert-trials',
      'barakah-garden': '/kid/jannah-garden'
    };

    const route = zoneRoutes[zone.id];
    if (route) {
      navigate(route);
    } else {
      toast.error('This zone is coming soon!');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-amber-800">Loading your adventure...</p>
        </div>
      </div>
    );
  }

  if (showAvatarCreator) {
    return (
      <AvatarCreator
        childId={child?.id || ''}
        onComplete={(avatarData) => {
          setProfile(prev => prev ? { ...prev, avatarStyle: avatarData } : null);
          setShowAvatarCreator(false);
          toast.success('Your adventure character is ready!');
        }}
        onSkip={() => {
          setShowAvatarCreator(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-yellow-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white p-6 shadow-lg">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => navigate('/kid/home')}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-medium text-sm">Back to Dashboard</span>
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-1">Islamic Adventure World</h1>
              <p className="text-amber-100 text-sm">Choose your path of learning</p>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAvatarCreator(true)}
              className="bg-white/20 hover:bg-white/30 rounded-full p-3 transition-colors"
            >
              <User className="w-6 h-6" />
            </motion.button>
          </div>

          {/* Profile Stats Bar */}
          {profile && (
            <div className="mt-4 flex items-center gap-4 bg-white/10 backdrop-blur-sm rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-300" />
                <div>
                  <p className="text-xs text-amber-100">Level</p>
                  <p className="text-lg font-bold">{profile.level}</p>
                </div>
              </div>
              <div className="w-px h-10 bg-white/20" />
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-300" />
                <div>
                  <p className="text-xs text-amber-100">XP</p>
                  <p className="text-lg font-bold">{profile.xp}</p>
                </div>
              </div>
              <div className="w-px h-10 bg-white/20" />
              <div className="flex items-center gap-2">
                <span className="text-2xl">🪙</span>
                <div>
                  <p className="text-xs text-amber-100">Barakah Coins</p>
                  <p className="text-lg font-bold">{profile.barakahCoins}</p>
                </div>
              </div>
              <div className="flex-1" />
              <div className="text-right">
                <p className="text-xs text-amber-100">Title</p>
                <p className="text-sm font-semibold">{profile.title}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* World Map */}
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Map className="w-6 h-6 text-amber-700" />
          <h2 className="text-2xl font-bold text-amber-900">Explore the Lands</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {zones.map((zone, index) => (
            <motion.div
              key={zone.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <button
                onClick={() => handleZoneClick(zone)}
                disabled={!zone.unlocked}
                className={`
                  w-full text-left rounded-xl overflow-hidden shadow-lg
                  transform transition-all duration-300
                  ${zone.unlocked 
                    ? 'hover:scale-105 hover:shadow-2xl cursor-pointer' 
                    : 'opacity-60 cursor-not-allowed grayscale'
                  }
                `}
              >
                <div className={`bg-gradient-to-br ${zone.color} p-6 text-white relative`}>
                  {!zone.unlocked && (
                    <div className="absolute top-3 right-3 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1 text-xs">
                      🔒 Level {zone.minLevel}
                    </div>
                  )}
                  
                  <div className="flex items-start gap-4">
                    <div className="text-5xl">{zone.icon}</div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold mb-1">{zone.name}</h3>
                      <p className="text-sm opacity-90 mb-1">{zone.nameArabic}</p>
                      <p className="text-sm opacity-80">{zone.description}</p>
                    </div>
                  </div>

                  {zone.unlocked && zone.progress > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs opacity-80">Progress</span>
                        <span className="text-xs font-bold">{zone.progress}%</span>
                      </div>
                      <div className="w-full bg-white/20 rounded-full h-2">
                        <div
                          className="bg-white rounded-full h-2 transition-all duration-500"
                          style={{ width: `${zone.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </button>
            </motion.div>
          ))}
        </div>

        {/* Quick Access Cards */}
        <div className="mt-8 grid grid-cols-2 gap-4">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/kid/knowledge-quest')}
            className="bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-xl p-6 text-center shadow-lg hover:shadow-xl transition-shadow"
          >
            <div className="text-4xl mb-2">🧠</div>
            <h3 className="font-bold text-lg">Knowledge Quest</h3>
            <p className="text-xs opacity-80 mt-1">Answer questions & earn points</p>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/kid/challenges')}
            className="bg-gradient-to-br from-pink-500 to-rose-600 text-white rounded-xl p-6 text-center shadow-lg hover:shadow-xl transition-shadow"
          >
            <div className="text-4xl mb-2">⭐</div>
            <h3 className="font-bold text-lg">Daily Quests</h3>
            <p className="text-xs opacity-80 mt-1">Complete today's missions</p>
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// Avatar Creator Component
function AvatarCreator({ 
  childId, 
  onComplete,
  onSkip
}: { 
  childId: string; 
  onComplete: (avatar: any) => void;
  onSkip: () => void;
}) {
  const { accessToken } = useAuth();
  const { familyId } = useFamilyContext();

  const [avatar, setAvatar] = useState({
    gender: 'boy',
    skinTone: 'light',
    clothing: 'thobe-white',
    accessory: 'backpack',
    face: 'happy'
  });

  const genderOptions = [
    { value: 'boy', label: 'Boy', icon: '👦' },
    { value: 'girl', label: 'Girl', icon: '👧' }
  ];

  const skinTones = [
    { value: 'light', color: '#FFDAB9' },
    { value: 'medium', color: '#DEB887' },
    { value: 'tan', color: '#CD853F' },
    { value: 'dark', color: '#8B4513' }
  ];

  const clothingOptions = {
    boy: [
      { value: 'thobe-white', label: 'White Thobe', color: '#FFFFFF' },
      { value: 'thobe-blue', label: 'Blue Thobe', color: '#60A5FA' },
      { value: 'kurta-green', label: 'Green Kurta', color: '#34D399' },
      { value: 'casual', label: 'Casual', color: '#A78BFA' }
    ],
    girl: [
      { value: 'abaya-black', label: 'Black Abaya', color: '#1F2937' },
      { value: 'dress-pink', label: 'Pink Dress', color: '#F472B6' },
      { value: 'dress-blue', label: 'Blue Dress', color: '#60A5FA' },
      { value: 'casual', label: 'Casual', color: '#A78BFA' }
    ]
  };

  const accessories = [
    { value: 'none', label: 'None', icon: '🚫' },
    { value: 'backpack', label: 'Backpack', icon: '🎒' },
    { value: 'quran', label: 'Quran', icon: '📖' },
    { value: 'prayermat', label: 'Prayer Mat', icon: '🧘' },
    { value: 'kufi', label: 'Kufi Hat', icon: '🧢' }
  ];

  const handleSave = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/families/${familyId}/adventure/profile/${childId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ avatarStyle: avatar })
        }
      );

      if (response.ok) {
        onComplete(avatar);
      } else {
        toast.error('Failed to save avatar');
      }
    } catch (error) {
      console.error('Failed to save avatar:', error);
      toast.error('Failed to save avatar');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-100 to-pink-100 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-purple-900 mb-2">Create Your Character</h1>
            <p className="text-purple-600">Design your Islamic adventure hero!</p>
          </div>

          {/* Avatar Preview */}
          <div className="bg-gradient-to-br from-purple-200 to-pink-200 rounded-xl p-8 mb-8">
            <div className="w-48 h-48 mx-auto bg-white rounded-full flex items-center justify-center text-8xl shadow-lg">
              {avatar.gender === 'boy' ? '👦' : '👧'}
            </div>
          </div>

          {/* Customization Options */}
          <div className="space-y-6">
            {/* Gender */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Gender</label>
              <div className="grid grid-cols-2 gap-3">
                {genderOptions.map(option => (
                  <button
                    key={option.value}
                    onClick={() => setAvatar({ ...avatar, gender: option.value })}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      avatar.gender === option.value
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <div className="text-4xl mb-1">{option.icon}</div>
                    <div className="font-medium">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Skin Tone */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Skin Tone</label>
              <div className="flex gap-3">
                {skinTones.map(tone => (
                  <button
                    key={tone.value}
                    onClick={() => setAvatar({ ...avatar, skinTone: tone.value })}
                    className={`w-12 h-12 rounded-full border-4 transition-all ${
                      avatar.skinTone === tone.value
                        ? 'border-purple-500 scale-110'
                        : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: tone.color }}
                  />
                ))}
              </div>
            </div>

            {/* Clothing */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Clothing</label>
              <div className="grid grid-cols-2 gap-3">
                {clothingOptions[avatar.gender as keyof typeof clothingOptions].map(option => (
                  <button
                    key={option.value}
                    onClick={() => setAvatar({ ...avatar, clothing: option.value })}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      avatar.clothing === option.value
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <div
                      className="w-full h-12 rounded mb-2"
                      style={{ backgroundColor: option.color }}
                    />
                    <div className="text-sm font-medium">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Accessory */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Accessory</label>
              <div className="grid grid-cols-3 gap-3">
                {accessories.map(acc => (
                  <button
                    key={acc.value}
                    onClick={() => setAvatar({ ...avatar, accessory: acc.value })}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      avatar.accessory === acc.value
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <div className="text-3xl mb-1">{acc.icon}</div>
                    <div className="text-xs font-medium">{acc.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Save Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleSave}
            className="w-full mt-8 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-shadow"
          >
            Start My Adventure! 🚀
          </motion.button>

          {/* Skip Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onSkip}
            className="w-full mt-4 bg-gray-200 text-gray-700 font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-shadow"
          >
            Skip for Now
          </motion.button>
        </div>
      </div>
    </div>
  );
}