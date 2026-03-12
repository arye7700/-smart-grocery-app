import React, { useState, useEffect } from 'react';
import { ShoppingCart, Brain, Plus, Check, X, RefreshCw, MessageCircle, AlertCircle, Edit2, Save, Sparkles, Loader2, MapPin, CalendarDays, DollarSign, Search, ShoppingBag, Wand2 } from 'lucide-react';

const STOP_WORDS = ['כן', 'לא', 'הזמנתי', 'לא הזמנתי', 'הודעה נערכה', 'מוצפנות', 'יצרת את', 'תודה', 'אוקי', 'בסדר', 'טוב', 'אולי', 'נראה לי'];
const QUESTION_WORDS = ['איזה', 'כמה', 'איפה', 'למה', 'מתי', 'איך', 'האם'];
const ALIAS_DICTIONARY = {
  'ביצים': 'ביצה', 'בננות': 'בננה', 'עגבניות': 'עגבניה', 'מלפפונים': 'מלפפון', 'תפוחים': 'תפוח', 'תפוחי אדמה': 'תפוח אדמה',
  'בצלים': 'בצל', 'גזרים': 'גזר', 'פלפלים': 'פלפל', 'פטריות': 'פטריה', 'נקניקיות': 'נקניקיה', 'לחמניות': 'לחמניה', 'פיתות': 'פיתה',
  'גבינצ': 'גבינה צהובה', 'תפוא': 'תפוח אדמה', 'שמן זית': 'שמן זית', 'סבון כלים': 'נוזל כלים', 'טישו': 'נייר טואלט', 'גלילי טישו': 'נייר טואלט'
};

const SERVER_URL = 'https://smart-grocery-server-u38w.onrender.com';
// מפתח ה-API מסופק על ידי סביבת הריצה של המערכת (לצורך ניקוי טקסט והוספה חופשית)
const apiKey = ""; 

