import React from 'react'
import {
  getOnboardingCategoryIndex,
  useOnboardingStore,
} from '@/app/store/useOnboardingStore'

export const OnboardingTitlebar = () => {
  const { onboardingStep, totalOnboardingSteps, onboardingCategory } =
    useOnboardingStore()
  const onboardingProgress = Math.ceil(
    ((onboardingStep + 1) / totalOnboardingSteps) * 100,
  )
  const onboardingCategoryIndex = getOnboardingCategoryIndex(onboardingCategory)

  return (
    <>
      {/* Onboarding Steps Text */}
      <div className="onboarding-steps-text">
        {['Sign Up', 'Permissions', 'Set Up', 'Try it'].map(
          (step, idx, arr) => (
            <React.Fragment key={step}>
              <span
                className={`onboarding-step-label${idx <= onboardingCategoryIndex ? ' active' : ''}`}
              >
                {step.toUpperCase()}
              </span>
              {idx < arr.length - 1 && (
                <span
                  className={`onboarding-step-chevron${idx < onboardingCategoryIndex ? ' active' : ''}`}
                  aria-hidden="true"
                >
                  &#8250;
                </span>
              )}
            </React.Fragment>
          ),
        )}
      </div>
      {/* Onboarding Progress Bar */}
      <div className="onboarding-progress-bar-bg">
        <div className="onboarding-progress-bar-fg" />
      </div>
      <style>{`
        .onboarding-steps-text {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 2;
          font-size: 14px;
          font-weight: 500;
        }
        .onboarding-step-label {
          color: #b0b0b0;
          font-weight: 400;
          transition: color 0.2s, font-weight 0.2s;
          display: inline-flex;
          align-items: center;
          margin: 0 36px;
        }
        .onboarding-step-chevron {
          color: #d0d0d0;
          font-size: 24px;
          margin: 0 36px;
          margin-top: -4px;
          display: inline-flex;
          align-items: center;
        }
        .onboarding-step-label.active, .onboarding-step-chevron.active {
          color: #222;
          font-weight: 500;
        }
        .onboarding-progress-bar-bg {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 3px;
          background: #ececec;
          border-radius: 2px;
          overflow: hidden;
          pointer-events: none;
          z-index: 1;
        }
        .onboarding-progress-bar-fg {
          height: 100%;
          width: ${onboardingProgress}%;
          background: linear-gradient(90deg, #8aa6cf 0%, #43679d 100%);
          border-radius: 2px;
          transition: width 0.4s cubic-bezier(0.4,0,0.2,1);
        }
      `}</style>
    </>
  )
}
