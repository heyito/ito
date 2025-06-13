// In your renderer process (main window)
async function setupMicrophone() {
  try {
    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    })

    // Create audio context
    const audioContext = new window.AudioContext()
    const source = audioContext.createMediaStreamSource(stream)

    return { audioContext, source, stream }
  } catch (error) {
    console.error('Error accessing microphone:', error)
  }
}

async function setupVolumeMonitoring(callback: (volume: number) => void) {
  const microphone = await setupMicrophone()
  if (!microphone) throw new Error('Failed to setup microphone')
  const { audioContext, source } = microphone

  // Create analyser node
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.8

  // Connect source to analyser
  source.connect(analyser)

  // Create data array for frequency data
  const dataArray = new Uint8Array(analyser.frequencyBinCount)

  function getVolume() {
    analyser.getByteFrequencyData(dataArray)

    // Calculate average volume
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i]
    }
    const average = sum / dataArray.length

    return average / 255 // Normalize to 0-1
  }

  // Monitor volume continuously
  function monitorVolume() {
    const volume = getVolume()

    // Update UI or trigger events based on volume
    callback(volume)

    requestAnimationFrame(monitorVolume)
  }

  monitorVolume()
}

export { setupMicrophone, setupVolumeMonitoring }
