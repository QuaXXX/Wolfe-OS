/**
 * Study Storage & Mastery Manager
 * Manages Flashcard Decks, Practice Quizzes, Weak-Spot Question Banks, and SRS Mastery Scores.
 */

const STORAGE_KEY_DECKS = 'wolfe_study_decks';
const STORAGE_KEY_QUIZZES = 'wolfe_study_quizzes';
const STORAGE_KEY_WEAK_SPOTS = 'wolfe_study_weak_spots';
const STORAGE_KEY_COURSES = 'wolfe_study_courses';

// ----------------------------------------------------
// 1. FLASHCARD DECKS
// ----------------------------------------------------

export function getSavedDecks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DECKS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDeckToLibrary(deck) {
  try {
    const decks = getSavedDecks();
    const existingIndex = decks.findIndex(d => d.id === deck.id);
    const updatedDeck = {
      ...deck,
      id: deck.id || `deck_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      decks[existingIndex] = updatedDeck;
    } else {
      decks.unshift(updatedDeck);
    }

    localStorage.setItem(STORAGE_KEY_DECKS, JSON.stringify(decks));
    return updatedDeck;
  } catch (err) {
    console.warn("Failed to save deck:", err);
    return deck;
  }
}

export function deleteDeckFromLibrary(deckId) {
  try {
    const decks = getSavedDecks().filter(d => d.id !== deckId);
    localStorage.setItem(STORAGE_KEY_DECKS, JSON.stringify(decks));
    return true;
  } catch {
    return false;
  }
}

export function updateDeckCardRating(deckId, cardIndex, rating) {
  try {
    const decks = getSavedDecks();
    const deck = decks.find(d => d.id === deckId);
    if (!deck || !deck.cards || !deck.cards[cardIndex]) return;

    deck.cards[cardIndex].srsRating = rating;
    deck.cards[cardIndex].lastReviewed = new Date().toISOString();
    deck.cards[cardIndex].reviewCount = (deck.cards[cardIndex].reviewCount || 0) + 1;

    // Calculate mastery score: easy = 100%, good = 75%, hard = 40%, again = 0%
    const totalWeight = deck.cards.reduce((acc, c) => {
      if (c.srsRating === 'easy') return acc + 100;
      if (c.srsRating === 'good') return acc + 75;
      if (c.srsRating === 'hard') return acc + 40;
      return acc + 0;
    }, 0);

    deck.masteryPercent = Math.round(totalWeight / (deck.cards.length || 1));
    deck.lastStudied = new Date().toISOString();

    localStorage.setItem(STORAGE_KEY_DECKS, JSON.stringify(decks));
  } catch (err) {
    console.warn("Failed to update card rating:", err);
  }
}

// ----------------------------------------------------
// 2. PRACTICE QUIZZES & WEAK-SPOT BANK
// ----------------------------------------------------

export function getSavedQuizzes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_QUIZZES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveQuizResult(quizData) {
  try {
    const quizzes = getSavedQuizzes();
    const updatedQuiz = {
      ...quizData,
      id: quizData.id || `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      completedAt: new Date().toISOString()
    };

    quizzes.unshift(updatedQuiz);
    localStorage.setItem(STORAGE_KEY_QUIZZES, JSON.stringify(quizzes.slice(0, 50)));

    // Track missed questions into Weak-Spot Bank
    if (quizData.questions && quizData.userAnswers) {
      const missed = quizData.questions.filter((q, idx) => {
        const userChoice = quizData.userAnswers[idx];
        return userChoice !== undefined && userChoice !== q.correctIndex;
      });

      if (missed.length > 0) {
        addWeakSpots(quizData.courseCode || 'General', missed);
      }
    }

    return updatedQuiz;
  } catch (err) {
    console.warn("Failed to save quiz result:", err);
    return quizData;
  }
}

export function getWeakSpots(courseCode = null) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WEAK_SPOTS);
    const all = raw ? JSON.parse(raw) : [];
    if (!courseCode || courseCode === 'ALL') return all;
    return all.filter(ws => (ws.courseCode || '').toUpperCase() === courseCode.toUpperCase());
  } catch {
    return [];
  }
}

export function addWeakSpots(courseCode, questions) {
  try {
    const current = getWeakSpots();
    const newItems = questions.map(q => ({
      id: `ws_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      courseCode,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      yieldRating: q.yieldRating || 'high',
      topic: q.topic || 'Exam Focus',
      addedAt: new Date().toISOString(),
      missedCount: 1
    }));

    // Deduplicate by question text
    const map = new Map();
    [...newItems, ...current].forEach(item => {
      if (!map.has(item.question)) {
        map.set(item.question, item);
      }
    });

    localStorage.setItem(STORAGE_KEY_WEAK_SPOTS, JSON.stringify(Array.from(map.values()).slice(0, 100)));
  } catch (err) {
    console.warn("Failed to update weak spots:", err);
  }
}

export function clearWeakSpot(id) {
  try {
    const spots = getWeakSpots().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY_WEAK_SPOTS, JSON.stringify(spots));
  } catch {}
}

// ----------------------------------------------------
// 3. ENROLLED COURSES & SYLLABI PROFILES
// ----------------------------------------------------

export function getEnrolledCourses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COURSES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveEnrolledCourse(course) {
  try {
    const courses = getEnrolledCourses();
    const idx = courses.findIndex(c => c.code?.toUpperCase() === course.code?.toUpperCase());
    if (idx >= 0) {
      courses[idx] = { ...courses[idx], ...course };
    } else {
      courses.push(course);
    }
    localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(courses));
    return courses;
  } catch {
    return [];
  }
}
