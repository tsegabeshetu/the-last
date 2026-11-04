"""ASAYECH - the AEC emergency assistant.

ASAYECH (Amharic: "example / role model") answers in English or Amharic from a
reviewed emergency knowledge base, points people at the right portal service,
and escalates anything life-threatening to 611. An optional language model can
rephrase the answer, but the safety content always comes from this file: the
assistant never invents dispatch, delivery, or medical facts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from .config import EMERGENCY_NUMBER, OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL

DISCLAIMER_EN = (
    "ASAYECH is a guidance assistant, not a dispatcher or a doctor. "
    f"For danger to life, call {EMERGENCY_NUMBER} now."
)
DISCLAIMER_AM = (
    "አሳየች የመመሪያ ረዳት ነው፣ አስተባባሪ ወይም ሐኪም አይደለም። "
    f"ለሕይወት አስጊ ሁኔታ አሁኑኑ {EMERGENCY_NUMBER} ይደውሉ።"
)


@dataclass(frozen=True)
class Action:
    label_en: str
    label_am: str
    href: str = ""
    phone: str = ""


@dataclass(frozen=True)
class Intent:
    key: str
    keywords_en: tuple[str, ...]
    keywords_am: tuple[str, ...]
    answer_en: str
    answer_am: str
    actions: tuple[Action, ...] = field(default_factory=tuple)
    urgent: bool = False


def _a(label_en: str, label_am: str, href: str = "", phone: str = "") -> Action:
    return Action(label_en=label_en, label_am=label_am, href=href, phone=phone)


EMERGENCY = _a("Call 611 now", "አሁኑኑ 611 ይደውሉ", phone=EMERGENCY_NUMBER)
EMERGENCY_PAGE = _a("Open emergency page", "የአደጋ ገጽ ይክፈቱ", href="#/emergency")
REPORT = _a("Report an incident", "አደጋ ያሳውቁ", href="#/report")
RENT = _a("Rent a car", "መኪና ይከራዩ", href="#/emergency?service=rental")
MEDS = _a("Order medication delivery", "መድኃኒት ማድረስ ይዘዙ", href="#/emergency?service=medications")
MISSING = _a("Missing-person reports", "የጠፉ ሰዎች ሪፖርቶች", href="#/missing-persons")
NEWS = _a("Read safety guidance", "የደህንነት መመሪያ ያንብቡ", href="#/news")

INTENTS: tuple[Intent, ...] = (
    Intent(
        key="fire",
        keywords_en=("fire", "smoke", "burning", "flames", "burn", "gas leak", "explosion"),
        keywords_am=("እሳት", "ጢስ", "ይቃጠላል", "ፍንዳታ", "ጋዝ"),
        answer_en=(
            "Fire spreads in seconds. Raise the alarm, get everyone out through the nearest safe exit, "
            "and call 611 from outside. Close doors behind you to slow the smoke, stay low if a corridor "
            "fills, and never go back inside for belongings. If clothes catch fire: stop, drop, and roll. "
            "Do not use water on an electrical or fuel fire."
        ),
        answer_am=(
            "እሳት በሰከንዶች ውስጥ ይስፋፋል። ድምጽ አሰሙ፣ ሁሉም ሰው በቅርቡ በሚገኝ ደህንነቱ የተጠበቀ "
            "መውጫ እንዲወጣ ያድርጉ፣ ከውጭ ሆነው 611 ይደውሉ። ጢስ እንዳይስፋፋ በሮቹን ዘግተው ይሂዱ፣ "
            "ኮሪደሩ ጢስ ከሆነ ዝቅ ብለው ይንቀሳቀሱ፣ ለንብረት ተመልሰው አይግቡ። ልብስ ከተቃጠለ፡ "
            "ቁሙ፣ ወድቁ፣ ይንከባለሉ። በኤሌክትሪክ ወይም በነዳጅ እሳት ላይ ውሃ አይጠቀሙ።"
        ),
        actions=(EMERGENCY, EMERGENCY_PAGE, REPORT),
        urgent=True,
    ),
    Intent(
        key="medical",
        keywords_en=(
            "medical", "ambulance", "injur", "bleed", "unconscious", "breathing", "chest pain",
            "stroke", "seizure", "pregnant", "labor", "first aid", "cpr", "poison", "fever",
        ),
        keywords_am=("ሕክምና", "አምቡላንስ", "ጉዳት", "ደም", "ስትሮክ", "መተንፈስ", "ህመም", "መርዝ"),
        answer_en=(
            "Call 611 for an ambulance and describe the person's condition, age, and exact location. "
            "While you wait: keep the airway open, press firmly on a bleeding wound with a clean cloth, "
            "and keep the person warm. Do not move someone with a suspected neck or back injury unless "
            "they are in immediate danger. If they are not breathing and you are trained, start CPR. "
            "Do not give food or drink to an unconscious person."
        ),
        answer_am=(
            "ለአምቡላንስ 611 ይደውሉ፤ የሰውየውን ሁኔታ፣ ዕድሜ እና ትክክለኛ ቦታ ይንገሩ። እርዳታ እስኪመጣ፡ "
            "የመተንፈሻ መንገድ ክፍት ይሁን፣ የሚወጣ ደም በንጹህ ጨርቅ በጠንካራ አስጨንቁ፣ ሰውየው "
            "እንዲሞቅ ያድርጉ። አንገት ወይም ጀርባ ላይ ጉዳት እንዳለው ከተጠረጠሩ አደጋ ላይ "
            "ካልሆነ በስተቀር አያንቀሳቅሱት። መተንፈስ ከቆመና ስልጠና ካለዎት CPR ይጀምሩ። "
            "ለንቃተ ህሊና የሌለው ሰው ምግብ ወይም መጠጥ አይስጡ።"
        ),
        actions=(EMERGENCY, MEDS, EMERGENCY_PAGE),
        urgent=True,
    ),
    Intent(
        key="safety",
        keywords_en=("gbv", "violence", "abuse", "assault", "harass", "unsafe", "threat", "stalking", "rape"),
        keywords_am=("ጥቃት", "ድብደባ", "ማስፈራሪያ", "ደህንነት", "አስጊ"),
        answer_en=(
            "Your safety comes first. If you are in immediate danger, call 611 or 991. Move to a place "
            "with other people if you can, and tell one person you trust where you are. You do not have "
            "to share details here. The AEC portal can record a confidential report and connect you with "
            "a support partner; you choose whether to include your name and phone number."
        ),
        answer_am=(
            "ደህንነትዎ ቀዳሚ ነው። አሁን አደጋ ላይ ከሆኑ 611 ወይም 991 ይደውሉ። ከቻሉ ሌሎች ሰዎች "
            "ወደሚገኙበት ቦታ ይሂዱ፣ የሚያምኑትን አንድ ሰው የሉበትን ቦታ ያሳውቁ። እዚህ ዝርዝር "
            "መስጠት አያስፈልግዎትም። ፖርታሉ ሚስጥራዊ ሪፖርት መመዝገብ እና ከድጋፍ አጋር ጋር "
            "ማገናኘት ይችላል፤ ስምዎንና ስልክዎን ማካተት የእርስዎ ምርጫ ነው።"
        ),
        actions=(EMERGENCY, REPORT, EMERGENCY_PAGE),
        urgent=True,
    ),
    Intent(
        key="infrastructure",
        keywords_en=("power", "electric", "outage", "water", "leak", "pipe", "road", "pothole", "flood", "bridge"),
        keywords_am=("መብራት", "ኤሌክትሪክ", "ውሃ", "መንገድ", "ጎርፍ", "ብልሽት"),
        answer_en=(
            "Keep clear of fallen lines and standing water near electrical equipment - assume every line "
            "is live. Report the exact landmark, the nearest junction, and whether anyone is trapped. "
            "AEC routes utility reports to the responsible provider and keeps the reference number on "
            "your device so you can follow the status."
        ),
        answer_am=(
            "የወደቁ የኤሌክትሪክ መስመሮችንና በኤሌክትሪክ መሣሪያ አጠገብ ያለ ውሃን ይራቁ - ሁሉም መስመር "
            "በሕይወት እንዳለ አስቡ። ትክክለኛውን ምልክት፣ በቅርቡ ያለውን መገናኛ እና ሰው "
            "እንደተያዘ ያሳውቁ። AEC ሪፖርቱን ለሚመለከተው አገልግሎት አቅራቢ ያስተላልፋል፣ "
            "የማጣቀሻ ቁጥሩንም በመሣሪያዎ ላይ ያስቀምጣል።"
        ),
        actions=(REPORT, EMERGENCY_PAGE),
    ),
    Intent(
        key="rental",
        keywords_en=("rent", "rental", "car", "vehicle", "driver", "van", "ambulance car", "transport", "evacuate"),
        keywords_am=("መኪና", "ኪራይ", "ተሽከርካሪ", "አሽከርካሪ", "ማጓጓዝ"),
        answer_en=(
            "The emergency page has a car-rental service for evacuation, hospital runs, and family "
            "transport. Choose a vehicle (sedan, van, 4x4, or cargo), pick the city and dates, and say "
            "whether you need a driver. Availability, the daily rate, and the total are shown before you "
            "submit, and you receive a request reference immediately. A request is a booking request, "
            "not a confirmed dispatch - the partner calls you to confirm."
        ),
        answer_am=(
            "የአደጋ ገጹ ለመልቀቅ፣ ወደ ሆስፒታል ለመሄድና ቤተሰብን ለማጓጓዝ የመኪና ኪራይ "
            "አገልግሎት አለው። ተሽከርካሪ ይምረጡ (ሴዳን፣ ቫን፣ 4x4 ወይም ጭነት)፣ ከተማና "
            "ቀኖችን ይምረጡ፣ አሽከርካሪ እንደሚያስፈልግዎ ይንገሩ። አቅርቦቱ፣ የቀን ዋጋና ጠቅላላ "
            "ድምሩ ከማስገባትዎ በፊት ይታያል፣ የማጣቀሻ ቁጥርም ወዲያውኑ ይሰጥዎታል። ጥያቄው "
            "የተጠየቀ ቦታ ማስያዝ ነው፣ የተረጋገጠ ምላሽ አይደለም - አጋሩ ደውሎ ያረጋግጣል።"
        ),
        actions=(RENT, EMERGENCY_PAGE),
    ),
    Intent(
        key="medication",
        keywords_en=("medicine", "medication", "pharmacy", "drug", "prescription", "insulin", "delivery", "dose"),
        keywords_am=("መድኃኒት", "ፋርማሲ", "ማድረስ", "ኢንሱሊን", "ማዘዝ"),
        answer_en=(
            "The emergency page delivers medication from partner pharmacies. Add items to the basket, "
            "choose a pharmacy and city, then enter the delivery address. Prescription-only medicines "
            "require a prescription reference, and a pharmacist verifies it before anything leaves the "
            "pharmacy. Urgent orders are marked for priority review. Payment is on delivery; ASAYECH "
            "never processes payments or promises a delivery time."
        ),
        answer_am=(
            "የአደጋ ገጹ ከአጋር ፋርማሲዎች መድኃኒት ያደርሳል። ዕቃዎችን ወደ ቅርጫት ያክሉ፣ "
            "ፋርማሲና ከተማ ይምረጡ፣ የማድረሻ አድራሻ ያስገቡ። በሐኪም ማዘዣ ብቻ የሚሰጡ "
            "መድኃኒቶች የማዘዣ ቁጥር ይፈልጋሉ፣ ፋርማሲስት ከመላኩ በፊት ያረጋግጣል። አስቸኳይ "
            "ትዕዛዞች ቅድሚያ ይሰጣቸዋል። ክፍያ በማድረሻ ጊዜ ነው፤ አሳየች ክፍያ አይፈጽምም "
            "ወይም የማድረሻ ጊዜ ቃል አይገባም።"
        ),
        actions=(MEDS, EMERGENCY_PAGE),
    ),
    Intent(
        key="missing",
        keywords_en=("missing", "lost", "disappeared", "cannot find", "kidnap", "abduct", "child gone"),
        keywords_am=("ጠፍቷል", "ጠፍታ", "ጠፍተዋል", "አልተገኘም", "ተጠልፏል"),
        answer_en=(
            "Report a missing person as soon as you are concerned - there is no waiting period. Use the "
            "missing-persons page with the most recent photo, what the person was wearing, any medical "
            "condition, and the exact last-seen place and time. Only a consenting family member can "
            "submit, and reports are published without inventing details. If you believe someone is in "
            "immediate danger, call 611 and the police as well."
        ),
        answer_am=(
            "የጠፋ ሰው እንዳለ እንደተጨነቁ ወዲያውኑ ሪፖርት ያድርጉ - የመጠበቂያ ጊዜ የለም። "
            "የጠፉ ሰዎች ገጽን በመጠቀም የቅርብ ጊዜ ፎቶ፣ የለበሱት ልብስ፣ የጤና ሁኔታ እና "
            "ትክክለኛውን የመጨረሻ ቦታና ሰዓት ያካትቱ። ፈቃድ የሰጠ የቤተሰብ አባል ብቻ "
            "ማስገባት ይችላል፣ ዝርዝሮች አይፈጠሩም። አሁን አደጋ ላይ ነው ብለው ካመኑ "
            "611 እና ፖሊስንም ይደውሉ።"
        ),
        actions=(MISSING, EMERGENCY),
        urgent=True,
    ),
    Intent(
        key="contacts",
        keywords_en=("number", "contact", "call", "hotline", "police", "ambulance number", "911", "991"),
        keywords_am=("ቁጥር", "ስልክ", "መደወል", "ፖሊስ", "ሆትላይን"),
        answer_en=(
            "Emergency numbers: 611 is the AEC national response line, 991 reaches the police, and 907 "
            "reaches the ambulance service in Addis Ababa. Save them now, before you need them. If you "
            "are not sure which service to call, call 611 and the operator will route you."
        ),
        answer_am=(
            "የአደጋ ቁጥሮች፡ 611 የAEC ብሔራዊ ምላሽ መስመር ነው፣ 991 ፖሊስን፣ 907 በአዲስ "
            "አበባ የአምቡላንስ አገልግሎትን ያገኛል። ከፍላጎትዎ በፊት አሁን ያስቀምጡ። "
            "የትኛውን አገልግሎት መደወል እንዳለብዎ ካልተረዱ 611 ይደውሉ፣ ኦፕሬተሩ ያዞራል።"
        ),
        actions=(EMERGENCY, EMERGENCY_PAGE),
        urgent=True,
    ),
    Intent(
        key="preparedness",
        keywords_en=("prepare", "preparedness", "kit", "go bag", "checklist", "earthquake", "drought"),
        keywords_am=("ዝግጁ", "ቅድመ ዝግጅት", "ሻንጣ", "የምክር ዝርዝር"),
        answer_en=(
            "A basic household kit: three days of water (about 3 litres per person per day), ready-to-eat "
            "food, a torch with spare batteries, a power bank, copies of IDs in a waterproof bag, a "
            "written list of prescriptions, a first-aid kit, and cash in small notes. Agree a family "
            "meeting point and practise leaving your home in the dark. Check the kit every three months."
        ),
        answer_am=(
            "መሠረታዊ የቤት ዝግጅት፡ ለሦስት ቀን ውሃ (ለአንድ ሰው በቀን 3 ሊትር ገደማ)፣ "
            "ዝግጁ ምግብ፣ ባትሪ ያለው ባለእጅ መብራት፣ የስልክ ቻርጅ፣ በውሃ የማይገባ ሻንጣ ውስጥ "
            "የመታወቂያ ቅጂ፣ የመድኃኒት ዝርዝር፣ የመጀመሪያ እርዳታ ስብስብ እና ትንሽ ሳንቲም። "
            "የቤተሰብ መገናኛ ቦታ ይስሙበት፣ በጨለማ ከቤት መውጣትን ይለማመዱ። በየሦስት ወሩ "
            "ዝግጅቱን ያረጋግጡ።"
        ),
        actions=(NEWS, EMERGENCY_PAGE),
    ),
)

GREETING_EN = (
    "Hello, I am ASAYECH, the AEC emergency assistant. I can guide you through fire, medical, and "
    "personal-safety emergencies, power or water failures, missing-person reports, car rental, and "
    "medication delivery. What is happening right now?"
)
GREETING_AM = (
    "ሰላም፣ እኔ አሳየች የAEC የአደጋ ረዳት ነኝ። በእሳት፣ በሕክምናና በግል ደህንነት አደጋዎች፣ "
    "በመብራት ወይም በውሃ ብልሽት፣ በጠፉ ሰዎች ሪፖርት፣ በመኪና ኪራይ እና በመድኃኒት ማድረስ "
    "ልመራዎት እችላለሁ። አሁን ምን እየተፈጸመ ነው?"
)

FALLBACK_EN = (
    "I can help with fire, medical emergencies, personal safety, power and water failures, "
    "missing-person reports, car rental, and medication delivery. Tell me which one is closest to "
    "your situation, or choose a quick action below. If anyone is in danger, call 611 now."
)
FALLBACK_AM = (
    "በእሳት፣ በሕክምና አደጋ፣ በግል ደህንነት፣ በመብራትና በውሃ ብልሽት፣ በጠፉ ሰዎች ሪፖርት፣ "
    "በመኪና ኪራይ እና በመድኃኒት ማድረስ ልረዳ እችላለሁ። ከሁኔታዎ በጣም የቀረበውን "
    "ይንገሩኝ፣ ወይም ከታች ካሉት አማራጮች ይምረጡ። ሰው አደጋ ላይ ካለ አሁኑኑ 611 ይደውሉ።"
)

SUGGESTION_BANK = (
    (("Fire", "እሳት"), "I smell smoke in my building"),
    (("Medical emergency", "የሕክምና አደጋ"), "Someone is unconscious and bleeding"),
    (("Power line down", "የመብራት መስመር ወድቋል"), "A power line fell on my street"),
    (("Rent a car", "መኪና ኪራይ"), "I need a car to reach the hospital"),
    (("Order medicine", "መድኃኒት ማዘዝ"), "Can I get insulin delivered tonight?"),
    (("Missing person", "የጠፋ ሰው"), "How do I report a missing person?"),
)


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def _score(intent: Intent, text: str) -> int:
    score = 0
    for keyword in intent.keywords_en:
        if keyword in text:
            score += 3 if " " in keyword else 2
    for keyword in intent.keywords_am:
        if keyword in text:
            score += 3
    return score


def match_intent(message: str) -> Intent | None:
    text = _normalise(message)
    best: tuple[int, Intent] | None = None
    for intent in INTENTS:
        score = _score(intent, text)
        if score and (best is None or score > best[0]):
            best = (score, intent)
    return best[1] if best else None


def suggestions_for(language: str, intent: Intent | None = None) -> list[dict[str, str]]:
    picks = list(intent.actions) if intent else []
    seen = {(a.label_en, a.href, a.phone) for a in picks}
    for labels, _prompt in SUGGESTION_BANK:
        action = _a(labels[0], labels[1], href="")
        if len(picks) >= 4:
            break
        if (action.label_en, action.href, action.phone) not in seen:
            picks.append(action)
            seen.add((action.label_en, action.href, action.phone))
    return [
        {
            "label": a.label_en if language == "en" else a.label_am,
            "href": a.href,
            "phone": a.phone,
        }
        for a in picks[:4]
    ]


def starters(language: str) -> list[dict[str, str]]:
    return [
        {"label": labels[0] if language == "en" else labels[1], "prompt": prompt}
        for labels, prompt in SUGGESTION_BANK
    ]


def greeting(language: str) -> str:
    return GREETING_EN if language == "en" else GREETING_AM


def local_answer(message: str, language: str) -> dict[str, Any]:
    intent = match_intent(message)
    if intent is None:
        return {
            "reply": FALLBACK_EN if language == "en" else FALLBACK_AM,
            "intent": "fallback",
            "escalate": False,
            "suggestions": suggestions_for(language),
            "disclaimer": DISCLAIMER_EN if language == "en" else DISCLAIMER_AM,
            "source": "knowledge-base",
        }
    return {
        "reply": intent.answer_en if language == "en" else intent.answer_am,
        "intent": intent.key,
        "escalate": intent.urgent,
        "suggestions": suggestions_for(language, intent),
        "disclaimer": DISCLAIMER_EN if language == "en" else DISCLAIMER_AM,
        "source": "knowledge-base",
    }


SYSTEM_PROMPT = """You are ASAYECH, the emergency assistant for AEC (AuraStay Emergency Portal Center) in Ethiopia.
Rules you must never break:
- Answer in the language the user wrote in (English or Amharic).
- Never claim that help, an ambulance, a rental car, or a medicine delivery has been dispatched. Requests are requests until a human partner confirms.
- Never give a diagnosis, dosage, or prescription. Refer prescription questions to a pharmacist or clinician.
- For danger to life, first tell the user to call 611 immediately.
- Keep answers under 120 words, calm, concrete, and step-based.
- Never invent incident reports, missing-person cases, prices, or delivery times.
The reviewed guidance below is the only factual basis you may use. Rephrase it, do not extend it."""


async def llm_answer(message: str, language: str, history: list[dict[str, str]]) -> str | None:
    """Optionally rephrase the reviewed answer. Returns None on any failure."""
    if not OPENAI_API_KEY:
        return None
    intent = match_intent(message)
    guidance = (
        intent.answer_en if intent and language == "en" else intent.answer_am if intent else FALLBACK_EN if language == "en" else FALLBACK_AM
    )
    payload = {
        "model": OPENAI_MODEL,
        "temperature": 0.2,
        "max_tokens": 260,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT + f"\n\nREVIEWED GUIDANCE:\n{guidance}"},
            *[{"role": turn["role"], "content": turn["content"]} for turn in history[-6:]],
            {"role": "user", "content": message},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(
                f"{OPENAI_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            text = (data["choices"][0]["message"]["content"] or "").strip()
            return text[:1200] or None
    except Exception:
        # Any failure falls back to the reviewed local answer.
        return None
