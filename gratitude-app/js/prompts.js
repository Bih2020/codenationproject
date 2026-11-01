// Gratitude categories, the built-in prompt library, and keyword-based theme inference.

export const CATEGORIES = {
  family: { label: 'Family', emoji: '❤️' },
  friendship: { label: 'Friendship', emoji: '👭' },
  health: { label: 'Health & wellbeing', chip: 'My health', emoji: '😊' },
  work: { label: 'Work', emoji: '💼' },
  learning: { label: 'Learning', emoji: '📚' },
  growth: { label: 'Personal growth', emoji: '🌱' },
  nature: { label: 'Nature', emoji: '🌿' },
  food: { label: 'Food & drink', chip: 'Food', emoji: '🍲' },
  home: { label: 'Home', chip: 'My home', emoji: '🏠' },
  relationships: { label: 'Relationships', emoji: '💞' },
  achievements: { label: 'Achievements', emoji: '🏅' },
  opportunities: { label: 'Opportunities', emoji: '🚪' },
  everyday: { label: 'Small pleasures', chip: 'Today', emoji: '☀️' },
  challenges: { label: 'Growth through difficulty', emoji: '🌈' },
  memories: { label: 'Memories', emoji: '📸' },
  community: { label: 'Community', emoji: '🏘️' },
  kindness: { label: 'Kindness', emoji: '🙏' },
};

/** Quick suggestion chips on the Home screen, in display order. */
export const QUICK_CHIPS = ['family', 'home', 'everyday', 'food', 'friendship', 'nature', 'opportunities', 'learning', 'health', 'kindness'];

export function categoryLabel(id) {
  const c = CATEGORIES[id];
  return c ? `${c.emoji} ${c.label}` : '';
}

