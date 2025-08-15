/* ------------------------------------------------------------------------
   Student Starter Quiz (React Native)

   Quick quiz app for new students (UK Life / UAL Tips / British Slang).
   User picks a category → picks difficulty → timed questions (optional).
   Saves high scores per category+difficulty and some lifetime stats.

   Features
   - 3 categories
   - Easy / Medium / Hard (15s / 10s / 7s if timer is on)
   - Hints on some questions
   - Per-category+difficulty high score (local)
   - Lifetime stats: quizzes taken, total answered/correct, best streak
   - Results screen shows your answers + correct ones
   - Settings: toggle timer, reset stats

   How to run
   - npm install
   - npx expo start
   - Open with Expo Go or an emulator
------------------------------------------------------------------------ */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* --------------------------- Config & helpers --------------------------- */

// Difficulties + per-difficulty time limit (seconds)
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const DIFF_TIME = { Easy: 15, Medium: 10, Hard: 7 };

// high score key is tied to both category and difficulty
const keyHighScore = (category, difficulty) =>
  `highScore_${category}_${difficulty}`;

// keys for settings + lifetime stats in AsyncStorage
const KEY_TIMER_ENABLED = 'settings_timer_enabled';
const KEY_STATS_QUIZZES = 'stats_total_quizzes';
const KEY_STATS_ANSWERED = 'stats_total_answered';
const KEY_STATS_CORRECT = 'stats_total_correct';
const KEY_STATS_BEST_STREAK = 'stats_best_streak';

// small Fisher–Yates shuffle helper
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* ------------------------------ Question bank ------------------------------ */
/* each item: {question, answer, hint?, difficulty} */

const quizBank = {
  'UK Life': [
    { difficulty: 'Easy', question: 'What is the capital of the UK?', answer: 'London', hint: 'Big Ben lives here.' },
    { difficulty: 'Easy', question: 'What side of the road do people drive on in the UK?', answer: 'Left' },
    { difficulty: 'Medium', question: 'What is the UK currency called?', answer: 'Pound', hint: 'Also a gym move.' },
    { difficulty: 'Medium', question: 'Name the UK’s longest river.', answer: 'Severn', hint: 'Not Thames!' },
    { difficulty: 'Hard', question: 'Which country shares a land border with England?', answer: 'Scotland' },
    { difficulty: 'Hard', question: 'What is the upper house of the UK Parliament called?', answer: 'House of Lords' },
  ],
  'UAL Tips': [
    { difficulty: 'Easy', question: 'What does UAL stand for?', answer: 'University of the Arts London' },
    { difficulty: 'Easy', question: 'Name one UAL library.', answer: 'LCC Library' },
    { difficulty: 'Medium', question: 'Where can you find academic support at UAL?', answer: 'Academic Support Centre' },
    { difficulty: 'Medium', question: 'UAL ID cards are also known as?', answer: 'Passes', hint: 'Access…' },
    { difficulty: 'Hard', question: 'Which UAL service helps with careers and internships?', answer: 'Arts Temps' },
    { difficulty: 'Hard', question: 'Name the UAL virtual learning environment.', answer: 'Moodle' },
  ],
  'British Slang': [
    { difficulty: 'Easy', question: 'What does "cheers" mean (most commonly)?', answer: 'Thanks' },
    { difficulty: 'Easy', question: 'What is a "loo"?', answer: 'Toilet' },
    { difficulty: 'Medium', question: 'If something is "brilliant", it is…', answer: 'Very good' },
    { difficulty: 'Medium', question: '"Knackered" means…', answer: 'Tired', hint: 'Sleepy vibes.' },
    { difficulty: 'Hard', question: '"Chuffed" means…', answer: 'Pleased' },
    { difficulty: 'Hard', question: 'A "quid" is one…', answer: 'Pound' },
  ],
};

/* ------------------------------- App component ------------------------------ */

