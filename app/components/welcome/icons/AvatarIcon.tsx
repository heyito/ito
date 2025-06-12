const AvatarIcon = (props) => (
  <svg
    viewBox="0 0 128 128"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={180}
    height={180}
    {...props}
  >
    <circle cx="64" cy="64" r="64" fill="#E5E7EB" />
    <circle cx="64" cy="56" r="32" fill="#D1D5DB" />
    <ellipse cx="64" cy="108" rx="40" ry="24" fill="#D1D5DB" />
  </svg>
)

export default AvatarIcon 