const LIBRARY = {
  family: [
    "What's one thing a family member has done that you're grateful for?",
    'Which family member made you smile recently?',
    'What family tradition are you thankful for?',
    'What is something you learned from a parent, grandparent or carer?',
    'Which family moment from this week would you like to remember?',
    'Who in your family always shows up for you?',
    'What do you appreciate about the way your family laughs together?',
    'What small habit of a family member makes your life easier?',
    'Which family meal or gathering do you treasure?',
    'What is a quality you love in someone in your family?',
  ],
  friendship: [
    'Which friend would you like to thank today?',
    'What conversation with a friend lifted you recently?',
    'Who is a friend who really listens to you?',
    'What shared joke still makes you laugh?',
    'Which friend has seen you through a hard time?',
    'What is something a friend taught you without realising it?',
    'Which friendship has grown stronger over the years?',
    'Who made you feel welcome somewhere new?',
    'What message from a friend brightened your day?',
    'Which friend inspires you to be a little braver?',
  ],
  health: [
    'What is something your body allowed you to do today?',
    'How did you rest or recharge recently?',
    'What part of your body are you thankful for today?',
    'Which breath, stretch or walk felt good today?',
    'What healthy habit are you glad you keep?',
    'Who has helped care for your health or wellbeing?',
    'What does your mind feel calm about right now?',
    'Which of your senses gave you joy today?',
    'What good night of sleep or quiet moment are you grateful for?',
    'What is something you can do today that you once found difficult?',
  ],
  work: [
    'What went well at work or in your daily tasks today?',
    'Which colleague made your day a little easier?',
    'What part of your work feels meaningful?',
    'What problem did you solve recently?',
    'What tool or resource makes your work smoother?',
    'What feedback or encouragement did you receive lately?',
    'What do you enjoy about the place you work or study?',
    'Which task are you glad to have finished?',
    'What skill do you use at work that you are proud of?',
    'Who at work would you like to silently thank?',
  ],
  learning: [
    'What lesson have you learned recently?',
    'What new idea caught your interest this week?',
    'Which teacher, mentor or guide are you grateful for?',
    'What book, article or video taught you something?',
    'What question are you curious to explore?',
    'What mistake taught you something useful?',
    'What are you better at now than a year ago?',
    'Which piece of advice has stayed with you?',
    'What learning opportunity do you have that others might not?',
    'What did you understand today that you did not yesterday?',
  ],
  growth: [
    'In what small way have you grown recently?',
    'What boundary are you glad you set?',
    'What are you proud of handling calmly?',
    'Which personal quality has helped you this week?',
    'What habit are you building that you are thankful for?',
    'What did you choose to let go of?',
    'How have you been kind to yourself lately?',
    'What fear felt a little smaller today?',
    'What would your younger self be glad to see in you now?',
    'What decision are you glad you made?',
  ],
  nature: [
    'What is something beautiful you noticed today?',
    'What did the sky look like today?',
    'Which tree, plant or flower caught your eye?',
    'What sound of nature are you grateful for?',
    'How did the weather add something to your day?',
    'Which animal or bird brought you a moment of joy?',
    'What outdoor place helps you feel at peace?',
    'What season or change in nature are you enjoying?',
    'When did fresh air make you feel better?',
    'What view do you love to look at?',
  ],
  food: [
    'What meal or drink did you enjoy today?',
    'Who made or shared food with you recently?',
    'What comforting food reminds you of home?',
    'What flavour or smell made you happy today?',
    'Which simple snack are you grateful for?',
    'What meal shared with others do you remember fondly?',
    'Who grew, carried or cooked the food you ate today?',
    'What new food have you enjoyed trying?',
    'What warm drink brings you comfort?',
    'What is something you enjoy cooking or preparing?',
  ],
  home: [
    'What part of your home are you grateful for?',
    'Which cosy corner do you love to sit in?',
    'What everyday item at home makes life easier?',
    'What does your home protect you from?',
    'What sound or smell makes home feel like home?',
    'Who or what makes your home feel welcoming?',
    'What is something in your home with a happy story?',
    'What do you appreciate about your bed tonight?',
    'Which simple comfort at home did you use today: warmth, water, light?',
    'What do you love about your neighbourhood?',
  ],
  relationships: [
    'Who made you feel loved or valued recently?',
    'What do you appreciate about someone close to you?',
    'Which relationship feels supportive right now?',
    'Who believes in you?',
    'What small gesture of affection did you receive?',
    'Who do you feel completely yourself with?',
    'Which relationship has taught you patience?',
    'What do you love about the way someone cares for you?',
    'Who would you like to tell "thank you" in person?',
    'Which reconnection with someone are you grateful for?',
  ],
  achievements: [
    'What small win did you have today?',
    'What did you finish that you started?',
    'What effort are you proud of, whatever the result?',
    'Which goal are you making progress towards?',
    'What did you do today that took courage?',
    'What are you proud of from this month?',
    'What did you get done that future-you will appreciate?',
    'Which skill took practice that you now enjoy?',
    'What did you do well that nobody noticed?',
    'What progress, however small, are you grateful for?',
  ],
  opportunities: [
    'What opportunity are you grateful to have?',
    'What door has opened for you recently?',
    'What chance to try something new is ahead of you?',
    'What freedom do you have today?',
    'Which invitation or offer are you thankful for?',
    'What resource do you have access to that helps you?',
    'What possibility makes you feel hopeful?',
    'Who gave you a chance when you needed one?',
    'What choice do you get to make today?',
    'What is something you can look forward to?',
  ],
  everyday: [
    'What made you smile today?',
    'What small comfort are you enjoying right now?',
    'What is something you normally take for granted?',
    'What small thing made your life easier today?',
    'What song, sound or silence did you enjoy today?',
    'What made you laugh recently?',
    'What ordinary moment felt good today?',
    'What are you looking at right now that you appreciate?',
    'What simple pleasure is waiting for you later today?',
    'What is one thing that went right today?',
    'What did you enjoy about this morning?',
    'What colour, light or texture did you notice today?',
  ],
  challenges: [
    'What challenge helped you grow?',
    'What difficult experience taught you something valuable?',
    'Who helped you through a hard moment?',
    'What strength did you discover in a tough time?',
    'What problem turned out better than you expected?',
    'What did a disappointment teach you?',
    'What hard day are you glad you got through?',
    'What are you grateful for even on a difficult day?',
    'What did patience teach you recently?',
    'What change, once unwelcome, are you thankful for now?',
  ],
  memories: [
    'What happy memory came to mind recently?',
    'Which childhood memory still makes you smile?',
    'What place holds a special memory for you?',
    'What photo would you love to look at again?',
    'Which celebration do you remember fondly?',
    'What memory of someone special are you grateful for?',
    'What trip or day out do you still think about?',
    'Which song brings back a good memory?',
    'What moment this year would you like to remember forever?',
    'What tradition reminds you of where you come from?',
  ],
  community: [
    'Who in your community makes life better for others?',
    'What local place are you grateful for?',
    'Which service or worker made your day possible?',
    'What group or community do you belong to?',
    'When did you feel part of something bigger?',
    'Who keeps your area clean, safe or running?',
    'What act of community spirit did you notice?',
    'Which local shop, library or park do you appreciate?',
    'Who in your neighbourhood greets you warmly?',
    'How have you been able to contribute to others?',
  ],
  kindness: [
    'Who made your day a little easier?',
    'Who would you like to silently thank today?',
    'What kind words did someone share with you?',
    'What kindness from a stranger do you remember?',
    'Who helped you without being asked?',
    'What act of kindness did you witness today?',
    'What kindness were you able to give today?',
    'Who has been patient with you recently?',
    'Which thoughtful gesture surprised you?',
    'Who checked in on you when you needed it?',
  ],
};

