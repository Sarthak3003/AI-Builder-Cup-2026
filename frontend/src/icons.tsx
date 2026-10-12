import type { ReactNode } from 'react'

function Icon({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

export const HomeIcon = () => <Icon><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10" /></Icon>
export const ActivityIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></Icon>
export const AppsIcon = () => <Icon><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></Icon>
export const FamilyIcon = () => <Icon><path d="M12 20.5s-8-4.8-8-10.6A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8 2.9c0 5.8-8 10.6-8 10.6z" /></Icon>
export const ProfileIcon = () => <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5" /></Icon>
export const CarIcon = () => <Icon size={30}><path d="M5 15.5 6.6 10a2 2 0 0 1 1.9-1.5h7a2 2 0 0 1 1.9 1.5l1.6 5.5" /><rect x="3" y="15.5" width="18" height="4.5" rx="1.5" /><path d="M7 18h.01M17 18h.01" /></Icon>
export const MealIcon = () => <Icon size={30}><path d="M4 12h16a8 8 0 0 1-16 0z" /><path d="M8 8c0-1.6 1-1.6 1-3.2M12 8c0-1.6 1-1.6 1-3.2M16 8c0-1.6 1-1.6 1-3.2" /></Icon>
export const MedicineIcon = () => <Icon size={30}><rect x="9" y="3.5" width="6" height="17" rx="2" /><rect x="3.5" y="9" width="17" height="6" rx="2" /></Icon>
export const MicIcon = () => <Icon><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></Icon>
export const BackIcon = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>
export const ChevronIcon = () => <Icon><path d="M9 5l7 7-7 7" /></Icon>
export const CheckIcon = () => <Icon size={36}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>
export const DownloadIcon = () => <Icon><path d="M12 4v10M8 10.5l4 4 4-4M5 20h14" /></Icon>
export const HeartIcon = () => <Icon><path d="M12 20.5s-8-4.8-8-10.6A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8 2.9c0 5.8-8 10.6-8 10.6z" /></Icon>

// The Saathi mark: a speech bubble with Google's red, yellow and green dots on Google blue.
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="112" fill="#1a73e8" />
      <rect x="116" y="140" width="280" height="190" rx="48" fill="#fff" />
      <path d="M158 322h74l-74 70z" fill="#fff" />
      <circle cx="196" cy="235" r="26" fill="#ea4335" />
      <circle cx="256" cy="235" r="26" fill="#fbbc04" />
      <circle cx="316" cy="235" r="26" fill="#34a853" />
    </svg>
  )
}
