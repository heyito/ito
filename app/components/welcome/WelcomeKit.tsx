import SignupContent from './contents/SignupContent'
import AvatarIcon from './icons/AvatarIcon'
import './styles.css'

export default function WelcomeKit() {
  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col flex-1 justify-center items-start pl-24">
        <SignupContent />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <AvatarIcon />
      </div>
    </div>
  )
}
