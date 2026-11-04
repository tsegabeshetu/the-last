// ASAYECH answers entirely inside the browser: a reviewed set of common
// questions with clear steps, in English and Amharic. No network call, no
// API key — it works offline and replies instantly.

const DISCLAIMER_EN = 'ASAYECH is a guidance assistant, not a dispatcher or a doctor. For danger to life, call 611 now.';
const DISCLAIMER_AM = 'አሳየች የመመሪያ ረዳት ነው፣ አስተባባሪ ወይም ሐኪም አይደለም። ለሕይወት አስጊ ሁኔታ አሁኑኑ 611 ይደውሉ።';

const CALL_611 = { label: 'Call 611 now', labelAm: 'አሁኑኑ 611 ይደውሉ', phone: '611' };
const OPEN_EMERGENCY = { label: 'Open emergency page', labelAm: 'የአደጋ ገጽ ይክፈቱ', href: '#/emergency' };
const GO_REPORT = { label: 'Report an incident', labelAm: 'አደጋ ያሳውቁ', href: '#/report' };
const GO_MISSING = { label: 'Missing-person reports', labelAm: 'የጠፉ ሰዎች ሪፖርቶች', href: '#/missing-persons' };
const GO_MEDS = { label: 'Order medication delivery', labelAm: 'መድኃኒት ማድረስ ይዘዙ', href: '#/emergency?service=medications' };
const GO_RENT = { label: 'Rent a car', labelAm: 'መኪና ይከራዩ', href: '#/emergency?service=rental' };

