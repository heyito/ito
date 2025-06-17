import { Button } from '@/app/components/ui/button'
import { useOnboardingStore } from '@/app/store/useOnboardingStore'
import SlackIcon from '../../icons/SlackIcon'
import GmailIcon from '../../icons/GmailIcon'
import ChatGPTIcon from '../../icons/ChatGPTIcon'
import NotionIcon from '../../icons/NotionIcon'
import CursorIcon from '../../icons/CursorIcon'

export default function AnyAppContent() {
  const { incrementOnboardingStep, decrementOnboardingStep } =
    useOnboardingStore()

  return (
    <div className="flex flex-row h-full w-full bg-background">
      <div className="flex flex-col w-[45%] justify-center items-start px-24">
        <div className="flex flex-col h-full min-h-[400px] justify-between py-12">
          <div className="mt-8">
            <button
              className="mb-4 text-sm text-muted-foreground hover:underline"
              type="button"
              onClick={decrementOnboardingStep}
            >
              &lt; Back
            </button>
            <h1 className="text-3xl mb-4 mt-12">Ito works in any app</h1>
            <p className="text-base text-muted-foreground mt-6">
              From emails to chats to documents—Ito works in any textbox on your
              computer.
            </p>
          </div>
          <div className="flex flex-col items-start mb-8">
            <Button className="w-24" onClick={incrementOnboardingStep}>
              Continue
            </Button>
          </div>
        </div>
      </div>
      <div className="flex w-[55%] items-center justify-center bg-gradient-to-b from-purple-50/10 to-purple-100 border-l-2 border-purple-100">
        <div className="flex flex-row gap-2 p-4 rounded-2xl bg-gray-300/70">
          <div
            className="bg-white p-2 rounded-md shadow-md"
            style={{ width: 64, height: 64 }}
          >
            <SlackIcon />
          </div>
          <div
            className="bg-white p-2 rounded-md shadow-md"
            style={{ width: 64, height: 64 }}
          >
            <GmailIcon />
          </div>
          <div
            className="bg-white p-2 rounded-md shadow-md"
            style={{ width: 64, height: 64 }}
          >
            <CursorIcon />
          </div>
          <div
            className="bg-white p-2 rounded-md shadow-md"
            style={{ width: 64, height: 64 }}
          >
            <ChatGPTIcon />
          </div>
          <div
            className="bg-white p-2 rounded-md shadow-md"
            style={{ width: 64, height: 64 }}
          >
            <NotionIcon />
          </div>
        </div>
      </div>
    </div>
  )
}