export default function App() {
  /* ----------------------------- navigation state ---------------------------- */
  // simple “router”: which screen to show
  const [screen, setScreen] = useState('category'); // category | difficulty | quiz | results | settings

  /* ------------------------------ user selection ----------------------------- */
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState('Easy');

  /* -------------------------------- quiz state ------------------------------- */
  const [questions, setQuestions] = useState([]);      // active pool (category + difficulty)
  const [current, setCurrent] = useState(0);           // index of current question
  const [userInput, setUserInput] = useState('');      // answer typed by user
  const [score, setScore] = useState(0);               // running score
  const [highScore, setHighScore] = useState(0);       // best score for this category+difficulty
  const [answered, setAnswered] = useState(false);     // did we check this question yet?
  const [feedback, setFeedback] = useState('');        // "Correct!" / "Incorrect" / "Time's up!"
  const [showAnswer, setShowAnswer] = useState(false); // toggle reveal
  const [userAnswers, setUserAnswers] = useState([]);  // store answers for review screen
  const [quizFinished, setQuizFinished] = useState(false);

  /* --------------------------------- timer ---------------------------------- */
  const [timerEnabled, setTimerEnabled] = useState(true);          // setting (persisted)
  const [timer, setTimer] = useState(DIFF_TIME[selectedDifficulty]);
  const [timerActive, setTimerActive] = useState(false);           // only counts down while answering

  /* ------------------------------- lifetime stats ---------------------------- */
  const [stats, setStats] = useState({
    totalQuizzes: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    bestStreak: 0,
    currentStreak: 0, // temp streak during one quiz
  });

  /* ----------------------------- load persisted stuff ----------------------------- */
  useEffect(() => {
    // on boot: grab timer setting + lifetime stats
    (async () => {
      const [t, q, a, c, s] = await Promise.all([
        AsyncStorage.getItem(KEY_TIMER_ENABLED),
        AsyncStorage.getItem(KEY_STATS_QUIZZES),
        AsyncStorage.getItem(KEY_STATS_ANSWERED),
        AsyncStorage.getItem(KEY_STATS_CORRECT),
        AsyncStorage.getItem(KEY_STATS_BEST_STREAK),
      ]);
      if (t !== null) setTimerEnabled(t === '1');
      setStats(st => ({
        ...st,
        totalQuizzes: Number(q || 0),
        totalAnswered: Number(a || 0),
        totalCorrect: Number(c || 0),
        bestStreak: Number(s || 0),
      }));
    })();
  }, []);

  // keep timer setting in storage
  useEffect(() => {
    AsyncStorage.setItem(KEY_TIMER_ENABLED, timerEnabled ? '1' : '0');
  }, [timerEnabled]);

  // when category/difficulty changes, refresh the stored high score
  useEffect(() => {
    if (!selectedCategory) return;
    (async () => {
      const key = keyHighScore(selectedCategory, selectedDifficulty);
      const val = await AsyncStorage.getItem(key);
      setHighScore(Number(val || 0));
    })();
  }, [selectedCategory, selectedDifficulty]);

  /* ------------------------------ derived values ------------------------------ */
  const roundTime = DIFF_TIME[selectedDifficulty];

  // filter the pool once per category/difficulty change
  const filteredPool = useMemo(() => {
    if (!selectedCategory) return [];
    const pool = quizBank[selectedCategory] || [];
    return pool.filter(q => q.difficulty === selectedDifficulty);
  }, [selectedCategory, selectedDifficulty]);

  /* -------------------------------- handlers -------------------------------- */

  // category picked → go to difficulty screen (default Easy)
  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    setSelectedDifficulty('Easy');
    setScreen('difficulty');
  };

  // build a new quiz round from the filtered pool
  const startQuiz = () => {
    const pool = shuffle(filteredPool);
    if (pool.length === 0) {
      Alert.alert(
        'No questions',
        `No ${selectedDifficulty} questions exist for ${selectedCategory} yet.`,
        [{ text: 'OK', onPress: () => setScreen('category') }],
      );
      return;
    }
    setQuestions(pool);
    setCurrent(0);
    setScore(0);
    setAnswered(false);
    setFeedback('');
    setShowAnswer(false);
    setUserAnswers([]);
    setQuizFinished(false);
    setUserInput('');
    setTimer(roundTime);
    setTimerActive(timerEnabled);
    setScreen('quiz');
  };

  // count down the timer only while answering (and only if enabled)
  useEffect(() => {
    if (screen !== 'quiz' || !timerEnabled) return;
    let id;
    if (timerActive && !answered && timer > 0) {
      id = setInterval(() => setTimer(t => t - 1), 1000);
    } else if (timerActive && !answered && timer === 0) {
      // time out = auto wrong; store blank and show the answer
      setAnswered(true);
      setFeedback("Time's up!");
      setUserAnswers(prev => {
        const copy = [...prev];
        copy[current] = '';
        return copy;
      });
      setShowAnswer(true);
      setTimerActive(false);
    }
    return () => clearInterval(id);
  }, [screen, timerEnabled, timerActive, answered, timer, current]);

  // check the user’s input against the current question
  const checkAnswer = () => {
    if (answered) return;         // no double taps
    const q = questions[current];
    if (!q) return;               // guard just in case

    const correct =
      userInput.trim().toLowerCase() === q.answer.toLowerCase();

    setFeedback(correct ? 'Correct!' : 'Incorrect');
    setAnswered(true);
    setScore(s => (correct ? s + 1 : s));
    setUserAnswers(prev => {
      const copy = [...prev];
      copy[current] = userInput;
      return copy;
    });
    setShowAnswer(!correct);
    setTimerActive(false);

    // keep a streak inside this quiz and remember the best ever
    setStats(st => {
      const nextStreak = correct ? st.currentStreak + 1 : 0;
      const best = Math.max(st.bestStreak, nextStreak);
      return { ...st, currentStreak: nextStreak, bestStreak: best };
    });
  };

  // move on or finish; also writes stats + high score
  const nextQuestion = () => {
    setShowAnswer(false);
    setAnswered(false);
    setFeedback('');
    setUserInput('');
    setTimer(roundTime);
    setTimerActive(timerEnabled);

    if (current + 1 < questions.length) {
      setCurrent(i => i + 1);
    } else {
      // end of quiz → go to results
      setQuizFinished(true);
      setScreen('results');

      // lifetime stats write-back
      setStats(st => {
        const totalAnswered = st.totalAnswered + questions.length;
        const totalCorrect = st.totalCorrect + score;
        AsyncStorage.multiSet([
          [KEY_STATS_QUIZZES, String(st.totalQuizzes + 1)],
          [KEY_STATS_ANSWERED, String(totalAnswered)],
          [KEY_STATS_CORRECT, String(totalCorrect)],
          [KEY_STATS_BEST_STREAK, String(st.bestStreak)],
        ]);
        return {
          ...st,
          totalQuizzes: st.totalQuizzes + 1,
          totalAnswered,
          totalCorrect,
          currentStreak: 0,
        };
      });

      // update high score if we beat it
      const capped = Math.min(score, questions.length);
      if (capped > highScore) {
        const key = keyHighScore(selectedCategory, selectedDifficulty);
        AsyncStorage.setItem(key, String(capped));
        setHighScore(capped);
      }
    }
  };

  // full reset back to category screen (doesn’t wipe storage)
  const restartAll = () => {
    setScreen('category');
    setSelectedCategory(null);
    setQuestions([]);
    setCurrent(0);
    setScore(0);
    setFeedback('');
    setAnswered(false);
    setQuizFinished(false);
    setUserAnswers([]);
    setUserInput('');
    setShowAnswer(false);
    setTimer(roundTime);
    setTimerActive(false);
  };

  const openSettings = () => setScreen('settings');

  // wipe highs + lifetime stats with a confirm
  const resetAllStats = async () => {
    Alert.alert(
      'Reset all data?',
      'This will clear high scores and lifetime stats.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            // set all highs to 0 for every category+difficulty
            const ops = [];
            Object.keys(quizBank).forEach(cat => {
              DIFFICULTIES.forEach(diff => {
                ops.push([keyHighScore(cat, diff), '0']);
              });
            });
            await AsyncStorage.multiSet(ops);
            await AsyncStorage.multiSet([
              [KEY_STATS_QUIZZES, '0'],
              [KEY_STATS_ANSWERED, '0'],
              [KEY_STATS_CORRECT, '0'],
              [KEY_STATS_BEST_STREAK, '0'],
            ]);
            setStats({
              totalQuizzes: 0,
              totalAnswered: 0,
              totalCorrect: 0,
              bestStreak: 0,
              currentStreak: 0,
            });
            setHighScore(0);
            Alert.alert('Done', 'All stats have been reset.');
          },
        },
      ],
    );
  };

  /* --------------------------------- screens -------------------------------- */

  // Category select
  if (screen === 'category') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Student Starter Quiz</Text>
        <Text style={styles.subtitle}>Select a category to start!</Text>

        {Object.keys(quizBank).map(cat => (
          <TouchableOpacity
            key={cat}
            style={styles.categoryButton}
            onPress={() => handleCategorySelect(cat)}
          >
            <Text style={styles.categoryText}>{cat}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.settingsBtn} onPress={openSettings}>
          <Text style={styles.settingsText}>⚙︎ Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Difficulty select
  if (screen === 'difficulty') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{selectedCategory}</Text>
        <Text style={styles.subtitle}>Choose difficulty</Text>

        {DIFFICULTIES.map(diff => (
          <TouchableOpacity
            key={diff}
            style={[
              styles.categoryButton,
              diff === selectedDifficulty && { opacity: 0.9 },
            ]}
            onPress={() => setSelectedDifficulty(diff)}
          >
            <Text style={styles.categoryText}>{diff}</Text>
          </TouchableOpacity>
        ))}

        <View style={{ height: 12 }} />
        <Button title="Start Quiz" onPress={startQuiz} />
        <View style={{ height: 8 }} />
        <Button title="Back" color="#777" onPress={() => setScreen('category')} />
      </View>
    );
  }

  // Quiz screen
  if (screen === 'quiz') {
    const q = questions[current]; // guarded in render
    return (
      <View style={styles.container}>
        <Text style={styles.topHigh}>
          High Score: {Math.min(highScore, questions.length)} / {questions.length}
        </Text>
        <Text style={styles.topScore}>
          Score: {score} / {questions.length}
        </Text>

        {timerEnabled && (
          <Text style={[styles.timer, { color: timer <= 5 ? 'red' : 'black' }]}>
            Time Left: {timer}s
          </Text>
        )}

        <Text style={styles.title}>{selectedCategory}</Text>

        {q ? (
          <>
            <Text style={styles.question}>{q.question}</Text>
            <TextInput
              style={styles.input}
              value={userInput}
              onChangeText={setUserInput}
              editable={!answered}
              placeholder="Type your answer"
            />
            {q.hint && !answered ? (
              <TouchableOpacity onPress={() => Alert.alert('Hint', q.hint)}>
                <Text style={styles.hintLink}>Show hint</Text>
              </TouchableOpacity>
            ) : null}

            {feedback ? (
              <Text style={feedback === 'Correct!' ? styles.correct : styles.incorrect}>
                {feedback}
              </Text>
            ) : null}

            {showAnswer && (
              <Text style={styles.showAnswer}>Correct answer: {q.answer}</Text>
            )}

            {!answered ? (
              <Button title="Check Answer" onPress={checkAnswer} />
            ) : (
              <Button
                title={current + 1 === questions.length ? 'Finish Quiz' : 'Next Question'}
                onPress={nextQuestion}
              />
            )}

            <View style={{ height: 16 }} />
            <Button title="Back to Categories" color="#888" onPress={restartAll} />
          </>
        ) : (
          <>
            <Text style={styles.question}>Loading question…</Text>
            <Button title="Back" onPress={restartAll} />
          </>
        )}
      </View>
    );
  }

  // Results
  if (screen === 'results') {
    const quizAccuracy =
      questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
    const overallAccuracy =
      stats.totalAnswered > 0
        ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100)
        : 0;

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Quiz Finished!</Text>
        <Text style={styles.bigLine}>Your Score: {score} / {questions.length}</Text>
        <Text style={styles.greenLine}>
          High Score: {Math.min(highScore, questions.length)} / {questions.length}
        </Text>

        <Text style={styles.subHeader}>This quiz accuracy: {quizAccuracy}%</Text>

        <Text style={styles.sectionHeader}>Lifetime Stats</Text>
        <Text style={styles.statLine}>Quizzes taken: {stats.totalQuizzes}</Text>
        <Text style={styles.statLine}>Questions answered: {stats.totalAnswered}</Text>
        <Text style={styles.statLine}>Overall accuracy: {overallAccuracy}%</Text>
        <Text style={styles.statLine}>Longest streak: {stats.bestStreak}</Text>

        <Text style={styles.sectionHeader}>Answers Review:</Text>
        {questions.map((q, i) => {
          const ua = userAnswers[i] ?? '';
          const correct = ua.trim().toLowerCase() === q.answer.toLowerCase();
          return (
            <View key={i} style={styles.reviewItem}>
              <Text style={{ fontWeight: '700', fontSize: 16 }}>
                {i + 1}. {q.question}
              </Text>
              <Text>
                Your answer:{' '}
                <Text style={{ color: correct ? 'green' : 'red' }}>
                  {ua || '—'}
                </Text>
              </Text>
              {!correct && (
                <Text style={{ color: 'blue' }}>Correct answer: {q.answer}</Text>
              )}
            </View>
          );
        })}

        <TouchableOpacity style={styles.settingsBtn} onPress={openSettings}>
          <Text style={styles.settingsText}>⚙︎ Settings</Text>
        </TouchableOpacity>

        <View style={{ height: 8 }} />
        <Button title="Try Another Category" onPress={restartAll} />
      </ScrollView>
    );
  }

  // Settings
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Timer enabled</Text>
        <Switch value={timerEnabled} onValueChange={setTimerEnabled} />
      </View>

      <TouchableOpacity style={styles.resetBtn} onPress={resetAllStats}>
        <Text style={styles.resetText}>Reset all stats</Text>
      </TouchableOpacity>

      <View style={{ height: 12 }} />
      <Button title="Back" onPress={() => setScreen('category')} />
    </View>
  );
}

