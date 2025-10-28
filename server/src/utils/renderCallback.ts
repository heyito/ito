const ITO_ENV = (process.env.ITO_ENV || 'prod').toLowerCase()
const DEEPLINK_SCHEME = ITO_ENV === 'prod' ? 'ito' : `ito-dev`

interface CallbackPageParams {
  code: string
  state: string
}

export function renderCallbackPage(params: CallbackPageParams): string {
  const authText = 'Log in successful'

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Authentication Successful - Ito</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family:
          -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu,
          Cantarell, sans-serif;
        background: #ffffff;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #333;
        text-align: center;
      }

      .logo {
        width: 56px;
        height: 56px;
        background: #000000;
        border-radius: 12px;
        margin: 0 auto 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 24px;
      }

      .logo svg {
        width: 36px;
        height: 36px;
        color: white;
      }

      .auth-text {
        font-size: 24px;
        color: #000000;
        margin-bottom: 2rem;
        font-weight: 600;
      }

      .button {
        background: #000000;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        margin-bottom: 1rem;
        transition: background 0.2s;
      }

      .button:hover {
        background: #1a202c;
      }

      .footer-text {
        color: #718096;
        font-size: 14px;
      }

      .footer-text a {
        color: #3182ce;
        text-decoration: none;
      }

      .footer-text a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <div>
      <div class="logo">
        <svg
          width="48"
          height="48"
          viewBox="0 0 141 141"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M125.837 88.3633C129.501 84.6822 132.622 80.4752 135.037 75.8738C138.947 68.4622 141 60.1469 141 51.7657C141 23.2206 117.787 0 89.2524 0C60.7172 0 37.5047 23.2206 37.5047 51.7657C37.5047 55.3482 37.8661 58.8322 38.5561 62.201C44.3058 62.4147 50.0227 63.8115 55.296 66.3752C53.3576 61.8888 52.2733 56.9423 52.2733 51.7493C52.2733 31.3552 68.849 14.7738 89.2359 14.7738C109.623 14.7738 126.199 31.3552 126.199 51.7493C126.199 61.9381 122.059 71.1902 115.373 77.8951C100.965 92.3073 77.5065 92.3073 63.0993 77.8951C48.6921 63.4829 25.2331 63.4829 10.8424 77.8951C4.15624 84.5836 0 93.8357 0 104.024C0 124.419 16.5757 141 36.9626 141C57.3495 141 72.6767 125.618 73.8431 106.276C68.5369 104.797 63.4278 102.513 58.6637 99.4724C58.9759 100.951 59.1402 102.463 59.1402 104.024C59.1402 116.251 49.1849 126.21 36.9626 126.21C24.7403 126.21 14.785 116.251 14.785 104.024C14.785 97.9112 17.2656 92.3566 21.274 88.3304C29.9151 79.6864 43.9937 79.6864 52.6347 88.3304C62.7214 98.4206 75.9787 103.466 89.2195 103.466C98.5669 103.466 107.865 100.919 115.882 96.1035C119.496 93.9343 122.831 91.3049 125.804 88.3304L125.837 88.3633Z"
            fill="currentColor"
          />
        </svg>
      </div>

      <div class="auth-text" id="authText">${authText}</div>

      <button class="button" onclick="openApp()">Open Ito</button>
    </div>

    <script>
      function openApp() {
        const authCode = '${params.code || ''}'
        const state = '${params.state || ''}'
        
        if (authCode && state) {
          window.location.href = \`${DEEPLINK_SCHEME}://auth/callback?code=\${authCode}&state=\${state}\`
        } else {
          console.error('Missing required authentication parameters')
        }
      }
    </script>
  </body>
</html>`
}
