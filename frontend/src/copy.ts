import type { Profile } from './hub'

type Words = {
  home: string; activity: string; apps: string; family: string; profile: string; hello: (name: string) => string; tagline: string;
  askTitle: string; speak: string; listening: string; askExample: string; typeIt: string; askButton: string;
}

const english: Words = {
  home: 'Home', activity: 'Activity', apps: 'Apps', family: 'Family', profile: 'Profile',
  hello: (name) => `Hello, ${name}.`, tagline: 'A little help with your day.',
  askTitle: 'Just tell Saathi what you need', speak: 'Tap and speak', listening: 'Listening… tap to stop',
  askExample: 'For example: “Take me to Dr Mehta’s clinic” or “I want something light to eat”.',
  typeIt: 'Or type it here', askButton: 'Ask Saathi',
}

const hindi: Words = {
  home: 'होम', activity: 'गतिविधि', apps: 'ऐप्स', family: 'परिवार', profile: 'प्रोफ़ाइल',
  hello: (name) => `नमस्ते, ${name}।`, tagline: 'आज क्या मदद चाहिए?',
  askTitle: 'बस बताइए, क्या चाहिए', speak: 'दबाएँ और बोलें', listening: 'सुन रहा हूँ… रोकने के लिए दबाएँ',
  askExample: 'जैसे: “मुझे बाज़ार जाना है” या “मुझे खाना चाहिए”।',
  typeIt: 'या यहाँ लिखें', askButton: 'पूछें',
}

export const wordsFor = (language: Profile['language'] | undefined): Words => (language === 'hi-IN' ? hindi : english)