export const PROMPTS = Object.entries(LIBRARY).flatMap(([category, list]) =>
  list.map((text, i) => ({ id: `${category}-${i}`, category, text }))
);

/** Gentle "ordinary things" categories used for the "small everyday things" preference. */
const EVERYDAY_FOCUS = ['everyday', 'nature', 'food', 'home', 'kindness', 'health'];

/**
 * Choose a prompt.
 * @param {object} opts
 * @param {string} [opts.category]   restrict to one category (e.g. a tapped chip)
 * @param {string[]} [opts.preferred] user's preferred categories
 * @param {'all'|'preferred'|'everyday'} [opts.preference]
 * @param {string[]} [opts.recent]   recently shown prompt ids to avoid
 * @param {() => number} [opts.random]
 */
export function pickPrompt({ category, preferred = [], preference = 'all', recent = [], random = Math.random } = {}) {
  let pool = PROMPTS;
  if (category) pool = PROMPTS.filter((p) => p.category === category);
  else if (preference === 'preferred' && preferred.length) pool = PROMPTS.filter((p) => preferred.includes(p.category));
  else if (preference === 'everyday') pool = PROMPTS.filter((p) => EVERYDAY_FOCUS.includes(p.category));
  if (!pool.length) pool = PROMPTS;
  const fresh = pool.filter((p) => !recent.includes(p.id));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(random() * from.length) % from.length];
}

