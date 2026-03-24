import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { Sparkles, ArrowLeft, Trophy, Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { useFamilyContext } from "../../contexts/FamilyContext";
import { projectId } from "../../../../utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

interface DuaChallenge {
  id: string;
  scenario: string;
  scenarioArabic: string;
  correctDua: string;
  correctDuaArabic: string;
  transliteration: string;
  meaning: string;
  words: string[];
  image: string;
}

const duaChallenges: DuaChallenge[] = [
  {
    id: "before-eating",
    scenario: "You're about to eat your meal",
    scenarioArabic: "أنت على وشك أن تأكل",
    correctDua: "Bismillah",
    correctDuaArabic: "بِسْمِ اللَّهِ",
    transliteration: "Bismillah",
    meaning: "In the name of Allah",
    words: ["Bismillah", "Alhamdulillah", "SubhanAllah", "Allahu Akbar"],
    image: "food meal"
  },
  {
    id: "after-eating",
    scenario: "You just finished eating",
    scenarioArabic: "لقد انتهيت من الأكل",
    correctDua: "Alhamdulillah",
    correctDuaArabic: "الْحَمْدُ لِلَّهِ",
    transliteration: "Alhamdulillah",
    meaning: "All praise is for Allah",
    words: ["Alhamdulillah", "SubhanAllah", "Bismillah", "Allahu Akbar"],
    image: "happy child eating"
  },
  {
    id: "entering-home",
    scenario: "You're entering your home",
    scenarioArabic: "أنت تدخل منزلك",
    correctDua: "Bismillah walajna wa bismillahi kharajna",
    correctDuaArabic: "بِسْمِ اللَّهِ وَلَجْنَا وَبِسْمِ اللَّهِ خَرَجْنَا",
    transliteration: "Bismillah walajna wa bismillahi kharajna",
    meaning: "In the name of Allah we enter and in the name of Allah we leave",
    words: ["Bismillah walajna", "wa bismillahi kharajna", "Alhamdulillah", "SubhanAllah"],
    image: "house entrance door"
  },
  {
    id: "before-sleep",
    scenario: "You're going to sleep",
    scenarioArabic: "أنت ذاهب للنوم",
    correctDua: "Bismika Allahumma amutu wa ahya",
    correctDuaArabic: "بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا",
    transliteration: "Bismika Allahumma amutu wa ahya",
    meaning: "In Your name O Allah, I die and I live",
    words: ["Bismika Allahumma", "amutu wa ahya", "Alhamdulillah", "SubhanAllah"],
    image: "child sleeping bed"
  },
  {
    id: "waking-up",
    scenario: "You just woke up",
    scenarioArabic: "لقد استيقظت للتو",
    correctDua: "Alhamdulillahil ladhi ahyana",
    correctDuaArabic: "الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا",
    transliteration: "Alhamdulillahil ladhi ahyana",
    meaning: "All praise is to Allah who gave us life after death",
    words: ["Alhamdulillahil ladhi ahyana", "Bismillah", "SubhanAllah", "Allahu Akbar"],
    image: "sunrise morning"
  }
];

export function DuaSpellCasting() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { getCurrentChild, familyId } = useFamilyContext();
  const child = getCurrentChild();

  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  const currentChallenge = duaChallenges[currentChallengeIndex];

  useEffect(() => {
    if (currentChallenge) {
      loadScenarioImage();
    }
  }, [currentChallengeIndex]);

  const loadScenarioImage = async () => {
    // In production, you'd use unsplash_tool or actual images
    setImageUrl(`https://images.unsplash.com/photo-1495195134817-aeb325a55b65?w=400`);
  };

  const handleWordClick = (word: string) => {
    if (showResult) return;
    
    // Check if clicking on already selected word (to deselect)
    if (selectedWords.includes(word)) {
      setSelectedWords(selectedWords.filter(w => w !== word));
      return;
    }

    const newSelected = [...selectedWords, word];
    setSelectedWords(newSelected);

    // Check if the dua is complete
    const selectedDua = newSelected.join(" ");
    if (selectedDua === currentChallenge.correctDua) {
      handleCorrectAnswer();
    } else if (newSelected.length >= currentChallenge.correctDua.split(" ").length) {
      handleWrongAnswer();
    }
  };

  const handleCorrectAnswer = () => {
    setIsCorrect(true);
    setShowResult(true);
    setScore(score + 100);

    // Award points to child
    awardPoints(100);

    setTimeout(() => {
      nextChallenge();
    }, 2000);
  };

  const handleWrongAnswer = () => {
    setIsCorrect(false);
    setShowResult(true);
    setLives(lives - 1);

    if (lives - 1 <= 0) {
      setTimeout(() => {
        setGameComplete(true);
      }, 2000);
    } else {
      setTimeout(() => {
        setSelectedWords([]);
        setShowResult(false);
      }, 1500);
    }
  };

  const nextChallenge = () => {
    if (currentChallengeIndex + 1 >= duaChallenges.length) {
      setGameComplete(true);
    } else {
      setCurrentChallengeIndex(currentChallengeIndex + 1);
      setSelectedWords([]);
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
          source: 'dua-spell-casting'
        })
      });
    } catch (error) {
      console.error('Failed to award points:', error);
    }
  };

  const restartGame = () => {
    setCurrentChallengeIndex(0);
    setSelectedWords([]);
    setScore(0);
    setLives(3);
    setShowResult(false);
    setGameComplete(false);
  };

  if (gameComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-600 to-indigo-700 flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl"
        >
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-3xl font-bold text-purple-900 mb-2">
            {lives > 0 ? "Mashallah!" : "Good Try!"}
          </h1>
          <p className="text-gray-600 mb-6">
            {lives > 0 
              ? "You mastered the duas like a true scholar!" 
              : "Keep practicing, you're getting better!"}
          </p>

          <div className="bg-purple-50 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-center gap-8">
              <div>
                <Trophy className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Score</p>
                <p className="text-2xl font-bold text-purple-900">{score}</p>
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
              className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-3 rounded-xl hover:shadow-lg transition-shadow"
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
    <div className="min-h-screen bg-gradient-to-b from-purple-500 to-indigo-600 text-white">
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
          <div className="flex gap-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  i < lives ? 'bg-red-500' : 'bg-white/20'
                }`}
              >
                ❤️
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Game Area */}
      <div className="max-w-4xl mx-auto p-6">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span>Challenge {currentChallengeIndex + 1} of {duaChallenges.length}</span>
            <span>{Math.round((currentChallengeIndex / duaChallenges.length) * 100)}%</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div
              className="bg-white rounded-full h-2 transition-all duration-500"
              style={{ width: `${(currentChallengeIndex / duaChallenges.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Scenario */}
        <div className="bg-white rounded-2xl p-8 mb-6 text-center shadow-2xl">
          <div className="text-6xl mb-4">🌟</div>
          <h2 className="text-2xl font-bold text-purple-900 mb-2">
            {currentChallenge.scenario}
          </h2>
          <p className="text-lg text-purple-600 mb-4 font-arabic">
            {currentChallenge.scenarioArabic}
          </p>
          <p className="text-gray-600">Choose the correct dua to cast your spell!</p>
        </div>

        {/* Selected Words Display */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 mb-6 min-h-24">
          <p className="text-sm opacity-80 mb-3">Your Dua:</p>
          <div className="flex flex-wrap gap-2">
            {selectedWords.length === 0 ? (
              <p className="text-white/50 italic">Select words below...</p>
            ) : (
              selectedWords.map((word, index) => (
                <motion.div
                  key={index}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="bg-white text-purple-900 px-4 py-2 rounded-lg font-semibold cursor-pointer hover:bg-purple-100"
                  onClick={() => handleWordClick(word)}
                >
                  {word}
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Word Options */}
        <div className="grid grid-cols-2 gap-3">
          {currentChallenge.words.map((word, index) => (
            <motion.button
              key={index}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleWordClick(word)}
              disabled={showResult}
              className={`
                p-4 rounded-xl font-semibold text-lg transition-all
                ${selectedWords.includes(word)
                  ? 'bg-purple-300 text-purple-900'
                  : 'bg-white text-purple-900 hover:bg-purple-50'
                }
                ${showResult ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {word}
            </motion.button>
          ))}
        </div>

        {/* Result Animation */}
        <AnimatePresence>
          {showResult && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mt-6 p-6 rounded-xl text-center ${
                isCorrect ? 'bg-green-500' : 'bg-red-500'
              }`}
            >
              <div className="text-6xl mb-2">{isCorrect ? '✨' : '😔'}</div>
              <h3 className="text-2xl font-bold mb-2">
                {isCorrect ? 'Mashallah!' : 'Not quite...'}
              </h3>
              {!isCorrect && (
                <div className="mt-4">
                  <p className="font-semibold mb-1">Correct Dua:</p>
                  <p className="text-lg">{currentChallenge.correctDuaArabic}</p>
                  <p className="text-sm opacity-90 mt-1">{currentChallenge.transliteration}</p>
                  <p className="text-sm opacity-80 mt-2">{currentChallenge.meaning}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
