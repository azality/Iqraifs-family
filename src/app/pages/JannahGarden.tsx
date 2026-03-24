import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { ArrowLeft, Sparkles, TreePine, Flower2, Droplets } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useFamilyContext } from "../contexts/FamilyContext";
import { projectId } from "../../../utils/supabase/info";
import { toast } from "sonner";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

interface GardenItem {
  id: string;
  type: 'tree' | 'flower' | 'fountain' | 'stone';
  emoji: string;
  name: string;
  description: string;
  unlocked: boolean;
  requirement: string;
  position: { x: number; y: number };
}

interface GardenProgress {
  childId: string;
  level: number;
  unlockedItems: string[];
  totalGoodDeeds: number;
  prayersCompleted: number;
  quranMemorized: number;
  helpedOthers: number;
}

export function JannahGarden() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { getCurrentChild, familyId } = useFamilyContext();
  const child = getCurrentChild();

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<GardenProgress | null>(null);
  const [gardenItems, setGardenItems] = useState<GardenItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<GardenItem | null>(null);

  // Default garden items with various positions
  const defaultGardenItems: GardenItem[] = [
    {
      id: 'tree-1',
      type: 'tree',
      emoji: '🌳',
      name: 'Oak of Knowledge',
      description: 'Grows when you learn new Quranic verses',
      unlocked: false,
      requirement: 'Memorize 5 ayahs',
      position: { x: 20, y: 30 }
    },
    {
      id: 'tree-2',
      type: 'tree',
      emoji: '🌴',
      name: 'Palm of Peace',
      description: 'Blooms with every prayer you complete',
      unlocked: false,
      requirement: 'Complete 10 prayers',
      position: { x: 70, y: 25 }
    },
    {
      id: 'flower-1',
      type: 'flower',
      emoji: '🌸',
      name: 'Blossom of Kindness',
      description: 'Appears when you help someone',
      unlocked: false,
      requirement: 'Help 3 people',
      position: { x: 15, y: 60 }
    },
    {
      id: 'flower-2',
      type: 'flower',
      emoji: '🌺',
      name: 'Rose of Gratitude',
      description: 'Grows when you say Alhamdulillah',
      unlocked: false,
      requirement: 'Say Alhamdulillah 20 times',
      position: { x: 50, y: 65 }
    },
    {
      id: 'flower-3',
      type: 'flower',
      emoji: '🌻',
      name: 'Sunflower of Joy',
      description: 'Shines with your good deeds',
      unlocked: false,
      requirement: 'Complete 5 good deeds',
      position: { x: 80, y: 55 }
    },
    {
      id: 'fountain-1',
      type: 'fountain',
      emoji: '⛲',
      name: 'Fountain of Barakah',
      description: 'Flows with the blessings of charity',
      unlocked: false,
      requirement: 'Donate to sadaqah',
      position: { x: 45, y: 35 }
    },
    {
      id: 'stone-1',
      type: 'stone',
      emoji: '🪨',
      name: 'Stone of Patience',
      description: 'Appears when you show sabr',
      unlocked: false,
      requirement: 'Practice patience',
      position: { x: 30, y: 70 }
    },
    {
      id: 'tree-3',
      type: 'tree',
      emoji: '🌲',
      name: 'Pine of Perseverance',
      description: 'Grows with consistent good habits',
      unlocked: false,
      requirement: 'Maintain a 7-day streak',
      position: { x: 60, y: 40 }
    }
  ];

  useEffect(() => {
    loadGardenData();
  }, [child, familyId, accessToken]);

  const loadGardenData = async () => {
    if (!child || !familyId || !accessToken) return;

    try {
      setLoading(true);

      const response = await fetch(
        `${API_BASE}/families/${familyId}/adventure/garden/${child.id}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setProgress(data.progress);
        
        // Update garden items based on unlocked status
        const updatedItems = defaultGardenItems.map(item => ({
          ...item,
          unlocked: data.progress.unlockedItems.includes(item.id)
        }));
        setGardenItems(updatedItems);
      } else {
        // Create default progress
        const defaultProgress = {
          childId: child.id,
          level: 1,
          unlockedItems: ['flower-1'], // Start with one flower
          totalGoodDeeds: 0,
          prayersCompleted: 0,
          quranMemorized: 0,
          helpedOthers: 0
        };
        setProgress(defaultProgress);
        
        const updatedItems = defaultGardenItems.map(item => ({
          ...item,
          unlocked: item.id === 'flower-1'
        }));
        setGardenItems(updatedItems);
      }
    } catch (error) {
      console.error('Failed to load garden data:', error);
      toast.error('Failed to load your garden');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-100 to-emerald-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-green-800">Loading your garden...</p>
        </div>
      </div>
    );
  }

  const unlockedCount = gardenItems.filter(item => item.unlocked).length;
  const totalItems = gardenItems.length;
  const completionPercentage = Math.round((unlockedCount / totalItems) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-200 via-green-100 to-emerald-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate('/kid/adventure-world')}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">Back</span>
            </button>
            <div className="text-right">
              <p className="text-sm text-green-100">Garden Level</p>
              <p className="text-2xl font-bold">{progress?.level || 1}</p>
            </div>
          </div>

          <h1 className="text-3xl font-bold mb-2">Your Barakah Garden 🌺</h1>
          <p className="text-green-100 text-sm mb-4">
            Every good deed makes your garden grow!
          </p>

          {/* Progress Bar */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="flex justify-between text-sm mb-2">
              <span>Garden Progress</span>
              <span>{completionPercentage}% Complete</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-3">
              <div
                className="bg-white rounded-full h-3 transition-all duration-500"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-green-100">
              <span>{unlockedCount} items unlocked</span>
              <span>{totalItems - unlockedCount} items to discover</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-4xl mx-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-3xl mb-1">🤲</div>
            <p className="text-2xl font-bold text-green-900">{progress?.prayersCompleted || 0}</p>
            <p className="text-xs text-gray-600">Prayers</p>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-3xl mb-1">📖</div>
            <p className="text-2xl font-bold text-blue-900">{progress?.quranMemorized || 0}</p>
            <p className="text-xs text-gray-600">Ayahs</p>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-3xl mb-1">💝</div>
            <p className="text-2xl font-bold text-pink-900">{progress?.helpedOthers || 0}</p>
            <p className="text-xs text-gray-600">Helped</p>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-3xl mb-1">⭐</div>
            <p className="text-2xl font-bold text-yellow-900">{progress?.totalGoodDeeds || 0}</p>
            <p className="text-xs text-gray-600">Good Deeds</p>
          </div>
        </div>

        {/* Garden Visualization */}
        <div className="bg-gradient-to-b from-green-300 to-green-400 rounded-2xl shadow-2xl overflow-hidden mb-6 relative h-96">
          {/* Sky background */}
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-sky-300 to-transparent"></div>
          
          {/* Sun */}
          <div className="absolute top-4 right-4 w-12 h-12 bg-yellow-300 rounded-full shadow-lg animate-pulse"></div>

          {/* Ground */}
          <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-b from-green-400 to-green-600"></div>

          {/* Garden Items */}
          {gardenItems.map((item) => (
            <motion.div
              key={item.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: item.unlocked ? 1 : 0.3, 
                opacity: item.unlocked ? 1 : 0.3 
              }}
              transition={{ duration: 0.5 }}
              className={`absolute cursor-pointer transform transition-transform hover:scale-110 ${
                !item.unlocked ? 'grayscale' : ''
              }`}
              style={{
                left: `${item.position.x}%`,
                top: `${item.position.y}%`,
              }}
              onClick={() => setSelectedItem(item)}
            >
              <div className="text-6xl filter drop-shadow-lg">
                {item.unlocked ? item.emoji : '🔒'}
              </div>
            </motion.div>
          ))}

          {/* Grass blades decoration */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-around items-end h-16 opacity-60">
            {[...Array(15)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-green-700 rounded-t"
                style={{ height: `${Math.random() * 60 + 20}px` }}
              />
            ))}
          </div>
        </div>

        {/* Item Details Modal */}
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-6 shadow-2xl"
          >
            <div className="flex items-start gap-4">
              <div className="text-6xl">{selectedItem.emoji}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-2xl font-bold text-gray-900">{selectedItem.name}</h3>
                  {selectedItem.unlocked ? (
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                      Unlocked ✓
                    </span>
                  ) : (
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                      Locked 🔒
                    </span>
                  )}
                </div>
                <p className="text-gray-600 mb-3">{selectedItem.description}</p>
                {!selectedItem.unlocked && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm font-semibold text-yellow-900 mb-1">
                      How to unlock:
                    </p>
                    <p className="text-sm text-yellow-800">{selectedItem.requirement}</p>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelectedItem(null)}
              className="mt-4 w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 rounded-lg transition-colors"
            >
              Close
            </button>
          </motion.div>
        )}

        {/* Encouragement Message */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-6 text-white text-center">
          <Sparkles className="w-8 h-8 mx-auto mb-3" />
          <h3 className="text-xl font-bold mb-2">Keep Growing! 🌱</h3>
          <p className="text-sm opacity-90">
            Every prayer, every ayah, every kind act makes your Jannah Garden more beautiful.
            May Allah accept your good deeds!
          </p>
        </div>
      </div>
    </div>
  );
}