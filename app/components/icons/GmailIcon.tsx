interface GmailIconProps {
  className?: string
}

const GmailIcon = ({ className }: GmailIconProps) => (
  <svg
    fill="none"
    height="100%"
    viewBox="0 0 53.3208 36.6354"
    width="100%"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="m3.6354 36.6354h8.4828v-20.6008l-12.1182-9.0887v26.0541c0 2.0116 1.6299 3.6354 3.6354 3.6354z"
      fill="#4285f4"
    />
    <path
      d="m41.2031 36.6354h8.4827c2.0117 0 3.6355-1.6298 3.6355-3.6354v-26.0541l-12.1182 9.0887"
      fill="#34a853"
    />
    <path
      d="m41.2031 0.2812v15.7536l12.1182-9.0886v-4.8473c0-4.4959-5.1321-7.0588-8.7251-4.3626"
      fill="#fbbc04"
    />
    <path
      d="m12.1172 16.0345v-15.7536l14.5418 10.9064 14.5418-10.9064v15.7536l-14.5418 10.9064"
      fill="#ea4335"
    />
    <path
      d="m0 2.0989v4.8473l12.1182 9.0886v-15.7536l-3.3931-2.5449c-3.5991-2.6962-8.7251-.1333-8.7251 4.3626z"
      fill="#c5221f"
    />
  </svg>
)

export default GmailIcon