export default function App() {
  const [activeTab, setActiveTab] = useState('smart-list');
  const [database, setDatabase] = useState({});
  const [currentList, setCurrentList] = useState([]);
  
  // הוספת פריטים
  const [newItemName, setNewItemName] = useState('');
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  
  const [userCity, setUserCity] = useState('');
  const [lastGeneralShopDate, setLastGeneralShopDate] = useState('');
  
  const [whatsappText, setWhatsappText] = useState('');
  const [importStatus, setImportStatus] = useState({ text: '', type: '' });
  const [editingItem, setEditingItem] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editInterval, setEditInterval] = useState('');
  const [isAICleaning, setIsAICleaning] = useState(false);

  // מצבי מחירים (השוואת סל)
  // structure: { status: 'idle' | 'loading' | 'done' | 'error', stores: [], matched: 0, total: 0 }
  const [basketPrices, setBasketPrices] = useState({ status: 'idle' });
  const [itemPricesOpen, setItemPricesOpen] = useState({});
  const [itemPricesData, setItemPricesData] = useState({});
  const [isLoadingPrices, setIsLoadingPrices] = useState({});

  // --------------------------------------------------------
  // אינטגרציית מחירי אמת
  // --------------------------------------------------------
  
  const toggleItemPrices = async (itemName) => {
    setItemPricesOpen(prev => ({ ...prev, [itemName]: !prev[itemName] }));
    if (itemPricesData[itemName]) return;

    setIsLoadingPrices(prev => ({ ...prev, [itemName]: true }));
    try {
      const response = await fetch(`${SERVER_URL}/api/prices?item=${encodeURIComponent(itemName)}`);
      if (response.ok) {
        const data = await response.json();
        setItemPricesData(prev => ({ ...prev, [itemName]: data }));
      }
    } catch (error) {
      console.error("שגיאה במשיכת מחירים מהשרת:", error);
    } finally {
      setIsLoadingPrices(prev => ({ ...prev, [itemName]: false }));
    }
  };

  const calculateBasketCost = async () => {
    // נחשב רק עבור מוצרים שעדיין לא סומנו כ"נקנו"
    const itemsToBuy = currentList.filter(item => !item.checked);
    if (itemsToBuy.length === 0) {
      alert("אין מוצרים להשוואה (סמן מוצרים שטרם נקנו)");
      return;
    }
    
    setBasketPrices({ status: 'loading', matched: 0, total: itemsToBuy.length });
    const storeTotals = {};
    let matchedCount = 0;

    try {
      for (const item of itemsToBuy) {
        const response = await fetch(`${SERVER_URL}/api/prices?item=${encodeURIComponent(item.name)}`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            matchedCount++;
            data.forEach(priceData => {
              if (!storeTotals[priceData.store]) storeTotals[priceData.store] = 0;
              storeTotals[priceData.store] += priceData.price;
            });
          }
        }
      }

      const sortedStores = Object.keys(storeTotals)
        .map(store => ({ store, total: Number(storeTotals[store].toFixed(2)), branch: userCity || 'באזורך' }))
        .sort((a, b) => a.total - b.total)
        .slice(0, 3);

      setBasketPrices({ 
        status: 'done', 
        stores: sortedStores, 
        matched: matchedCount, 
        total: itemsToBuy.length 
      });
    } catch (error) {
      console.error("שגיאה בחישוב הסל:", error);
      setBasketPrices({ status: 'error' });
      alert("שגיאה: השרת לא מגיב. ודא ש- server.js רץ ברקע.");
    }
  };

  // --------------------------------------------------------
  // AI Tools (הוספה חופשית וניקוי מאגר)
  // --------------------------------------------------------

  const handleBulkAIParsing = async () => {
    if (!bulkText.trim()) return;
    setIsBulkProcessing(true);
    
    const prompt = `אתה עוזר אישי לקניות של משפחה ישראלית. המשתמש כתב משפט חופשי עם דברים שחסרים בבית.
    משימתך: חלץ מתוך הטקסט אך ורק את שמות מוצרי המזון ומוצרי הסופר שצריך לקנות.
    המר אותם לשמות בסיסיים (למשל "3 בקבוקי חלב" -> "חלב", "עגבניות" -> "עגבניה").
    החזר *אך ורק* מערך JSON חוקי של מחרוזות. ללא שום מילה נוספת וללא פתיח.
    
    טקסט לעיבוד: "${bulkText}"`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      const items = JSON.parse(text);

      if (Array.isArray(items)) {
        let addedCount = 0;
        const newItems = [];
        
        items.forEach(rawName => {
          const name = normalizeItemName(rawName);
          if (name.length > 1 && !currentList.find(i => i.name === name) && !newItems.find(i => i.name === name)) {
            // הוספת מידע חכם אם קיים במוח
            const dbItem = database[name];
            let isSmart = false, daysPassed = 0, avgInterval = 0;
            if (dbItem && dbItem.lastBought) {
               const diffTime = new Date().getTime() - new Date(dbItem.lastBought).getTime();
               daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
               avgInterval = dbItem.avgInterval;
               isSmart = true;
            }
            newItems.push({ name, checked: false, isSmart, daysPassed, avgInterval });
            addedCount++;
          }
        });
        
        setCurrentList(prev => [...newItems, ...prev]);
        setBasketPrices({ status: 'idle' }); // איפוס מחירים
        setBulkText('');
        setIsBulkAddOpen(false);
      }
    } catch (error) {
      console.error("Bulk parse error:", error);
      alert("קרתה שגיאה בפענוח הטקסט החופשי. אנא נסה שנית.");
    }
    setIsBulkProcessing(false);
  };

  const runAICleanup = async () => {
    setIsAICleaning(true);
    const items = Object.keys(database);
    if(items.length === 0) { setIsAICleaning(false); return; }
    
    const promptText = `
    אתה עוזר חכם לניהול רשימת קניות. חילצנו מילים מקבוצת וואטסאפ.
    1. זיהוי טעויות וזבל: סנן מילים שאינן מוצרי סופר (למשל "הודעה נערכה", "לא הזמנתי", "איזה מרכך?", "תודה"). החזר עבורן null.
    2. איחוד שמות נרדפים (למשל "ברוקלי קפוא" ו"ברוקולי" -> "ברוקולי").
    החזר רק JSON שבו ה-Key הוא המחרוזת המקורית, וה-Value הוא השם המתוקן או null.
    רשימה: ${JSON.stringify(items)}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const result = await response.json();
      const mapping = JSON.parse(result.candidates?.[0]?.content?.parts?.[0]?.text);
      
      const newDb = {};
      let removedCount = 0;
      
      Object.keys(database).forEach(oldKey => {
          const mappedVal = mapping[oldKey];
          if (mappedVal === null) { removedCount++; return; } 
          const targetKey = mappedVal || oldKey; 
          if (!newDb[targetKey]) newDb[targetKey] = { history: [], avgInterval: null, lastBought: null };
          newDb[targetKey].history.push(...database[oldKey].history);
      });

      Object.keys(newDb).forEach(key => {
          newDb[key] = { ...newDb[key], ...calculateStats(newDb[key].history) };
      });

      setDatabase(newDb);
      generateSmartList(newDb);
      alert(`ניקוי AI הושלם בהצלחה! סוננו והוסרו ${removedCount} ביטויים שאינם מוצרים.`);
    } catch (e) {
      console.error(e);
      alert('שגיאה בתקשורת עם ה-AI. נסה שוב.');
    }
    setIsAICleaning(false);
  };

  // --------------------------------------------------------
  // Helper Functions
  // --------------------------------------------------------
  const normalizeItemName = (rawName) => {
    let name = rawName.toLowerCase().trim();
    name = name.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
    name = name.replace(/[0-9]+/g, '');
    name = name.replace(/\b(קילו|גרם|חבילה|חבילות|מארז|יחידות|קרטון|בקבוק|בקבוקים)\b/g, '');
    name = name.replace(/\s+/g, ' ').trim();
    if (ALIAS_DICTIONARY[name]) name = ALIAS_DICTIONARY[name];
    return name;
  };

  const isInvalidItem = (rawName) => {
    if (!rawName || rawName.includes('?') || rawName.split(' ').length > 4) return true;
    const lower = rawName.toLowerCase();
    if (STOP_WORDS.some(word => lower.includes(word))) return true;
    if (QUESTION_WORDS.some(word => lower.includes(word))) return true;
    return false;
  };

  const calculateStats = (rawDates) => {
    if (!rawDates || rawDates.length === 0) return { avgInterval: null, lastBought: null, history: [] };
    const uniqueDates = [];
    const seen = new Set();
    rawDates.forEach(d => {
      const dStr = d.toDateString();
      if (!seen.has(dStr)) { seen.add(dStr); uniqueDates.push(d); }
    });

    const sortedDates = [...uniqueDates].sort((a, b) => a.getTime() - b.getTime());
    const lastBought = sortedDates[sortedDates.length - 1];
    if (sortedDates.length <= 1) return { avgInterval: 7, lastBought, history: sortedDates }; 
    
    let totalDays = 0;
    for (let i = 1; i < sortedDates.length; i++) {
      const diffTime = Math.abs(sortedDates[i] - sortedDates[i - 1]);
      totalDays += Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    return { avgInterval: Math.max(1, Math.round(totalDays / (sortedDates.length - 1))), lastBought, history: sortedDates };
  };

  const handleImportWhatsApp = () => {
    if (!whatsappText) return;
    setImportStatus({ text: 'מעבד נתונים...', type: 'info' });
    
    const lines = whatsappText.split('\n');
    const tempDb = {};
    const regex = /\[(.*?)\] .*?: (.*)/;

    lines.forEach(line => {
      const match = line.match(regex);
      if (match) {
        const dateStr = match[1];
        let rawItemName = match[2].replace('‏<ההודעה נערכה>', '').trim();
        if (isInvalidItem(rawItemName)) return;

        const itemName = normalizeItemName(rawItemName);
        if (itemName.length < 2) return;

        let itemDate = new Date(dateStr);
        if (isNaN(itemDate.getTime())) {
             const parts = dateStr.split(/[/, :]/);
             if(parts.length >= 6) {
                 const year = parseInt(parts[2]) + 2000;
                 itemDate = new Date(year, parseInt(parts[0])-1, parseInt(parts[1]));
             } else return;
        }

        if (!tempDb[itemName]) tempDb[itemName] = [];
        tempDb[itemName].push(itemDate);
      }
    });

    let addedCount = 0;
    const newDb = { ...database };

    Object.keys(tempDb).forEach(itemName => {
      const dates = tempDb[itemName];
      const uniqueDays = new Set(dates.map(d => d.toDateString())).size;
      
      if (uniqueDays > 1 || newDb[itemName]) { 
        if (!newDb[itemName]) newDb[itemName] = { history: [] };
        newDb[itemName].history.push(...dates);
        newDb[itemName] = { ...newDb[itemName], ...calculateStats(newDb[itemName].history) };
        addedCount++;
      }
    });

    setDatabase(newDb);
    setWhatsappText('');
    setImportStatus({ text: `הייבוא הושלם! ${addedCount} פריטים נשמרו. לחץ כעת על כפתור סריקת ה-AI לניקוי סופי.`, type: 'success' });
    generateSmartList(newDb);
  };

  const startEditing = (name, data) => {
    setEditingItem(name);
    const d = new Date(data.lastBought || new Date());
    setEditDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    setEditInterval(data.avgInterval);
  };

  const saveEditing = (name) => {
    const newDb = { ...database };
    const newDate = new Date(editDate);
    const newInterval = parseInt(editInterval);
    if (!isNaN(newDate.getTime()) && !isNaN(newInterval)) {
       newDb[name].lastBought = newDate;
       newDb[name].avgInterval = newInterval;
       newDb[name].history.push(newDate);
       setDatabase(newDb);
       generateSmartList(newDb);
    }
    setEditingItem(null);
  };

  const generateSmartList = (db = database) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const suggestedItems = [];
    
    Object.keys(db).forEach(itemName => {
      const item = db[itemName];
      if (item.lastBought && item.avgInterval) {
        const lastBoughtDate = new Date(item.lastBought);
        lastBoughtDate.setHours(0,0,0,0);
        const diffTime = today.getTime() - lastBoughtDate.getTime();
        const daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (daysPassed >= item.avgInterval - 1) {
          suggestedItems.push({ name: itemName, checked: false, isSmart: true, daysPassed, avgInterval: item.avgInterval });
        }
      }
    });

    setCurrentList(prevList => {
      const mergedList = [...prevList];
      suggestedItems.forEach(suggested => {
        const existingIdx = mergedList.findIndex(i => i.name === suggested.name);
        if (existingIdx === -1) mergedList.push(suggested);
        else mergedList[existingIdx] = { ...mergedList[existingIdx], ...suggested };
      });
      return mergedList.sort((a, b) => (b.daysPassed - b.avgInterval) - (a.daysPassed - a.avgInterval));
    });
    setBasketPrices({ status: 'idle' });
  };

  const toggleItem = (name) => {
    setCurrentList(currentList.map(item => item.name === name ? { ...item, checked: !item.checked } : item));
    setBasketPrices({ status: 'idle' });
  };
  
  const removeItem = (name) => {
    setCurrentList(currentList.filter(item => item.name !== name));
    setBasketPrices({ status: 'idle' });
  };
  
  const handleManualAdd = (e) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    const name = normalizeItemName(newItemName);
    const dbItem = database[name];
    let isSmart = false, daysPassed = 0, avgInterval = 0;

    if (dbItem && dbItem.lastBought) {
       const diffTime = new Date().getTime() - new Date(dbItem.lastBought).getTime();
       daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
       avgInterval = dbItem.avgInterval;
       isSmart = true;
    }

    if (!currentList.find(i => i.name === name)) {
      setCurrentList([{ name, checked: false, isSmart, daysPassed, avgInterval }, ...currentList]);
      setBasketPrices({ status: 'idle' });
    }
    setNewItemName('');
  };

  const finishShopping = () => {
    const boughtItems = currentList.filter(item => item.checked);
    if (boughtItems.length === 0) return;

    const today = new Date();
    const newDb = { ...database };

    boughtItems.forEach(item => {
      const name = item.name;
      if (!newDb[name]) newDb[name] = { history: [] };
      newDb[name].history.push(today);
      newDb[name] = { ...newDb[name], ...calculateStats(newDb[name].history) };
    });

    setDatabase(newDb);
    setCurrentList(currentList.filter(item => !item.checked));
    setLastGeneralShopDate(today.toISOString().split('T')[0]);
    setBasketPrices({ status: 'idle' });
  };

  useEffect(() => {
    if (Object.keys(database).length > 0 && currentList.length === 0) generateSmartList();
  }, [database]);

  const getDaysSinceLastShop = () => {
    if (!lastGeneralShopDate) return null;
    const diffTime = new Date().getTime() - new Date(lastGeneralShopDate).getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };
  const daysSinceGeneralShop = getDaysSinceLastShop();

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 text-slate-800 font-sans selection:bg-emerald-200">
      
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-lg border-b border-white/50 shadow-sm p-5 mb-6">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-emerald-500 to-teal-400 p-2.5 rounded-2xl shadow-lg shadow-emerald-200">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-800 to-teal-600">
                קניות חכמות
              </h1>
              <div className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">
                <MapPin className="w-3 h-3" /> {userCity || 'ישראל'}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pb-24">
        
        <div className="flex bg-slate-200/60 p-1.5 rounded-2xl mb-6 shadow-inner backdrop-blur-sm sticky top-[88px] z-10">
          {[
            { id: 'smart-list', label: 'רשימה' },
            { id: 'database', label: 'המוח' },
            { id: 'import', label: 'הגדרות וייבוא' }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${
                activeTab === tab.id 
                ? 'bg-white text-emerald-700 shadow-[0_2px_10px_rgba(0,0,0,0.08)] scale-[1.02]' 
                : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* --- TAB: SMART LIST --- */}
        {activeTab === 'smart-list' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            
            {/* Input Form */}
            <div className="bg-white/80 backdrop-blur-sm p-3 rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-white">
              {!isBulkAddOpen ? (
                <div className="flex flex-col gap-2">
                  <form onSubmit={handleManualAdd} className="relative group">
                    <button type="submit" className="absolute inset-y-0 right-0 flex items-center pr-4 text-emerald-400 hover:text-emerald-600 transition-colors">
                      <Plus className="w-5 h-5" />
                    </button>
                    <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="הוסף מוצר בודד..." className="w-full bg-slate-50 rounded-2xl pr-12 pl-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-400 font-medium placeholder:text-slate-400" />
                  </form>
                  <button onClick={() => setIsBulkAddOpen(true)} className="flex items-center justify-center gap-2 py-2 text-sm font-bold text-purple-600 hover:bg-purple-50 rounded-xl transition-colors">
                    <Wand2 className="w-4 h-4" /> הוספה קסומה (טקסט חופשי מרובה)
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 p-2 animate-in slide-in-from-top-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-purple-700 flex items-center gap-1.5"><Sparkles className="w-4 h-4"/> הוספה חופשית ב-AI</span>
                    <button onClick={() => setIsBulkAddOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                  </div>
                  <textarea 
                    value={bulkText} 
                    onChange={(e) => setBulkText(e.target.value)} 
                    placeholder="כתוב כאן בחופשיות... למשל: 'אני רוצה חלב, שתי לחמניות, גבינה צהובה וקצת מלפפונים'" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                  <button 
                    onClick={handleBulkAIParsing} 
                    disabled={isBulkProcessing || !bulkText.trim()} 
                    className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold py-2.5 rounded-xl shadow-sm flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    {isBulkProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    פענח והוסף לרשימה
                  </button>
                </div>
              )}
            </div>

            {/* בולט! כרטיסיית השוואת סל הממוקמת בראש הרשימה */}
            {currentList.filter(i => !i.checked).length > 0 && (
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-1 shadow-lg overflow-hidden relative">
                <div className="bg-white/10 backdrop-blur-md p-4 rounded-[22px]">
                  
                  {basketPrices.status === 'idle' && (
                    <button onClick={calculateBasketCost} className="w-full flex flex-col items-center justify-center text-white py-2 group">
                      <Search className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
                      <span className="font-bold text-lg">בדוק איפה הסל הכי זול!</span>
                      <span className="text-xs opacity-80 mt-1">משיכת מחירי אמת מהשרת שלך</span>
                    </button>
                  )}

                  {basketPrices.status === 'loading' && (
                    <div className="flex flex-col items-center justify-center text-white py-4 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="font-bold">סורק רשתות שיווק ומחשב סל...</span>
                    </div>
                  )}

                  {basketPrices.status === 'error' && (
                    <div className="text-center py-2 text-red-200">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                      <span className="font-bold">שגיאת התחברות לשרת.</span>
                    </div>
                  )}

                  {basketPrices.status === 'done' && (
                    <div className="animate-in zoom-in-95 duration-300">
                      <div className="flex justify-between items-start mb-4 text-white">
                        <div>
                          <h3 className="font-black text-xl flex items-center gap-2"><DollarSign className="w-6 h-6"/> התוצאות לסל שלך</h3>
                          <div className="inline-flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-full text-[11px] font-bold mt-2">
                            <Check className="w-3 h-3" /> מצאנו מחירי אמת עבור {basketPrices.matched} מתוך {basketPrices.total} מוצרים
                          </div>
                        </div>
                        <button onClick={() => setBasketPrices({status: 'idle'})} className="bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-colors"><X className="w-4 h-4" /></button>
                      </div>

                      {basketPrices.matched === 0 ? (
                        <div className="bg-white/20 rounded-xl p-3 text-sm text-center font-medium text-white">
                          לא מצאנו אף מוצר מהרשימה במסד הנתונים של השרת.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {basketPrices.stores.map((store, i) => (
                            <div key={i} className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm text-slate-800">
                              <div>
                                <span className="font-bold text-md block">{store.store}</span>
                                <span className="text-[10px] text-slate-500">{store.branch}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-black text-xl text-indigo-700">{store.total} ₪</span>
                                <span className="block text-[10px] text-slate-400">עבור {basketPrices.matched} פריטים</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* List Body */}
            {currentList.length === 0 ? (
              <div className="text-center py-16 px-6 bg-white/50 rounded-3xl border border-white/60 shadow-sm mt-4">
                <ShoppingCart className="w-12 h-12 text-emerald-200 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-700 mb-1">הרשימה ריקה</h3>
              </div>
            ) : (
              <div className="bg-white/80 backdrop-blur-md rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-white overflow-hidden mt-4">
                <ul className="divide-y divide-slate-100/80">
                  {currentList.map((item, idx) => {
                    const isOverdue = item.isSmart && item.daysPassed >= item.avgInterval;
                    return (
                    <li key={idx} className={`flex items-center justify-between p-4 transition-all duration-300 ${item.checked ? 'bg-emerald-50/50 opacity-60' : 'hover:bg-slate-50/50'}`}>
                      <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => toggleItem(item.name)}>
                        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${item.checked ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 border-transparent scale-110' : 'border-slate-300 bg-white'}`}>
                          {item.checked && <Check className="w-4 h-4 text-white" />}
                        </div>
                        <div>
                          <span className={`text-lg font-bold transition-all ${item.checked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.name}</span>
                          {item.isSmart && !item.checked && (
                            <div className="flex items-center gap-1.5 mt-1">
                              {isOverdue ? <AlertCircle className="w-3.5 h-3.5 text-orange-500" /> : <Brain className="w-3.5 h-3.5 text-emerald-500" />}
                              <span className={`text-xs font-medium ${isOverdue ? 'text-orange-600' : 'text-emerald-600'}`}>קונים כל {item.avgInterval} ימים (עברו {item.daysPassed})</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <button onClick={() => removeItem(item.name)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                    </li>
                  )})}
                </ul>
              </div>
            )}

            {currentList.some(item => item.checked) && (
              <button onClick={finishShopping} className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold text-lg py-4 rounded-2xl shadow-[0_10px_25px_rgba(16,185,129,0.3)] hover:scale-[1.02] transition-all flex justify-center items-center gap-2 mt-6">
                <Check className="w-6 h-6" /> סיימתי קניות - עדכן הכל!
              </button>
            )}
          </div>
        )}

        {/* --- TAB: DATABASE --- */}
        {activeTab === 'database' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="bg-gradient-to-r from-emerald-100 to-teal-50 p-5 rounded-3xl border border-white shadow-sm mb-6">
              <div className="flex gap-4 items-start">
                <div className="bg-white p-2 rounded-xl shadow-sm"><Brain className="w-6 h-6 text-emerald-600" /></div>
                <p className="text-sm text-emerald-900 font-medium leading-relaxed pt-1 flex-1">
                  המוח לומד מה מתכלה ומתי. לחץ על זכוכית המגדלת ליד מוצר כדי לשלוף מחירי אמת של המוצר מהשרת.
                </p>
              </div>
            </div>

            {Object.keys(database).length === 0 ? (
              <div className="text-center text-slate-400 py-10">אין נתונים במוח.</div>
            ) : (
              <div className="grid gap-3">
                {Object.entries(database).sort((a,b) => a[0].localeCompare(b[0])).map(([name, data]) => (
                  <div key={name} className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm border border-white hover:bg-white transition-all overflow-hidden">
                    
                    {editingItem !== name ? (
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-800 text-lg">{name}</h3>
                            <button onClick={() => startEditing(name, data)} className="text-slate-300 hover:text-blue-500 transition-colors p-1"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => toggleItemPrices(name)} className={`p-1 transition-colors ${itemPricesOpen[name] ? 'text-emerald-600' : 'text-slate-300 hover:text-emerald-500'}`}><Search className="w-4 h-4" /></button>
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">נקנה: {data.lastBought ? new Date(data.lastBought).toLocaleDateString('he-IL') : 'לא ידוע'}</p>
                        </div>
                        <div className="text-center bg-emerald-50/50 px-4 py-2 rounded-xl border border-emerald-100">
                          <p className="text-[10px] text-emerald-600/80 font-bold uppercase tracking-wider mb-0.5">תדירות</p>
                          <p className="font-extrabold text-emerald-700">{data.avgInterval ? `${data.avgInterval} ימ'` : '?'}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-blue-50/50 -m-2 p-4 rounded-xl border border-blue-100 flex flex-col gap-3">
                        <div className="font-bold text-blue-900">{name} - עריכה</div>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-blue-700 font-medium mb-1 block">קנייה אחרונה</label>
                            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full text-sm p-2 rounded-lg border border-blue-200 outline-none" />
                          </div>
                          <div className="w-24">
                            <label className="text-xs text-blue-700 font-medium mb-1 block">תדירות</label>
                            <input type="number" value={editInterval} onChange={(e) => setEditInterval(e.target.value)} className="w-full text-sm p-2 rounded-lg border border-blue-200 outline-none text-center" />
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end mt-2">
                          <button onClick={() => setEditingItem(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500">ביטול</button>
                          <button onClick={() => saveEditing(name)} className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg flex items-center gap-1"><Save className="w-3.5 h-3.5" /> שמור</button>
                        </div>
                      </div>
                    )}

                    {itemPricesOpen[name] && editingItem !== name && (
                      <div className="mt-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-2">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> מחירי אמת מהשרת
                        </p>
                        
                        {isLoadingPrices[name] ? (
                          <div className="flex justify-center p-3"><Loader2 className="w-5 h-5 animate-spin text-emerald-500" /></div>
                        ) : (itemPricesData[name] || []).length === 0 ? (
                          <p className="text-xs text-slate-400 text-center font-bold my-2">לא נמצאו מחירים.</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {itemPricesData[name].map((priceData, i) => (
                              <div key={i} className="flex justify-between items-center text-sm bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <span className="font-bold text-slate-700">{priceData.store} <span className="text-[10px] font-normal text-slate-400">({priceData.branch})</span></span>
                                <span className="font-black text-emerald-700">{priceData.price} ₪</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- TAB: SETTINGS & IMPORT --- */}
        {activeTab === 'import' && (
          <div className="space-y-6 animate-in fade-in duration-500">
             
             <div className="bg-white/80 backdrop-blur-sm p-5 rounded-3xl shadow-sm border border-white">
               <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                 <CalendarDays className="w-5 h-5 text-blue-500" /> הגדרות הבית
               </h2>
               <div className="space-y-4">
                 <div>
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">עיר / אזור מגורים</label>
                   <input type="text" value={userCity} onChange={(e) => setUserCity(e.target.value)} placeholder="למשל: ירושלים, תל אביב..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-400 outline-none" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">תאריך קנייה כללית אחרונה</label>
                   <input type="date" value={lastGeneralShopDate} onChange={(e) => setLastGeneralShopDate(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-400 outline-none" />
                 </div>
               </div>
             </div>

             <div className="bg-white/80 backdrop-blur-sm p-5 rounded-3xl shadow-sm border border-white">
               <div className="flex justify-between items-start mb-4">
                 <h2 className="font-bold text-slate-800 flex items-center gap-2">
                   <MessageCircle className="w-5 h-5 text-green-500" /> ייבוא מצ'אט
                 </h2>
               </div>
               
               <p className="text-xs text-slate-500 mb-3">
                 1. הדבק את הצ'אט ולחץ ייבוא. המערכת תסנן אוטומטית פריטים של פעם אחת.
               </p>
               <textarea value={whatsappText} onChange={(e) => setWhatsappText(e.target.value)} placeholder="הדבק כאן את הצ'אט מקבוצת הוואטסאפ..." className="w-full h-24 p-4 bg-slate-50 border border-slate-200 rounded-xl text-left text-sm font-mono focus:ring-2 outline-none mb-3" dir="ltr" />
               <button onClick={handleImportWhatsApp} disabled={!whatsappText} className={`w-full py-3 rounded-xl font-bold transition-all mb-4 ${whatsappText ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-100 text-slate-400'}`}>
                 שלב 1: ייבא וסנן חד-פעמיים
               </button>

               {importStatus.text && (
                 <div className={`mb-4 p-3 rounded-xl text-sm text-center font-bold border ${importStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                   {importStatus.text}
                 </div>
               )}

               <div className="border-t border-slate-100 pt-4 mt-2">
                 <p className="text-xs text-slate-500 mb-3">
                   2. סריקה מתקדמת: לחץ כאן כדי לתת לבינה המלאכותית לנקות שגיאות, שיחות אישיות (כמו "לא הזמנתי") ולאחד מוצרים כפולים במאגר.
                 </p>
                 <button onClick={runAICleanup} disabled={isAICleaning || Object.keys(database).length === 0} className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50">
                   {isAICleaning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                   {isAICleaning ? 'מנתח...' : 'שלב 2: נקה מילים לא קשורות (AI)'}
                 </button>
               </div>
             </div>
          </div>
        )}

      </main>
    </div>
  );
}