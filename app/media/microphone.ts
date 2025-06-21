// In your renderer process (main window)
async function setupMicrophone(deviceId?: string) {
  try {
    // Request microphone access with specific device if provided
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    })

    // Create audio context
    const audioContext = new window.AudioContext()
    const source = audioContext.createMediaStreamSource(stream)

    return { audioContext, source, stream }
  } catch (error) {
    console.error('Error accessing microphone:', error)
    throw error
  }
}

type Microphone = {
  deviceId: string
  label: string
}

type MicrophoneToRender = {
  title: string
  description?: string
}

async function getAvailableMicrophones(): Promise<Microphone[]> {
  let stream: MediaStream | null = null
  try {
    // First request microphone permission to ensure we get labels
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    // Get all devices
    const devices = await navigator.mediaDevices.enumerateDevices()

    // Filter for audio input devices and exclude non-default virtual microphones
    const microphones = devices
      .filter(device => {
        // Keep only audio input devices
        if (device.kind !== 'audioinput') return false

        // Keep the default device
        if (
          device.deviceId === 'default' ||
          device.label.toLowerCase().includes('default')
        )
          return true

        // Filter out virtual microphones that aren't the default
        // Virtual microphones often have specific patterns in their labels
        const label = device.label.toLowerCase()
        const isVirtual =
          label.includes('virtual') ||
          label.includes('vb-audio') ||
          label.includes('blackhole') ||
          label.includes('loopback')

        return !isVirtual
      })
      .map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${device.deviceId.slice(0, 5)}...`,
      }))

    return microphones
  } catch (error) {
    console.error('Error getting available microphones:', error)
    throw error
  } finally {
    // Always stop the stream to release the microphone
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }
  }
}

async function setupVolumeMonitoring(
  callback: (volume: number) => void,
  deviceId?: string,
) {
  let currentMicrophone: {
    audioContext: AudioContext
    source: MediaStreamAudioSourceNode
    stream: MediaStream
  } | null = null
  let animationFrameId: number | null = null

  const cleanup = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    if (currentMicrophone) {
      currentMicrophone.stream.getTracks().forEach(track => track.stop())
      currentMicrophone.audioContext.close()
      currentMicrophone = null
    }
  }

  try {
    // Clean up any existing microphone setup
    cleanup()

    // Setup new microphone
    console.log('Setting up microphone with deviceId:', deviceId)
    currentMicrophone = await setupMicrophone(deviceId)
    if (!currentMicrophone) throw new Error('Failed to setup microphone')
    const { audioContext, source } = currentMicrophone

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

      animationFrameId = requestAnimationFrame(monitorVolume)
    }

    monitorVolume()

    // Return cleanup function and the stream
    if (!currentMicrophone) {
      throw new Error('Microphone not initialized in setupVolumeMonitoring')
    }
    return { cleanup, stream: currentMicrophone.stream }
  } catch (error) {
    cleanup()
    throw error
  }
}

const microphoneToRender = (microphone: Microphone): MicrophoneToRender => {
  const label = microphone.label.toLowerCase()

  // Handle default device case
  if (label.includes('default -')) {
    return {
      title: `Auto-detect`,
      description:
        'May connect to Bluetooth earbuds, slowing transcription speed',
    }
  }

  // Handle built-in microphone
  if (label.includes('built-in') || label.includes('macbook pro microphone')) {
    return {
      title: 'Built-in mic (recommended)',
    }
  }

  // Default case - return original label
  return {
    title: microphone.label,
  }
}

export {
  setupMicrophone,
  setupVolumeMonitoring,
  getAvailableMicrophones,
  microphoneToRender,
}

export type { Microphone, MicrophoneToRender }