// Each topic: match keywords, then a reply built from numbered steps.
const TOPICS = [
  {
    key: 'about',
    keywordsEn: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'how are you',
      'who are you', 'what are you', 'what can you do', 'about you', 'about this', 'describe',
      'your description', 'introduce', 'help me understand'],
    keywordsAm: ['ሰላም', 'እንደምን አደርክ', 'ማን ነህ', 'ስለ እርስዎ', 'ስለ መሳሪያው'],
    stepsEn: [
      'Hello — I am ASAYECH, the helper of the AEC (AuraStay Emergency Portal Center).',
      'What I do: give clear steps for fire, medical, personal-safety, power and water emergencies, and guide you through missing-person reports, car rental, and medicine delivery.',
      'How to use me: type what is happening right now, or tap one of the questions below — I answer instantly, even with no internet.',
      'What I never do: I cannot dispatch an ambulance, a car, or a delivery myself. Every request is confirmed by a human partner, and for danger to life you must call 611 first.',
    ],
    stepsAm: [
      'ሰላም — እኔ አሳየች እናም፣ የAEC (AuraStay Emergency Portal Center) አገልጋይ ነኝ።',
      'የማድረገዎት፡ ለእሳት፣ ለሕክምና፣ ለግል ደህንነት፣ ለመብራትና ለውሃ አደጋዎች ግልጽ ደረጃዎች ማሰጠት፤ በጠፉ ሰዎች ሪፖርት፣ በመኪና ኪራይና በመድኃኒት ማድረስ ማስተካከል።',
      'እንዴት ይጠቀሙብኝ፡ አሁን ምን እየተፈጸመ ነው ይተይቡ፣ ወይም ከታች ካለው ጥያቄ ይንኩ — እንዲያውም ኢንተርኔት ከሌለ ብትኩር አዎንታዊ እሰጣለሁ።',
      'የማድረገዎት አይደለም፡ አምቡላንስ፣ መኪና ወይም ማድረስ በእኔ መላክ አልችልም። ሁሉም ጥያቄ በሰው አጋር ይረጋገጣል፤ ለሕይወት አስጊ ሁኔታ በመጀመሪያ 611 ይደውሉ።',
    ],
    actions: [OPEN_EMERGENCY],
  },
  {
    key: 'fire',
    keywordsEn: ['fire', 'smoke', 'burning', 'flames', 'burn', 'gas leak', 'explosion', ' cháy'],
    keywordsAm: ['እሳት', 'ጢስ', 'ይቃጠላል', 'ፍንዳታ', 'ጋዝ'],
    stepsEn: [
      'Raise the alarm and get everyone out through the nearest safe exit.',
      'Call 611 from outside — never go back inside for belongings.',
      'Close doors behind you to slow the smoke, and stay low if a corridor fills.',
      'If clothes catch fire: stop, drop, and roll.',
      'Never use water on an electrical or fuel fire.',
    ],
    stepsAm: [
      'ድምጽ አሰሙ፣ ሁሉም ሰው በቅርቡ በሚገኝ ደህንነቱ የተጠበቀ መውጫ እንዲወጣ ያድርጉ።',
      'ከውጭ ሆነው 611 ይደውሉ — ለንብረት ተመልሰው አይግቡ።',
      'ክፍሎቹ እንዳይስፋፋ ከኋላቸውን በሩን ዘግተው ይሂዱ፤ ኮሪደሩ ጢስ ከሆነ ዝቅ ብለው ይንቀሳቀሱ።',
      'ልብስ ከተቃጠለ፡ ቁሙ፣ ወድቁ፣ ይንከባለሉ።',
      'በኤሌክትሪክ ወይም በነዳጅ እሳት ላይ ፍጠን ውሃ አይጠቀሙ።',
    ],
    actions: [CALL_611, GO_REPORT, OPEN_EMERGENCY],
    urgent: true,
  },
  {
    key: 'medical',
    keywordsEn: ['medical', 'ambulance', 'injur', 'bleed', 'unconscious', 'breathing', 'chest pain',
      'stroke', 'seizure', 'pregnant', 'labor', 'first aid', 'cpr', 'poison', 'fever', 'sick',
      'not breathing', 'fainted', 'emergency'],
    keywordsAm: ['ሕክምና', 'አምቡላንስ', 'ጉዳት', 'ደም', 'ስትሮክ', 'መተንፈስ', 'ህመም', 'መርዝ'],
    stepsEn: [
      'Call 611 for an ambulance and give the person\'s condition, age, and exact location.',
      'While you wait: keep the airway open, and press firmly on a bleeding wound with a clean cloth.',
      'Keep the person warm; do not move someone with a suspected neck or back injury unless they are in immediate danger.',
      'If they are not breathing and you are trained, start CPR.',
      'Give no food or drink to an unconscious person.',
    ],
    stepsAm: [
      'ለአምቡላንስ 611 ይደውሉ፤ የሰውየውን ሁኔታ፣ ዕድሜና ትክክለኛ ቦታ ይንገሩ።',
      'እርዳታ እስኪመጣ፡ የተመነፋሻውን መንገድ ክፍት ይሁን፤ የሚወጣ ደም በንጹህ ጨርቅ በጠንካራ አስጨንቁ።',
      'ሰውየውን እንዲሞቅ ያድርጉ፤ አንገት ወይም ጀርባ ላይ ጉዳት እንዳለው ከተጠረጠሩ አደጋ ላይ ካልሆነ በስተቀር አያንቀሳቅሱት።',
      'መተንፈስ ከቆመና ስልጠና ካለዎት CPR ይጀምሩ።',
      'ለንቃተ ህሊና የሌለው ሰው ምግብ ወይም መጠጥ አይስጡት።',
    ],
    actions: [CALL_611, GO_MEDS, OPEN_EMERGENCY],
    urgent: true,
  },
  {
    key: 'infrastructure',
    keywordsEn: ['power', 'electric', 'outage', 'blackout', 'water', 'leak', 'pipe', 'road',
      'pothole', 'flood', 'bridge', 'line fell', 'wire', 'street light'],
    keywordsAm: ['መብራት', 'ኤሌክትሪክ', 'ውሃ', 'መንገድ', 'ጎርፍ', 'ብልሽት'],
    stepsEn: [
      'Keep clear of fallen lines and standing water near electrical equipment — assume every line is live.',
      'Report the exact landmark, the nearest junction, and whether anyone is trapped (use the Report page).',
      'AEC routes the report to the responsible provider and keeps the reference number on your device so you can follow the status.',
    ],
    stepsAm: [
      'የወደቁ የኤሌክትሪክ መስመሮችንና በኤሌክትሪክ መሣሪያ አጠገብ ያለውን ውሃን ይራቁ — ሁሉም መስመር በሕይወት እንዳለ አስቡ።',
      'ትክክለኛውን ምልክት፣ በቅርቡ ያለውን መገናኛና ሰው እንደተያዘ ያሳውቁ (ሪፖርት ገጽን ይጠቀሙ።).',
      'AEC ሪፖርቱን ለሚመለከተው አገልግሎት አቅራቢ ያስተላልፋል፤ የማጣቀሻ ቁጥሩን በመሣሪያዎ ላይ ያስቀምጣል።',
    ],
    actions: [GO_REPORT, OPEN_EMERGENCY],
  },
  {
    key: 'rental',
    keywordsEn: ['rent', 'rental', 'car', 'vehicle', 'driver', 'van', 'transport', 'evacuate',
      'hospital run', 'ride'],
    keywordsAm: ['መኪና', 'ኪራይ', 'ተሽከርካሪ', 'አሽከርካሪ', 'ማጓጓዝ'],
    stepsEn: [
      'Open the Emergency page and choose the car-rental service.',
      'Pick the vehicle (sedan, van, 4x4, or cargo), the city, the dates, and whether you need a driver.',
      'Check availability, the daily rate, and the total before you submit — you get a request reference immediately.',
      'A request is a booking request, not a confirmed dispatch: the partner calls you to confirm.',
    ],
    stepsAm: [
      'የአደጋ ገጹን ክፈትው፣ የመኪና ኪራይ አገልግሎትን ይምረጡ።',
      'ተሽከርካሪ (ሴዳን፣ ቫን፣ 4x4 ወይም ጭነት)፣ ከተማ፣ ቀኖች፣ አሽከርካሪ እንደሚያስፈልግዎ ይምረጡ።',
      'ከመላክዎ በፊት አቅርቦት፣ የቀን ዋጋና ጠቅላላ ድምሩን ይመልከቱ — የማጣቀሻ ቁጥር ወዲያውኑ ይሰጥዎታል።',
      'ጥያቄው የተጠየቀ ቦታ ማስያዝ ነው፣ የተረጋገጠ ምላሽ አይደለም — አጋሩ ደውሎ ያረጋግጣል።',
    ],
    actions: [GO_RENT, OPEN_EMERGENCY],
  },
  {
    key: 'medication',
    keywordsEn: ['medicine', 'medication', 'pharmacy', 'drug', 'prescription', 'insulin',
      'delivery', 'dose', 'pill', 'tablet', 'antibiotic'],
    keywordsAm: ['መድኃኒት', 'ፋርማሲ', 'ማድረስ', 'ኢንሱሊን', 'ማዘዝ'],
    stepsEn: [
      'Open the Emergency page and choose medication delivery.',
      'Add items to the basket, choose a pharmacy and the city, then enter the delivery address.',
      'Prescription-only medicines need a prescription reference; a pharmacist verifies it before anything leaves the pharmacy.',
      'Urgent orders are marked for priority review, and payment is on delivery.',
    ],
    stepsAm: [
      'የአደጋ ገጹን ክፈትው፣ የመድኃኒት ማድረስን ይምረጡ።',
      'ዕቃዎችን ወደ ቅርጫት ያክሉ፣ ፋርማሲና ከተማ ይምረጡ፣ የማድረሻ አድራሻ ያስገቡ።',
      'በሐኪም ᛈዣ ብቻ የሚሰጡ መድኃኒቶች የማዘዣ ቁጥር ይፈልጋሉ፤ ፋርማሲስት ከመላኩ በፊት ያረጋግጣል።',
      'አስቸኳይ ትዕዛዞች ቅድሚያ ይሰጣቸዋል፤ ክፍያም በማድረሻ ጊዜ ነው።',
    ],
    actions: [GO_MEDS, OPEN_EMERGENCY],
  },
  {
    key: 'missing',
    keywordsEn: ['missing', 'lost', 'disappeared', 'cannot find', 'kidnap', 'abduct',
      'child gone', 'not come home'],
    keywordsAm: ['ጠፍቷል', 'ጠፍታ', 'ጠፍተዋል', 'አልተገኘም', 'ተጠልፏል'],
    stepsEn: [
      'Report as soon as you are concerned — there is no waiting period.',
      'On the missing-persons page add: the most recent photo, what the person was wearing, any medical condition, and the exact last-seen place and time.',
      'Only a consenting family member can submit, and reports are published without inventing details.',
      'If you believe someone is in immediate danger, call 611 and the police as well.',
    ],
    stepsAm: [
      'እንዳለ እንደተጨነቁ ወዲያውኑ ሪፖርት ያድርጉ — የመጠበቂያ ጊዜ የለም።',
      'በጠፉ ሰዎች ገጽ ላይ ያክሉ፡ የቅርብ ጊዜ ፎቶ፣ የለበሱት ልብስ፣ የጤና ሁኔታና ትክክለኛውን የመጨረሻ ቦታና ሰዓት።',
      'ፈቃድ የሰጠ የቤተሰብ አባል ብቻ ማስገባት ይችላል፤ ዝርዝሮች አይፈጠሩም።',
      'አሁን አደጋ ላይ ነው ብለው ካመኑ 611 እና ፖሊስንም ይደውሉ።',
    ],
    actions: [GO_MISSING, CALL_611],
    urgent: true,
  },
  {
    key: 'contacts',
    keywordsEn: ['number', 'contact', 'hotline', 'police', '911', '991', '907', 'who to call',
      'which number', 'ambulance number'],
    keywordsAm: ['ቁጥር', 'ስልክ', 'መደወል', 'ፖሊስ', 'ሆትላይን'],
    stepsEn: [
      '611 — AEC national response line (fire, medical, any danger to life).',
      '991 — police.   907 — ambulance service in Addis Ababa.',
      'Save all three now, before you need them.',
      'Not sure which service to call? Call 611 and the operator will route you.',
    ],
    stepsAm: [
      '611 — የAEC ብሔራዊ ምላሽ መስመር (እሳት፣ ሕክምና፣ ማንኛውም ለሕይወት አስጊ ሁኔታ)።',
      '991 — ፖሊስ።   907 — በአዲስ አበባ የአምቡላንስ አገልግሎት።',
      'ሦስቱንም ከፈለጉት በፊት አሁን ያስቀምጡ።',
      'የትኛውን አገልግሎት መደወል እንዳለብዎ ካልተረዱ 611 ይደውሉ፤ ኦፕሬተሩ ያዞራል።',
    ],
    actions: [CALL_611, OPEN_EMERGENCY],
    urgent: true,
  },
  {
    key: 'preparedness',
    keywordsEn: ['prepare', 'preparedness', 'kit', 'go bag', 'checklist', 'earthquake',
      'drought', 'evacuation plan'],
    keywordsAm: ['ዝግጁ', 'ቅድመ ዝግጅት', 'ሻንጣ', 'የምክር ዝርዝር'],
    stepsEn: [
      'Pack a basic household kit: three days of water (about 3 litres per person per day), ready-to-eat food, a torch with spare batteries, a power bank.',
      'Add copies of IDs in a waterproof bag, a written list of prescriptions, a first-aid kit, and cash in small notes.',
      'Agree a family meeting point and practise leaving your home in the dark.',
      'Check the kit every three months.',
    ],
    stepsAm: [
      'መሠረታዊ የቤት ዝግጅት ያሸግጡ፡ ለሦስት ቀን ውሃ (ለአንድ ሰው በቀን 3 ሊትር ገደማ)፣ ዝግጁ ምግብ፣ ባትሪ ያለው ባለእጅ መብራት፣ የስልክ ቻርጅ።',
      'በውሃ እንዳይሞቅ ቻጺ ውስጥ የመታወቂያ ቅጂ፣ የመድኃኒት ዝርዝር፣ የመጀመሪያ እርዳታ ስብስብና ትንሽ ሳንቲም ያክሉ።',
      'የቤተሰብ መገናኛ ቦታ ይስሙበት፣ በጨለማ ከቤት መውጣትን ይለማመዱ።',
      'በየሦስት ቀኑ ዝግጁነቱን ያረጋግጡ።',
    ],
    actions: [OPEN_EMERGENCY],
  },
];

