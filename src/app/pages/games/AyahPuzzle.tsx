import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { ArrowLeft, Trophy, Star, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { useFamilyContext } from "../../contexts/FamilyContext";
import { projectId } from "../../../../utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

interface AyahPuzzle {
  id: string;
  surah: string;
  surahNumber: number;
  ayahNumber: number;
  ayahEnglish: string;
  ayahArabic: string;
  meaning: string;
  words: string[];
  difficulty: string;
}

const ayahPuzzles: AyahPuzzle[] = [
  {
    id: "surah-ikhlas",
    surah: "Al-Ikhlas",
    surahNumber: 112,
    ayahNumber: 1,
    ayahEnglish: "Say He is Allah the One",
    ayahArabic: "قُلْ هُوَ اللَّهُ أَحَدٌ",
    meaning: "Say: He is Allah, the One",
    words: ["Say", "He is", "Allah", "the One"],
    difficulty: "easy"
  },
  {
    id: "surah-nas",
    surah: "An-Nas",
    surahNumber: 114,
    ayahNumber: 1,
    ayahEnglish: "Say I seek refuge in the Lord of mankind",
    ayahArabic: "قُلْ أَعُوذُ بِرَبِّ النَّاسِ",
    meaning: "Say: I seek refuge in the Lord of mankind",
    words: ["Say", "I seek refuge", "in the Lord", "of mankind"],
    difficulty: "easy"
  },
  {
    id: "surah-fatiha",
    surah: "Al-Fatiha",
    surahNumber: 1,
    ayahNumber: 2,
    ayahEnglish: "All praise is due to Allah Lord of all the worlds",
    ayahArabic: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
    meaning: "All praise is due to Allah, Lord of all the worlds",
    words: ["All praise", "is due to Allah", "Lord", "of all the worlds"],
    difficulty: "medium"
  },
  {
    id: "surah-fatiha-2",
    surah: "Al-Fatiha",
    surahNumber: 1,
    ayahNumber: 3,
    ayahEnglish: "The Most Compassionate The Most Merciful",
    ayahArabic: "الرَّحْمَٰنِ الرَّحِيمِ",
    meaning: "The Most Compassionate, The Most Merciful",
    words: ["The Most Compassionate", "The Most Merciful"],
    difficulty: "easy"
  },
  {
    id: "ayat-kursi",
    surah: "Al-Baqarah",
    surahNumber: 2,
    ayahNumber: 255,
    ayahEnglish: "Allah there is no deity except Him the Ever Living the Sustainer of all",
    ayahArabic: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
    meaning: "Allah! There is no deity except Him, the Ever-Living, the Sustainer of all",
    words: ["Allah", "there is no deity", "except Him", "the Ever Living", "the Sustainer of all"],
    difficulty: "medium"
  }
];

export function AyahPuzzle() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { getCurrentChild, familyId } = useFamilyContext();
  const child = getCurrentChild();

  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [userSequence, setUserSequence] = useState<string[]>([]);
  const [availableWords, setAvailableWords] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);

  const currentPuzzle = ayahPuzzles[currentPuzzleIndex];

  useEffect(() => {
    resetPuzzle();
  }, [currentPuzzleIndex]);

  const resetPuzzle = () => {
    // Shuffle the words
    const shuffled = [...currentPuzzle.words].sort(() => Math.random() - 0.5);
    setAvailableWords(shuffled);
    setUserSequence([]);
    setShowResult(false);
  };

  const handleWordClick = (word: string, fromAvailable: boolean) => {
    if (showResult) return;

    if (fromAvailable) {
      // Add to user sequence
      setUserSequence([...userSequence, word]);
      setAvailableWords(availableWords.filter(w => w !== word));
    } else {
      // Remove from user sequence
      setUserSequence(userSequence.filter(w => w !== word));
      setAvailableWords([...availableWords, word]);
    }
  };

  const handleCheckAnswer = () => {
    if (userSequence.length !== currentPuzzle.words.length) {
      toast.error('Please arrange all the words first!');
      return;
    }

    setAttempts(attempts + 1);
    const correct = userSequence.join(' ') === currentPuzzle.words.join(' ');
    setIsCorrect(correct);
    setShowResult(true);

    if (correct) {
      const points = 150;
      setScore(score + points);
      awardPoints(points);

      setTimeout(() => {
        nextPuzzle();
      }, 3000);
    } else {
      setTimeout(() => {
        setShowResult(false);
      }, 2000);
    }
  };

  const nextPuzzle = () => {
    if (currentPuzzleIndex + 1 >= ayahPuzzles.length) {
      setGameComplete(true);
    } else {
      setCurrentPuzzleIndex(currentPuzzleIndex + 1);
      setShowResult(false);
    }
  };

  const awardPoints = async (points: number) => {
    if (!child || !familyId || !accessToken) return;

    try {
      await fetch(`${API_BASE}/families/${familyId}/adventure/award-xp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          childId: child.id,
          xp: points,
          source: 'ayah-puzzle'
        })
      });
    } catch (error) {
      console.error('Failed to award points:', error);
    }
  };

  const restartGame = () => {
    setCurrentPuzzleIndex(0);
    setScore(0);
    setAttempts(0);
    setGameComplete(false);
    resetPuzzle();
  };

  if (gameComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-indigo-700 flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl"
        >
          <div className="text-6xl mb-4">📖</div>
          <h1 className="text-3xl font-bold text-blue-900 mb-2">Mashallah!</h1>
          <p className="text-gray-600 mb-6">
            You completed all the Ayah puzzles!
          </p>

          <div className="bg-blue-50 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-center gap-8">
              <div>
                <Trophy className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Score</p>
                <p className="text-2xl font-bold text-blue-900">{score}</p>
              </div>
              <div>
                <Star className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                <p className="text-sm text-gray-600">XP Earned</p>
                <p className="text-2xl font-bold text-yellow-600">{score}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={restartGame}
              className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3 rounded-xl hover:shadow-lg transition-shadow"
            >
              Play Again
            </button>
            <button
              onClick={() => navigate('/kid/adventure-world')}
              className="flex-1 bg-gray-200 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-300 transition-colors"
            >
              Exit
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-500 to-indigo-600 text-white">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <button
          onClick={() => navigate('/kid/adventure-world')}
          className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </button>

        <div className="flex items-center gap-4">
          <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
            <span className="text-sm">Score: </span>
            <span className="font-bold text-lg">{score}</span>
          </div>
          <button
            onClick={resetPuzzle}
            className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors"
            title="Reset puzzle"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Game Area */}
      <div className="max-w-4xl mx-auto p-6">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span>Ayah {currentPuzzleIndex + 1} of {ayahPuzzles.length}</span>
            <span>{Math.round((currentPuzzleIndex / ayahPuzzles.length) * 100)}%</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div
              className="bg-white rounded-full h-2 transition-all duration-500"
              style={{ width: `${(currentPuzzleIndex / ayahPuzzles.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Puzzle Info */}
        <div className="bg-white rounded-2xl p-6 mb-6 text-center shadow-2xl">
          <div className="text-4xl mb-3">📖</div>
          <h2 className="text-xl font-bold text-blue-900 mb-1">
            Surah {currentPuzzle.surah}
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            ({currentPuzzle.surahNumber}:{currentPuzzle.ayahNumber})
          </p>
          <div className="bg-blue-50 rounded-xl p-4 mb-4">
            <p className="text-2xl text-blue-900 font-arabic mb-2">
              {currentPuzzle.ayahArabic}
            </p>
          </div>
          <p className="text-gray-600 text-sm">
            Arrange the words in the correct order
          </p>
        </div>

        {/* User Sequence Area */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 mb-6 min-h-32">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm opacity-80">Your Answer:</p>
            <span className="text-xs bg-white/20 px-2 py-1 rounded">
              {userSequence.length} / {currentPuzzle.words.length} words
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {userSequence.length === 0 ? (
              <p className="text-white/50 italic">Drag words here...</p>
            ) : (
              userSequence.map((word, index) => (
                <motion.div
                  key={index}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="bg-white text-blue-900 px-4 py-3 rounded-lg font-semibold cursor-pointer hover:bg-blue-100 transition-colors"
                  onClick={() => handleWordClick(word, false)}
                >
                  <span className="text-xs text-gray-500 mr-2">{index + 1}.</span>
                  {word}
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Available Words */}
        <div className="mb-6">
          <p className="text-sm opacity-80 mb-3">Available Words:</p>
          <div className="grid grid-cols-2 gap-3">
            {availableWords.map((word, index) => (
              <motion.button
                key={index}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleWordClick(word, true)}
                className="bg-white text-blue-900 p-4 rounded-xl font-semibold hover:bg-blue-50 transition-colors shadow-lg"
              >
                {word}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Check Answer Button */}
        {userSequence.length === currentPuzzle.words.length && !showResult && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCheckAnswer}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-shadow"
          >
            ✓ Check My Answer
          </motion.button>
        )}

        {/* Result Animation */}
        <AnimatePresence>
          {showResult && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mt-6 p-6 rounded-xl text-center shadow-2xl ${
                isCorrect ? 'bg-green-500' : 'bg-orange-500'
              }`}
            >
              <div className="text-6xl mb-2">{isCorrect ? '🎉' : '🤔'}</div>
              <h3 className="text-2xl font-bold mb-2">
                {isCorrect ? 'Perfect!' : 'Try again!'}
              </h3>
              {isCorrect && (
                <div className="mt-4">
                  <p className="font-semibold mb-2">Meaning:</p>
                  <p className="text-lg opacity-90">{currentPuzzle.meaning}</p>
                </div>
              )}
              {!isCorrect && (
                <p className="opacity-90">Review the order and try once more</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
