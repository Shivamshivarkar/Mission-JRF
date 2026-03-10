/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, MouseEvent } from "react";
import { novels, Novel } from "./data";
import { dramas, Drama } from "./dramaData";
import { Search, Shuffle, RotateCcw, BookOpen, GraduationCap, CheckCircle2, XCircle, Sparkles, Info, Trophy, ArrowRight, Calendar, Quote, Theater } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI, Type } from "@google/genai";
import confetti from "canvas-confetti";

type Mode = "novels" | "dramas" | "quiz";
type QuizType = "novels" | "dramas";

interface ItemDetails {
  summary: string;
  publicationDate: string;
  literaryInsight: string;
}

interface QuizHistoryItem {
  item: Novel | Drama;
  selectedAnswer: string;
  isCorrect: boolean;
  details: ItemDetails;
}

export default function App() {
  const [mode, setMode] = useState<Mode>("novels");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [shuffledItems, setShuffledItems] = useState<(Novel | Drama)[]>([...novels]);
  const [flippedIndex, setFlippedIndex] = useState<number | null>(null);
  
  // Quiz state
  const [quizType, setQuizType] = useState<QuizType | null>(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [currentDetails, setCurrentDetails] = useState<ItemDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [quizHistory, setQuizHistory] = useState<QuizHistoryItem[]>([]);
  const [detailItem, setDetailItem] = useState<Novel | Drama | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const currentItems = useMemo(() => mode === "novels" ? novels : dramas, [mode]);
  const categories = useMemo(() => Array.from(new Set(currentItems.map(n => n.category))), [currentItems]);

  const filteredItems = useMemo(() => {
    if (search.trim()) {
      return currentItems.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(search.toLowerCase()) || 
                             item.author.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = !selectedCategory || item.category === selectedCategory;
        return matchesSearch && matchesCategory;
      });
    }
    return shuffledItems;
  }, [currentItems, shuffledItems, search, selectedCategory]);

  const handleShuffle = () => {
    const baseItems = currentItems.filter(item => !selectedCategory || item.category === selectedCategory);
    setShuffledItems([...baseItems].sort(() => Math.random() - 0.5).slice(0, 9));
    setFlippedIndex(null);
  };

  useEffect(() => {
    if (mode !== "quiz") {
      handleShuffle();
    }
  }, [mode, selectedCategory, currentItems]);

  const toggleCard = (e: MouseEvent, index: number) => {
    e.stopPropagation();
    setFlippedIndex(prev => (prev === index ? null : index));
  };

  const handleShowDetails = async (e: MouseEvent, item: Novel | Drama) => {
    e.stopPropagation();
    setDetailItem(item);
    setShowDetailModal(true);
    await fetchItemDetails(item);
  };

  useEffect(() => {
    const handleGlobalClick = () => setFlippedIndex(null);
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // Gemini Item Details Generation
  const fetchItemDetails = async (item: Novel | Drama): Promise<ItemDetails> => {
    setIsLoadingDetails(true);
    const typeLabel = mode === "dramas" || quizType === "dramas" ? "drama/play" : "novel";
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: `Provide a summary and interesting facts for the ${typeLabel} "${item.title}" by ${item.author}.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: `A summary of the whole story in a short paragraph using simple, easy-to-understand English.`,
              },
              publicationDate: {
                type: Type.STRING,
                description: "The original year of publication/performance.",
              },
              literaryInsight: {
                type: Type.STRING,
                description: "Interesting facts such as major awards won, film adaptations, or a famous quote from the work.",
              },
            },
            required: ["summary", "publicationDate", "literaryInsight"],
          },
        },
      });
      
      const details = JSON.parse(response.text || "{}") as ItemDetails;
      const finalDetails = {
        summary: details.summary || "A classic work of literature.",
        publicationDate: details.publicationDate || "Unknown",
        literaryInsight: details.literaryInsight || "A masterpiece of its time.",
      };
      setCurrentDetails(finalDetails);
      return finalDetails;
    } catch (error) {
      console.error("Error fetching details:", error);
      const fallback = {
        summary: "A significant work in its genre, known for its profound impact on literature.",
        publicationDate: "N/A",
        literaryInsight: "Highly influential literary work.",
      };
      setCurrentDetails(fallback);
      return fallback;
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Quiz Logic
  const startQuiz = (type: QuizType) => {
    const sourceItems = type === "novels" ? novels : dramas;
    const quizSet = [...sourceItems].sort(() => Math.random() - 0.5).slice(0, 10);
    setShuffledItems(quizSet);
    setQuizType(type);
    setQuizIndex(0);
    setScore(0);
    setQuizFinished(false);
    setQuizHistory([]);
    setMode("quiz");
    generateOptions(quizSet[0], sourceItems);
  };

  const generateOptions = (currentItem: Novel | Drama, sourceItems: (Novel | Drama)[]) => {
    const others = sourceItems
      .filter(n => n.author !== currentItem.author)
      .map(n => n.author);
    const randomOthers = Array.from(new Set(others))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const allOptions = [...randomOthers, currentItem.author].sort(() => Math.random() - 0.5);
    setQuizOptions(allOptions);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setCurrentDetails(null);
  };

  const handleAnswer = async (answer: string) => {
    if (selectedAnswer) return;
    
    const currentItem = shuffledItems[quizIndex];
    const correct = answer === currentItem.author;
    
    setSelectedAnswer(answer);
    setIsCorrect(correct);
    if (correct) setScore(prev => prev + 1);

    // Fetch details on answer
    const details = await fetchItemDetails(currentItem);

    // Record history
    setQuizHistory(prev => [...prev, {
      item: currentItem,
      selectedAnswer: answer,
      isCorrect: correct,
      details: details
    }]);
  };

  const nextQuestion = () => {
    if (quizIndex < shuffledItems.length - 1) {
      const nextIdx = quizIndex + 1;
      setQuizIndex(nextIdx);
      const sourceItems = quizType === "novels" ? novels : dramas;
      generateOptions(shuffledItems[nextIdx], sourceItems);
    } else {
      setQuizFinished(true);
      if (score >= 5) {
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function() {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            return clearInterval(interval);
          }

          const particleCount = 50 * (timeLeft / duration);
          confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
          confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white font-sans p-4 md:p-8 selection:bg-indigo-500/30">
      <header className="max-w-4xl mx-auto text-center mb-12">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-6xl font-bold mb-2 tracking-tight"
        >
          📚 Literature Memory Trainer
        </motion.h1>
        <p className="text-indigo-300/80 text-lg">Created by Shivam Shivarkar</p>
        
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <button 
            onClick={() => { setMode("novels"); setSelectedCategory(null); setSearch(""); }}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full transition-all ${mode === "novels" ? "bg-indigo-600 shadow-lg shadow-indigo-500/20" : "bg-slate-800 hover:bg-slate-700"}`}
          >
            <BookOpen size={20} />
            Novels
          </button>
          <button 
            onClick={() => { setMode("dramas"); setSelectedCategory(null); setSearch(""); }}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full transition-all ${mode === "dramas" ? "bg-indigo-600 shadow-lg shadow-indigo-500/20" : "bg-slate-800 hover:bg-slate-700"}`}
          >
            <Theater size={20} />
            Dramas
          </button>
          <button 
            onClick={() => { setMode("quiz"); setQuizType(null); setQuizFinished(false); }}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full transition-all ${mode === "quiz" ? "bg-emerald-600 shadow-lg shadow-emerald-500/20" : "bg-slate-800 hover:bg-slate-700"}`}
          >
            <GraduationCap size={20} />
            Quiz Mode
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        {(mode === "novels" || mode === "dramas") ? (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-800/50 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder={`Search ${mode === "novels" ? "novel" : "drama"} title or author...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-900/50 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all hover:border-white/20 placeholder:text-slate-500 text-slate-200 shadow-inner"
                />
              </div>
              
              <div className="flex flex-wrap justify-center gap-2">
                <button 
                  onClick={() => setSelectedCategory(null)}
                  className={`px-4 py-1.5 rounded-full text-sm transition-all ${!selectedCategory ? "bg-indigo-600" : "bg-slate-700 hover:bg-slate-600"}`}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button 
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-1.5 rounded-full text-sm transition-all ${selectedCategory === cat ? "bg-indigo-600" : "bg-slate-700 hover:bg-slate-600"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <button 
                onClick={handleShuffle}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-xl transition-all font-medium active:scale-95 shadow-lg shadow-amber-600/20 hover:ring-2 hover:ring-amber-400/50"
              >
                <Shuffle size={18} />
                Shuffle
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <AnimatePresence mode="popLayout">
                {filteredItems.map((item, idx) => (
                  <motion.div
                    key={`${item.title}-${idx}`}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="h-48 perspective-1000 cursor-pointer group"
                    onClick={(e) => toggleCard(e, idx)}
                  >
                    <div className={`relative w-full h-full transition-transform duration-500 preserve-3d ${flippedIndex === idx ? "rotate-y-180" : ""}`}>
                      {/* Front */}
                      <div className="absolute inset-0 backface-hidden bg-white text-slate-900 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-xl">
                        <button 
                          onClick={(e) => handleShowDetails(e, item)}
                          className="absolute top-3 right-3 p-2 bg-indigo-500/10 hover:bg-indigo-500/30 rounded-full transition-all text-indigo-600 hover:scale-110 active:scale-95 z-20"
                          title="View Gemini Insights"
                        >
                          <Sparkles size={16} />
                        </button>
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-2">{item.category}</span>
                        <h3 className="text-xl font-bold leading-tight">{item.title}</h3>
                        <p className="mt-4 text-sm text-slate-500 font-medium">Click to reveal author</p>
                      </div>
                      
                      {/* Back */}
                      <div className="absolute inset-0 backface-hidden bg-indigo-600 text-white rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-xl rotate-y-180">
                        <p className="text-sm opacity-80 mb-1">Author of {item.title}</p>
                        <h3 className="text-2xl font-bold">{item.author}</h3>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            
            {filteredItems.length === 0 && (
              <div className="text-center py-20">
                <p className="text-slate-400 text-xl">No {mode === "novels" ? "novels" : "dramas"} found matching your search.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {!quizType ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-8"
              >
                <button 
                  onClick={() => startQuiz("novels")}
                  className="group bg-slate-800/80 p-12 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-md hover:bg-indigo-600/20 transition-all text-center"
                >
                  <BookOpen className="mx-auto mb-6 text-indigo-400 group-hover:scale-110 transition-transform" size={64} />
                  <h3 className="text-3xl font-bold mb-2">Novels Quiz</h3>
                  <p className="text-slate-400">Test your knowledge of classic novels and their authors.</p>
                </button>
                <button 
                  onClick={() => startQuiz("dramas")}
                  className="group bg-slate-800/80 p-12 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-md hover:bg-emerald-600/20 transition-all text-center"
                >
                  <Theater className="mx-auto mb-6 text-emerald-400 group-hover:scale-110 transition-transform" size={64} />
                  <h3 className="text-3xl font-bold mb-2">Dramas Quiz</h3>
                  <p className="text-slate-400">Challenge yourself with famous plays and dramatists.</p>
                </button>
              </motion.div>
            ) : !quizFinished ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-800/80 p-8 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-md"
              >
                <div className="flex justify-between items-center mb-8">
                  <div className="space-y-1">
                    <p className="text-sm text-slate-400 uppercase tracking-widest font-bold">Question {quizIndex + 1} of {shuffledItems.length}</p>
                    <div className="h-2 w-48 bg-slate-700 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-emerald-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${((quizIndex + 1) / shuffledItems.length) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="bg-slate-900 px-4 py-2 rounded-xl border border-white/5">
                    <span className="text-emerald-400 font-bold text-xl">{score}</span>
                    <span className="text-slate-500 ml-1">pts</span>
                  </div>
                </div>

                <div className="text-center mb-10">
                  <h2 className="text-3xl md:text-4xl font-bold mb-4">Who wrote <span className="text-indigo-400 italic">"{shuffledItems[quizIndex].title}"</span>?</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {quizOptions.map((option) => {
                    const isSelected = selectedAnswer === option;
                    const isCorrectOption = option === shuffledItems[quizIndex].author;
                    
                    let buttonClass = "bg-slate-700/50 hover:bg-slate-700 border-white/5";
                    if (selectedAnswer) {
                      if (isCorrectOption) buttonClass = "bg-emerald-500/20 border-emerald-500 text-emerald-400 ring-2 ring-emerald-500/50";
                      else if (isSelected) buttonClass = "bg-red-500/20 border-red-500 text-red-400 ring-2 ring-red-500/50";
                      else buttonClass = "opacity-50 bg-slate-700/50 border-white/5";
                    }

                    return (
                      <button
                        key={option}
                        disabled={!!selectedAnswer}
                        onClick={() => handleAnswer(option)}
                        className={`w-full p-5 rounded-2xl border-2 text-left text-lg font-medium transition-all flex items-center justify-between ${buttonClass}`}
                      >
                        <span className="flex-1">{option}</span>
                        {selectedAnswer && isCorrectOption && <CheckCircle2 className="text-emerald-500 shrink-0" />}
                        {selectedAnswer && isSelected && !isCorrectOption && <XCircle className="text-red-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {selectedAnswer && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-8 space-y-6"
                    >
                      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="flex items-start gap-3">
                            <Quote className="text-indigo-400 shrink-0 mt-1" size={20} />
                            <div>
                              <h4 className="text-indigo-300 font-bold text-sm uppercase tracking-wider mb-1">Summary</h4>
                              {isLoadingDetails ? (
                                <div className="flex items-center gap-2 text-slate-400">
                                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                  <span>Loading...</span>
                                </div>
                              ) : (
                                <p className="text-slate-200 leading-relaxed italic">"{currentDetails?.summary}"</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Calendar className="text-indigo-400 shrink-0 mt-1" size={20} />
                            <div className="space-y-3">
                              <div>
                                <h4 className="text-indigo-300 font-bold text-sm uppercase tracking-wider mb-1">Published</h4>
                                {isLoadingDetails ? (
                                  <div className="flex items-center gap-2 text-slate-400">
                                    <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                    <span>Loading...</span>
                                  </div>
                                ) : (
                                  <p className="text-slate-200 leading-relaxed font-bold">{currentDetails?.publicationDate}</p>
                                )}
                              </div>
                              {!isLoadingDetails && currentDetails?.literaryInsight && (
                                <div>
                                  <h4 className="text-indigo-300 font-bold text-sm uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <Sparkles size={14} />
                                    Insights
                                  </h4>
                                  <p className="text-slate-300 text-sm italic leading-relaxed">
                                    {currentDetails.literaryInsight}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={nextQuestion}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl transition-all font-bold text-xl flex items-center justify-center gap-2 group"
                      >
                        {quizIndex < shuffledItems.length - 1 ? "Next Question" : "See Results"}
                        <ArrowRight className="group-hover:translate-x-1 transition-transform" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                <div className="text-center bg-slate-800/80 p-12 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-md">
                  <Trophy className="mx-auto text-amber-400 mb-4" size={64} />
                  <h2 className="text-5xl font-bold mb-4">Quiz Complete!</h2>
                  <div className="text-8xl font-black text-emerald-400 mb-6">{score * 10}%</div>
                  <p className="text-xl text-slate-300 mb-8">
                    You got <span className="font-bold text-white">{score}</span> out of <span className="font-bold text-white">{shuffledItems.length}</span> correct.
                  </p>
                  
                  <div className="mb-4">
                    <h3 className={`text-2xl font-bold ${score >= 5 ? "text-emerald-400" : "text-amber-400"}`}>
                      {score >= 5 ? "Shinchan: Sugoi! Great job! 🎉" : "Shinchan: Haha! Study more! 😜"}
                    </h3>
                  </div>

                  <div className="mb-10 rounded-2xl overflow-hidden max-w-xs mx-auto shadow-2xl border-4 border-white/10">
                    <img 
                      src={score >= 5 ? "https://media.tenor.com/7SE3IKEub60AAAAi/shinchan.gif" : "https://media1.tenor.com/m/cbuD7hyZawAAAAAC/eyebrow-waggle-eye-brow.gif"} 
                      alt="Result reaction"
                      className="w-full h-auto"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  <button 
                    onClick={() => startQuiz(quizType!)}
                    className="flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl transition-all font-bold text-xl mx-auto shadow-lg shadow-emerald-500/20"
                  >
                    <RotateCcw size={24} />
                    Try Again
                  </button>
                </div>

                <div className="bg-slate-800/50 rounded-3xl border border-white/10 overflow-hidden">
                  <div className="p-6 border-b border-white/5 bg-slate-800/80">
                    <h3 className="text-2xl font-bold flex items-center gap-2">
                      <Info className="text-indigo-400" />
                      Detailed Summary
                    </h3>
                  </div>
                  <div className="divide-y divide-white/5">
                    {quizHistory.map((item, idx) => (
                      <div key={idx} className="p-6 hover:bg-white/5 transition-colors">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                          <div>
                            <h4 className="text-lg font-bold text-indigo-300 italic">"{item.item.title}"</h4>
                            <p className="text-slate-400 text-sm">Correct Author: <span className="text-white font-medium">{item.item.author}</span></p>
                          </div>
                          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${item.isCorrect ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                            {item.isCorrect ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                            {item.isCorrect ? "Correct" : `You chose: ${item.selectedAnswer}`}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/50 p-4 rounded-xl border border-white/5">
                          <p className="text-slate-300 text-sm leading-relaxed">
                            <span className="text-indigo-400 font-bold mr-2">Summary:</span>
                            {item.details.summary}
                          </p>
                          <div className="space-y-2">
                            <p className="text-slate-300 text-sm leading-relaxed">
                              <span className="text-indigo-400 font-bold mr-2">Published:</span>
                              {item.details.publicationDate}
                            </p>
                            <p className="text-slate-300 text-sm italic leading-relaxed">
                              <span className="text-indigo-400 font-bold not-italic mr-2">Insights:</span>
                              {item.details.literaryInsight}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </main>

      {/* Detail Modal */}
      <AnimatePresence>
        {showDetailModal && detailItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-800 w-full max-w-2xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-800/80">
                <div>
                  <h3 className="text-2xl font-bold text-white italic">"{detailItem.title}"</h3>
                  <p className="text-indigo-400 font-medium">{detailItem.author}</p>
                </div>
                <button 
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <XCircle size={24} className="text-slate-400" />
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex items-start gap-3">
                    <Quote className="text-indigo-400 shrink-0 mt-1" size={20} />
                    <div>
                      <h4 className="text-indigo-300 font-bold text-sm uppercase tracking-wider mb-1">Summary</h4>
                      {isLoadingDetails ? (
                        <div className="flex items-center gap-2 text-slate-400">
                          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                          <span>Loading...</span>
                        </div>
                      ) : (
                        <p className="text-slate-200 leading-relaxed italic">"{currentDetails?.summary}"</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Calendar className="text-indigo-400 shrink-0 mt-1" size={20} />
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-indigo-300 font-bold text-sm uppercase tracking-wider mb-1">Published</h4>
                        {isLoadingDetails ? (
                          <div className="flex items-center gap-2 text-slate-400">
                            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                            <span>Loading...</span>
                          </div>
                        ) : (
                          <p className="text-slate-200 leading-relaxed font-bold">{currentDetails?.publicationDate}</p>
                        )}
                      </div>
                      {!isLoadingDetails && currentDetails?.literaryInsight && (
                        <div>
                          <h4 className="text-indigo-300 font-bold text-sm uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Sparkles size={14} />
                            Insights
                          </h4>
                          <p className="text-slate-300 text-sm italic leading-relaxed">
                            {currentDetails.literaryInsight}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-slate-900/50 border-t border-white/5 flex justify-end">
                <button 
                  onClick={() => setShowDetailModal(false)}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="mt-20 text-center text-slate-500 text-sm pb-10">
        <p>© {new Date().getFullYear()} Literature Memory Trainer. All rights reserved.</p>
      </footer>

      <style>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        .preserve-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
      `}</style>
    </div>
  );
}
