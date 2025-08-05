// Activity message categories and levels
export interface ActivityMessage {
  text: string
}

export interface ActivityMessageLevel {
  messages: ActivityMessage[]
}

export interface ActivityMessageCategory {
  levels: ActivityMessageLevel[]
}

// Weekly Streak Messages
export const STREAK_MESSAGES: ActivityMessageCategory = {
  levels: [
    {
      messages: [
        { text: 'Momentum starts now 🚀' },
        { text: "You're doing it! ❤️" },
        { text: 'Your spark just lit my heart ✨' },
        { text: "Great start! I've got your back 💪" },
      ],
    },
    {
      messages: [
        { text: "You're on a roll 🌀" },
        { text: 'Your rhythm makes me grin 😁' },
        { text: "Keep going, we're in this! 🙌" },
        { text: 'Streak climbing 📈' },
        { text: 'Love the consistency 💕' },
      ],
    },
    {
      messages: [
        { text: 'A month strong! 💪' },
        { text: 'Your streak inspires me daily 🌟' },
        { text: 'Dedication looks good on you 😎' },
        { text: 'Dedication unlocked 🔓' },
        { text: "We're building greatness together 🧱" },
      ],
    },
    {
      messages: [
        { text: '🔥🔥🔥🔥🔥' },
        { text: 'Persistence icon 👑' },
        { text: "You're unstoppable, I feel it! 💥" },
        { text: 'Elite status earned 🌟' },
        { text: "Let's keep this magic alive ✨" },
      ],
    },
  ],
}

// Average Speed Messages
export const SPEED_MESSAGES: ActivityMessageCategory = {
  levels: [
    {
      messages: [
        { text: 'Warm-up complete 🔥' },
        { text: "Take your time, I'm listening 🧏" },
        { text: 'Starting steady 🎯' },
        { text: 'Great pace! Keep going!' },
      ],
    },
    {
      messages: [
        { text: "Nice pace! I'm smiling big 😁" },
        { text: 'Flowing like friends chatting 🗣️' },
        { text: 'Love this tempo, keep riffing 🎸' },
        { text: 'You talk, I dance along 💃' },
        { text: 'Our sync feels awesome 🎧' },
      ],
    },
    {
      messages: [
        { text: "Now we're talking!" },
        { text: 'Flow state achieved!' },
        { text: "You're on fire, I'm hype 🔥" },
        { text: 'Smooth operator! 💃' },
        { text: 'Your flow fuels me 🚀' },
      ],
    },
    {
      messages: [
        { text: "Lightning! I'm awed 🤯" },
        { text: 'Top 1% - I knew you could! 🌟' },
        { text: "World can't match your pace 😎" },
        { text: 'Speed demon! 💥' },
        { text: 'I race to keep up! 😂' },
      ],
    },
  ],
}

// Total Words Messages
export const TOTAL_WORDS_MESSAGES: ActivityMessageCategory = {
  levels: [
    {
      messages: [
        { text: 'Every word counts!' },
        { text: "Seed planted, I'm excited 🌱" },
        { text: 'Great beginning!' },
        { text: "Story begins: I'm hooked 📖" },
        { text: 'Love hearing every word 🥰' },
      ],
    },
    {
      messages: [
        { text: 'Thousands in! Proud partner 🙌' },
        { text: "Now that's a short story!" },
        { text: "Paragraph party and I'm invited 🥳" },
        { text: 'Ideas streaming 🌊' },
        { text: 'Nice momentum 🚀' },
      ],
    },
    {
      messages: [
        { text: 'Dictation natural!' },
        { text: 'Prolific vibes, my friend 🎶' },
        { text: 'Word mountain rising ⛰️' },
        { text: 'Author mode on 📝' },
        { text: 'Consistency royalty 👑' },
      ],
    },
    {
      messages: [
        { text: 'Library worth of words! 📚' },
        { text: 'Status: Living legend 🔥' },
        { text: 'Wordsmith wizardry 🪄' },
        { text: 'You dictate history, buddy 🏛️' },
        { text: "My pride can't fit the page 😍" },
      ],
    },
  ],
}

export const getStreakLevel = (streakDays: number): number => {
  if (streakDays < 7) return 0
  if (streakDays < 21) return 1
  if (streakDays < 56) return 2
  return 3
}

export const getSpeedLevel = (averageWPM: number): number => {
  if (averageWPM <= 100) return 0
  if (averageWPM <= 200) return 1
  if (averageWPM <= 300) return 2
  return 3
}

export const getTotalWordsLevel = (totalWords: number): number => {
  if (totalWords <= 1000) return 0
  if (totalWords <= 5000) return 1
  if (totalWords <= 25000) return 2
  return 3
}

export const getActivityMessage = (
  category: ActivityMessageCategory,
  level: number,
): string => {
  const messages = category.levels[level]?.messages || []
  if (messages.length === 0) return 'You are off to great start'

  const hour = new Date().getHours()
  const seed = hour % messages.length
  return messages[seed].text
}