const KEYWORDS = {
  family: ['family', 'mum', 'mom', 'mother', 'dad', 'father', 'parent', 'sister', 'brother', 'sibling', 'son', 'daughter', 'kids', 'children', 'child', 'baby', 'grandma', 'grandad', 'grandpa', 'granny', 'nan', 'aunt', 'uncle', 'cousin', 'niece', 'nephew'],
  friendship: ['friend', 'friends', 'bestie', 'mate', 'mates', 'buddy'],
  health: ['health', 'healthy', 'body', 'sleep', 'slept', 'rested', 'energy', 'walk', 'run', 'exercise', 'gym', 'yoga', 'breathe', 'recovered', 'doctor', 'nurse', 'wellbeing', 'calm', 'medicine'],
  work: ['work', 'job', 'colleague', 'boss', 'manager', 'office', 'meeting', 'project', 'client', 'team', 'career', 'shift', 'salary'],
  learning: ['learn', 'learned', 'learnt', 'learning', 'course', 'class', 'lesson', 'teacher', 'school', 'college', 'university', 'study', 'studying', 'book', 'read', 'exam', 'assignment', 'mentor'],
  growth: ['grew', 'growth', 'proud of myself', 'confidence', 'brave', 'courage', 'boundary', 'myself', 'patience', 'habit'],
  nature: ['nature', 'sun', 'sunshine', 'sunset', 'sunrise', 'rain', 'sky', 'tree', 'trees', 'flower', 'flowers', 'garden', 'park', 'sea', 'beach', 'ocean', 'bird', 'birds', 'walk outside', 'fresh air', 'snow', 'weather', 'forest', 'mountain', 'dog', 'cat', 'pet'],
  food: ['food', 'meal', 'breakfast', 'lunch', 'dinner', 'tea', 'coffee', 'cake', 'cook', 'cooked', 'cooking', 'soup', 'fruit', 'chocolate', 'delicious', 'snack', 'drink', 'pizza', 'bread'],
  home: ['home', 'house', 'flat', 'apartment', 'bed', 'room', 'kitchen', 'sofa', 'couch', 'shower', 'bath', 'heating', 'roof', 'cosy', 'cozy'],
  relationships: ['partner', 'husband', 'wife', 'boyfriend', 'girlfriend', 'love', 'loved', 'relationship', 'fiance', 'fiancé', 'hug'],
  achievements: ['achieved', 'achievement', 'finished', 'completed', 'passed', 'win', 'won', 'goal', 'promotion', 'success', 'accomplished', 'proud'],
  opportunities: ['opportunity', 'chance', 'offer', 'interview', 'new job', 'travel', 'trip', 'able to', 'freedom', 'invited', 'invitation'],
  challenges: ['hard', 'difficult', 'struggle', 'challenge', 'tough', 'overcame', 'got through', 'despite', 'lesson from'],
  memories: ['remember', 'memory', 'memories', 'childhood', 'used to', 'years ago', 'photo', 'nostalgia'],
  community: ['community', 'neighbour', 'neighbor', 'church', 'mosque', 'temple', 'volunteer', 'local', 'library', 'bus driver', 'charity', 'club'],
  kindness: ['kind', 'kindness', 'helped', 'help', 'thoughtful', 'generous', 'stranger', 'thank', 'smiled at me', 'support', 'supported'],
  everyday: ['today', 'smile', 'laugh', 'music', 'song', 'quiet', 'peace', 'moment', 'morning', 'little things'],
};

/** Best-guess theme from free text (used only when the user didn't pick one). */
export function inferCategory(text) {
  const t = ` ${String(text).toLowerCase().replace(/['’]s\b/g, '').replace(/[^\p{L}\p{N}' ]+/gu, ' ')} `;
  let best = null;
  let bestScore = 0;
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    let score = 0;
    for (const w of words) if (t.includes(` ${w} `) || t.includes(` ${w}s `)) score += w.includes(' ') ? 2 : 1;
    // 'everyday' is a weak fallback signal
    if (cat === 'everyday') score *= 0.5;
    if (score > bestScore) {
      best = cat;
      bestScore = score;
    }
  }
  return best;
}

export const POSITIVE_MESSAGES = [
  'There is always something worth noticing.',
  'Notice something good today.',
  'Small moments make a full life.',
  'Pause. Breathe. Notice.',
  'Gratitude turns what we have into enough.',
  'The ordinary is quietly wonderful.',
  'A grateful moment is never wasted.',
  'Look for the light in little things.',
  'What you appreciate, appreciates.',
  'Every day holds at least one good thing.',
];

export const SAVE_ACKNOWLEDGEMENTS = [
  'Gratitude saved. A beautiful moment worth remembering.',
  'Saved. Thank you for pausing.',
  'Gratitude saved. Carry that feeling with you.',
  'Saved. A small moment, beautifully noticed.',
];
