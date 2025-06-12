const AvatarIcon = (props: any) => (
  <svg
    viewBox="0 0 128 128"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={260}
    height={260}
    {...props}
  >
    <circle cx="64" cy="64" r="64" fill="#D1D5DB" />
    <circle cx="64" cy="50" r="20" fill="#E5E7EB" />
    <ellipse cx="64" cy="92" rx="38" ry="16" fill="#E5E7EB" />
  </svg>
)

export default AvatarIcon 