import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Bot,
  User,
  Globe2,
  Sparkles,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Calendar,
  Database,
  CheckCircle2,
} from 'lucide-react';
import DisclaimerBanner from '../components/DisclaimerBanner';
import Badge from '../components/Badge';
import { fetchAssistantChat } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useFarmerProfile } from '../context/FarmerProfileContext';
import { useMarket } from '../context/MarketContext';
import KisanTwinSummaryBanner from '../components/KisanTwinSummaryBanner';

const STARTER_MESSAGES = {
  en: [
    {
      id: 1,
      sender: 'assistant',
      text: 'Namaste! I am Kisan Vaani, your CropBazaar AI advisor powered by Google Gemini. Ask me about actual APMC mandi prices, arrivals, or weather conditions in English, Hindi, or Marathi!',
      timestamp: 'Just now',
      source: 'CropBazaar AI',
    },
  ],
  hi: [
    {
      id: 1,
      sender: 'assistant',
      text: 'नमस्ते! मैं किसान वाणी हूँ, आपका क्रॉपबाज़ार AI सलाहकार (Google Gemini संचालित)। मुझसे नासिक संभाग की APMC मंडियों के भाव, आवक और मौसम के बारे में कुछ भी पूछें!',
      timestamp: 'अभी',
      source: 'क्रॉपबाज़ार AI',
    },
  ],
  mr: [
    {
      id: 1,
      sender: 'assistant',
      text: 'नमस्कार! मी किसान वाणी आहे, तुमचा क्रॉपबाझार AI मार्गदर्शक (Google Gemini समर्थित). मला नाशिक विभागातील बाजार समित्यांचे बाजारभाव, आवक किंवा हवामानाबद्दल मराठीत काहीही विचारा!',
      timestamp: 'आत्ताच',
      source: 'क्रॉपबाझार AI',
    },
  ],
};

const SUGGESTIONS = {
  en: [
    'What was the latest Onion price at APMC Lasalgaon?',
    'Compare Tomato modal prices across Nashik and Pimpalgaon mandis',
    'How much rainfall was recorded recently in Lasalgaon?',
    'What are the current Garlic or Ginger rates?',
  ],
  hi: [
    'लासलगाव मंडी में प्याज का ताजा भाव क्या रहा?',
    'पिंपळगाव और नाशिक मंडी में टमाटर के भाव की तुलना करें',
    'लासलगाव में हाल ही में कितनी बारिश दर्ज की गई?',
    'लहसुन और अदरक का क्या भाव रहा?',
  ],
  mr: [
    'लासलगाव बाजार समितीत कांद्याचा ताजा भाव काय होता?',
    'नाशिक आणि पिंपळगाव बाजार समितीत टोमॅटोच्या भावाची तुलना करा',
    'लासलगावमध्ये नुकताच किती पाऊस नोंदवला गेला?',
    'लसूण आणि आल्याचे सध्याचे दर काय आहेत?',
  ],
};

const SPEECH_LANG_MAP = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
};