const FALLBACK_EN = [
  'I can help with fire, medical emergencies, personal safety, power and water failures, missing-person reports, car rental, and medicine delivery.',
  'Tell me which one is closest to your situation, or tap a question below. If anyone is in danger, call 611 now.',
];
const FALLBACK_AM = [
  'በእሳት፣ በሕክምና አደጋ፣ በግል ደህንነት፣ በመብራትና በውሃ ብልሽት፣ በጠፉ ሰዎች ሪፖርት፣ በመኪና ኪራይና በመድኃኒት ማድረስ ልረዳ እችላለሁ።',
  'ከሁኔታዎ በጣም የቀረበውን ይንገሩኝ፣ ወይም ከታች ካለው ጥያቄ ይንኩ። ሰው አደጋ ላይ ካለ አሁኑኑ 611 ይደውሉ።',
];

function score(topic, text) {
  let total = 0;
  for (const keyword of topic.keywordsEn) if (text.includes(keyword)) total += keyword.includes(' ') ? 3 : 2;
  for (const keyword of topic.keywordsAm) if (text.includes(keyword)) total += 3;
  return total;
}

function normalise(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Answer a message locally. Returns { reply, suggestions, disclaimer } —
 * the same shape the chat panel already renders.
 */
export function answerFor(rawMessage, language = 'en') {
  const text = normalise(String(rawMessage || ''));
  const am = language === 'am';

  let best = null;
  let bestScore = 0;
  for (const topic of TOPICS) {
    const value = score(topic, text);
    if (value > bestScore) {
      best = topic;
      bestScore = value;
    }
  }

  const steps = best ? (am ? best.stepsAm : best.stepsEn) : am ? FALLBACK_AM : FALLBACK_EN;
  const reply = steps.map((step, index) => `${index + 1}. ${step}`).join('\n');

  const suggestions = (best?.actions || [OPEN_EMERGENCY, GO_REPORT]).slice(0, 3).map((action) => ({
    label: am ? action.labelAm : action.label,
    href: action.href || '',
    phone: action.phone || '',
  }));

  return {
    reply,
    suggestions,
    disclaimer: am ? DISCLAIMER_AM : DISCLAIMER_EN,
  };
}
