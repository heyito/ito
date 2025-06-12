import ContentStep from '../ContentStep'
import CodeWindowIcon from '../icons/CodeWindowIcon'
import FanIcon from '../icons/FanIcon'
import ColorSchemeIcon from '../icons/ColorSchemeIcon'
import AsterikIcon from '../icons/AsterikIcon'

const EraContent = () => {
  return (
    <div>
      <h2 className="flex items-center gap-4">
        Electron React Apps
        <div className="p-1 rounded-md bg-primary/10">
          <img src="res://icons/era.svg" className="w-4 h-4" />
        </div>
      </h2>
      <p>
        Welcome to the Electron React App! This is a prebuilt template that provides a solid foundation for developing
        desktop applications with Electron and React.
      </p>
      <p>
        This project is built with Electron, React, Vite, TypeScript, and Tailwind CSS to provide a modern development
        environment with the latest features.
      </p>

      <div className="welcome-content-steps">
        <ContentStep
          title="Custom Window Titlebar & Menus"
          description="Customize the look and feel of the application window"
          icon={CodeWindowIcon}
        />

        <ContentStep
          title="Lightning Fast HMR"
          description="Hot Module Replacement that stays fast regardless of app size"
          icon={FanIcon}
        />

        <ContentStep
          title="Dark & Light Mode"
          description="Switch between dark and light mode with a click of a button"
          icon={ColorSchemeIcon}
        />

        <ContentStep
          title="Shadcn UI + Tailwind"
          description="A collection of re-usable components built with Shadcn UI"
          icon={AsterikIcon}
        />
      </div>

      <p className="learn-more">
        Learn more about Electron React App at{' '}
        <a href="https://github.com/guasam/electron-react-app" target="_blank" rel="noreferrer">
          github.com
        </a>
      </p>
    </div>
  )
}

export default EraContent
