import type { Profile } from './hub'

type Words = { home: string; activity: string; apps: string; family: string; profile: string; hello: (name: string) => string; tagline: string }

const english: Words = {
  home: 'Home', activity: 'Activity', apps: 'Apps', family: 'Family', profile: 'Profile',
  hello: (name) => `Hello, ${name}.`, tagline: 'A little help with your day.',
}

const hindi: Words = {
  home: 'होम', activity: 'गतिविधि', apps: 'ऐप्स', family: 'परिवार', profile: 'प्रोफ़ाइल',
  hello: (name) => `नमस्ते, ${name}।`, tagline: 'आज क्या मदद चाहिए?',
}

export const wordsFor = (language: Profile['language'] | undefined): Words => (language === 'hi-IN' ? hindi : english)
