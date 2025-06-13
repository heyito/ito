import SignupContent from './contents/SignupContent'
import AvatarIcon from './icons/AvatarIcon'
import './styles.css'

export default function WelcomeKit() {
  return (
    <div className="w-full h-full bg-background">
      <div className="flex flex-row h-full w-full bg-background">
        <div className="flex flex-col w-[45%] justify-center items-start pl-24">
          <SignupContent />
        </div>
        <div className="flex w-[55%] items-center justify-center bg-neutral-200 border-l border-border">
          <AvatarIcon />
        </div>
      </div>
    </div>
  )
}