/* --------------------------------- Styles -------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e7effc',
    padding: 22,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    textAlign: 'center',
    marginVertical: 30,
    fontWeight: 'bold',
    color: '#3d5589',
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  categoryButton: {
    backgroundColor: '#3d5589',
    borderRadius: 10,
    paddingVertical: 18,
    marginBottom: 16,
    alignItems: 'center',
    elevation: 2,
  },
  categoryText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  settingsBtn: {
    marginTop: 12,
    alignSelf: 'center',
    backgroundColor: '#dfe7fb',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  settingsText: { fontSize: 18, color: '#3d5589', fontWeight: '600' },

  topHigh: {
    color: 'purple',
    fontWeight: 'bold',
    fontSize: 18,
    alignSelf: 'flex-end',
    marginBottom: 2,
  },
  topScore: {
    color: 'green',
    fontWeight: 'bold',
    fontSize: 22,
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  timer: { fontSize: 22, textAlign: 'center', marginBottom: 4 },

  question: { fontSize: 22, textAlign: 'center', marginVertical: 15 },

  input: {
    borderWidth: 1,
    borderColor: '#888',
    borderRadius: 8,
    fontSize: 20,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  hintLink: {
    textAlign: 'center',
    color: '#246BFD',
    marginBottom: 10,
    fontSize: 16,
  },
  correct: { color: 'green', fontSize: 22, marginVertical: 10, textAlign: 'center' },
  incorrect: { color: 'red', fontSize: 22, marginVertical: 10, textAlign: 'center' },
  showAnswer: { color: 'blue', fontSize: 18, marginBottom: 8, textAlign: 'center' },

  sectionHeader: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  bigLine: { fontSize: 24, textAlign: 'center', marginBottom: 6, fontWeight: '700' },
  greenLine: { fontSize: 18, textAlign: 'center', color: 'green', marginBottom: 4 },
  subHeader: { fontSize: 18, textAlign: 'center', marginBottom: 6 },

  statLine: { fontSize: 16, textAlign: 'center', marginBottom: 2 },

  reviewItem: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f7f7fa',
    borderRadius: 8,
  },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 18,
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  settingLabel: { fontSize: 18 },
  resetBtn: {
    backgroundColor: '#c23b3b',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  resetText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
