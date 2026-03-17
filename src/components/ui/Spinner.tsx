export default function Spinner({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      className="animate-spin text-signal"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2"/>
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