export default function KisanVaani({ currentLanguage = 'en', onLanguageChange }) {
  const { user } = useAuth();
  const { profile, profileComplete } = useFarmerProfile();
  const { selectedMandi, selectedCrop } = useMarket();
  const [lang, setLang] = useState(currentLanguage || 'en');
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState(() => STARTER_MESSAGES[lang] || STARTER_MESSAGES.en);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [lastFailedMessage, setLastFailedMessage] = useState(null);

  const activeCrop = (profile?.crop && profile.crop.trim() !== '') ? profile.crop.trim() : (selectedCrop || 'Onion');
  const activeLotSize = profile?.lotSize ? `${profile.lotSize}q` : '30q';
  const activeMandiName = selectedMandi || 'APMC Lasalgaon';

  // Dynamic suggestions reflecting farmer profile and language
  const dynamicSuggestions = useMemo(() => {
    if (lang === 'hi') {
      return [
        `${activeMandiName} में ${activeCrop} का ताजा भाव क्या रहा?`,
        `किस मंडी में ${activeCrop} का सबसे अधिक भाव मिल रहा है?`,
        `क्या मुझे अभी ${activeCrop} बेचना चाहिए या रुकना चाहिए?`,
        `अगले 7 दिनों में ${activeCrop} का अनुमानित भाव क्या रहेगा?`,
        `${activeLotSize} ${activeCrop} बेचकर कितना मुनाफा होगा?`,
      ];
    }
    if (lang === 'mr') {
      return [
        `${activeMandiName} बाजार समितीत ${activeCrop}चा ताजा भाव काय आहे?`,
        `कोणत्या बाजार समितीत ${activeCrop}ला सर्वात जास्त भाव मिळतोय?`,
        `मी आता ${activeCrop} विकू की थांबू?`,
        `पुढील ७ दिवसांत ${activeCrop}चे भाव काय राहतील?`,
        `${activeLotSize} ${activeCrop} विकून किती नफा मिळेल?`,
      ];
    }
    return [
      `What is the latest recorded ${activeCrop} price at ${activeMandiName}?`,
      `Which mandi has the highest ${activeCrop} price in the dataset?`,
      `Should I sell my ${activeCrop}s today or wait?`,
      `What is the expected ${activeCrop} price over the next seven days?`,
      `How much profit can I make by selling ${activeLotSize}?`,
    ];
  }, [lang, activeCrop, activeLotSize, activeMandiName]);

  // Speech Recognition (Voice Input) States
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef(null);

  // Speech Synthesis (Voice Output) States
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [synthSupported, setSynthSupported] = useState(true);

  // Auto-scroll anchor
  const messagesEndRef = useRef(null);

  // Check Web Speech API support on mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
    }
    if (!window.speechSynthesis) {
      setSynthSupported(false);
    }

    return () => {
      // Cleanup speech synthesis on unmount
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
    };
  }, []);

  // Auto-scroll to bottom whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Language switch handler
  const handleLanguageSwitch = (newLang) => {
    // Stop any active speech
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
    }
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (_) {}
      setIsListening(false);
    }

    setLang(newLang);
    if (onLanguageChange) onLanguageChange(newLang);

    // If only starter message exists, replace with new language starter
    if (messages.length <= 1) {
      setMessages(STARTER_MESSAGES[newLang] || STARTER_MESSAGES.en);
    }
  };

  // Voice Input: Toggle Speech Recognition
  const toggleSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. Please type your message.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = SPEECH_LANG_MAP[lang] || 'en-IN';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMsg(null);
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join('');
        setInputMessage(transcript);
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setErrorMsg('Microphone access was denied. Please allow microphone permissions in your browser.');
        } else if (event.error === 'no-speech') {
          // No speech detected, quietly end
        } else {
          setErrorMsg(`Voice input error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  // Voice Output: Read aloud assistant reply
  const toggleSpeechSynthesis = (msgId, rawText) => {
    if (!window.speechSynthesis) {
      alert('Text-to-Speech is not supported in this browser.');
      return;
    }

    // If currently speaking this message, stop
    if (speakingMessageId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    // Stop previous utterance
    window.speechSynthesis.cancel();

    // Strip markdown asterisks, hashes, and bullets for clean speech
    const cleanText = rawText
      .replace(/[*#_~`]/g, '')
      .replace(/₹/g, 'Rupees ')
      .replace(/-/g, ' ');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = SPEECH_LANG_MAP[lang] || 'en-IN';
    utterance.rate = 0.95; // slightly deliberate pacing for clarity

    // Select voice matching language if available
    const voices = window.speechSynthesis.getVoices();
    const targetLangCode = SPEECH_LANG_MAP[lang];
    const matchingVoice = voices.find((v) => v.lang === targetLangCode || v.lang.startsWith(targetLangCode.split('-')[0]));
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    utterance.onstart = () => {
      setSpeakingMessageId(msgId);
    };

    utterance.onend = () => {
      setSpeakingMessageId(null);
    };

    utterance.onerror = (e) => {
      console.warn('Speech synthesis error:', e);
      setSpeakingMessageId(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Send message to Gemini API
  const executeSendMessage = async (textToSend) => {
    const trimmed = (textToSend || inputMessage).trim();
    if (!trimmed || loading) return;

    // Stop active speech recognition or speech output
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
      setIsListening(false);
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
    }

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputMessage('');
    setLoading(true);
    setErrorMsg(null);
    setLastFailedMessage(null);

    // Format bounded history for API
    const historyPayload = updatedMessages
      .filter((m) => m.id !== userMessage.id && !m.isError)
      .slice(-6)
      .map((m) => ({
        sender: String(m.sender || 'assistant'),
        text: String(m.text || ''),
      }));

    let idToken = null;
    if (user && typeof user.getIdToken === 'function') {
      try {
        idToken = await user.getIdToken();
      } catch (_) {}
    }

    try {
      const profilePayload = {
        ...(profile && typeof profile === 'object' ? profile : {}),
        crop: (profile?.crop && profile.crop.trim() !== '') ? profile.crop : selectedCrop,
        selected_mandi: selectedMandi,
      };

      const response = await fetchAssistantChat({
        message: trimmed,
        language: lang,
        history: historyPayload,
        farmer_profile: profilePayload,
        token: idToken,
      });

      const assistantMessage = {
        id: Date.now() + 1,
        sender: 'assistant',
        text: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: response.source_information,
        observationDate: response.data_observation_date,
        modelUsed: response.model_used,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      setLastFailedMessage(trimmed);
      const errorReply = {
        id: Date.now() + 1,
        sender: 'assistant',
        text:
          lang === 'hi'
            ? 'क्षमा करें, AI सलाहकार सेवा से संपर्क करने में समस्या हुई। कृपया पुनः प्रयास करें।'
            : lang === 'mr'
            ? 'क्षमस्व, AI सल्लागार सेवेशी संपर्क साधताना अडचण आली. कृपया पुन्हा प्रयत्न करा.'
            : 'I encountered an issue connecting to the Gemini advisory service. Please try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorReply]);
      setErrorMsg(err.message || 'Service temporarily unavailable');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = (e) => {
    if (e) e.preventDefault();
    executeSendMessage(inputMessage);
  };

  return (
    <div className="space-y-6 flex flex-col flex-1">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-900">Kisan Vaani (किसान वाणी)</h1>
            <Badge variant="emerald" size="xs">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              Google Gemini Powered
            </Badge>
            <Badge variant="emerald" size="xs">
              {activeMandiName}: Active
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            Multilingual agricultural advisor with voice input & read-aloud support.
          </p>
        </div>

        {/* Language selector buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          {[
            { id: 'en', label: 'English' },
            { id: 'hi', label: 'हिंदी (Hindi)' },
            { id: 'mr', label: 'मराठी (Marathi)' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleLanguageSwitch(item.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                lang === item.id
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dataset Context Notice */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs text-emerald-900 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            <strong>Grounded with Real Mandi Observations:</strong> Kisan Vaani checks actual APMC
            auction records and weather station data from Nashik Division before answering.
          </span>
        </div>
        <span className="hidden sm:inline font-mono text-[11px] bg-emerald-100 px-2.5 py-0.5 rounded-full text-emerald-800 shrink-0">
          merged_mandi_weather.csv
        </span>
      </div>

      <KisanTwinSummaryBanner featureName="Kisan Vaani" />

      {/* Error alert banner if any */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-xs font-semibold text-rose-600 hover:text-rose-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Chat Container */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs flex flex-col flex-1 min-h-[520px]">
        {/* Chat Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-green-800 text-white flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                Kisan Vaani Agri-Advisor
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
              <div className="text-[11px] text-slate-500">
                Mode: Live Gemini AI + APMC Mandi Feeds ({lang.toUpperCase()})
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isListening && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-semibold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                Listening ({SPEECH_LANG_MAP[lang]})...
              </span>
            )}
            <Badge variant="emerald" size="xs">
              Language: {lang.toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 max-h-[550px]">
          {messages.map((msg) => {
            const isBot = msg.sender === 'assistant';
            const isSpeaking = speakingMessageId === msg.id;

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${isBot ? '' : 'flex-row-reverse'}`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isBot ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-800 text-white'
                  }`}
                >
                  {isBot ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>

                <div
                  className={`max-w-md sm:max-w-xl rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                    isBot
                      ? msg.isError
                        ? 'bg-rose-50 border border-rose-200 text-rose-900'
                        : 'bg-slate-50 border border-slate-100 text-slate-800 shadow-2xs'
                      : 'bg-emerald-700 text-white shadow-2xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* Metadata and Voice Output controls for Bot Messages */}
                  {isBot && !msg.isError && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <div className="flex flex-wrap items-center gap-2">
                        {msg.observationDate && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-slate-200/80 px-2 py-0.5 rounded-md font-mono text-slate-700">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            Record: {msg.observationDate}
                          </span>
                        )}
                        {msg.modelUsed && (
                          <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md">
                            {msg.modelUsed}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Speaker Read Aloud Button */}
                        <button
                          type="button"
                          onClick={() => toggleSpeechSynthesis(msg.id, msg.text)}
                          className={`p-1 rounded-lg transition-colors flex items-center gap-1 ${
                            isSpeaking
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-500 hover:text-emerald-700 hover:bg-slate-200/60'
                          }`}
                          title={isSpeaking ? 'Stop speaking' : 'Read aloud in ' + lang.toUpperCase()}
                        >
                          {isSpeaking ? (
                            <>
                              <VolumeX className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-semibold">Stop</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5" />
                              <span className="text-[10px]">Listen</span>
                            </>
                          )}
                        </button>
                        <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                      </div>
                    </div>
                  )}

                  {/* Retry Action for Error Messages */}
                  {isBot && msg.isError && lastFailedMessage && (
                    <div className="mt-2.5 pt-2 border-t border-rose-200">
                      <button
                        type="button"
                        onClick={() => executeSendMessage(lastFailedMessage)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{lang === 'hi' ? 'पुनः प्रयास करें (Retry)' : lang === 'mr' ? 'पुन्हा प्रयत्न करा (Retry)' : 'Retry'}</span>
                      </button>
                    </div>
                  )}

                  {!isBot && (
                    <div className="text-[10px] mt-1.5 text-right text-emerald-200">
                      {msg.timestamp}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Thinking / Loading indicator */}
          {loading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs text-slate-500 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                <span>
                  {lang === 'hi'
                    ? 'किसान वाणी मंडी डेटा देख रही है...'
                    : lang === 'mr'
                    ? 'किसान वाणी बाजार समिती माहिती तपासत आहे...'
                    : 'Kisan Vaani is analyzing APMC market records...'}
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/70 overflow-x-auto flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
            Suggested:
          </span>
          {dynamicSuggestions.map((query, idx) => (
            <button
              key={idx}
              type="button"
              disabled={loading}
              onClick={() => {
                setInputMessage(query);
              }}
              className="text-xs bg-white border border-slate-200 hover:border-emerald-300 hover:text-emerald-800 text-slate-600 px-3 py-1 rounded-full whitespace-nowrap transition-colors disabled:opacity-50"
            >
              {query}
            </button>
          ))}
        </div>

        {/* Chat Input Bar */}
        <div className="p-4 border-t border-slate-200 bg-white rounded-b-3xl">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            {/* Microphone Button (Speech Recognition) */}
            <button
              type="button"
              onClick={toggleSpeechRecognition}
              disabled={!speechSupported || loading}
              className={`p-2.5 rounded-xl transition-all ${
                isListening
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={
                !speechSupported
                  ? 'Speech recognition not supported in this browser'
                  : isListening
                  ? 'Stop listening'
                  : `Speak in ${SPEECH_LANG_MAP[lang]}`
              }
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <input
              type="text"
              value={inputMessage}
              disabled={loading}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={
                isListening
                  ? 'Listening to your voice...'
                  : lang === 'hi'
                  ? 'अपनी फसल, मंडी भाव या मौसम के बारे में पूछें...'
                  : lang === 'mr'
                  ? 'पिकाचे दर, बाजार समिती किंवा हवामानाबद्दल विचारा...'
                  : 'Ask about crop rates, mandi prices, or weather records...'
              }
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || loading}
              className="p-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 text-white disabled:text-slate-400 transition-colors shadow-xs"
              title="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
