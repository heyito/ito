/**
 * Light audio enhancement for 16-bit PCM mono at a given sample rate.
 * - Removes DC offset
 * - Applies a gentle high-pass filter (~80 Hz)
 * - Peak normalizes to ~-3 dBFS with a capped gain
 */
export function enhancePcm16(pcm: Buffer, sampleRate: number): Buffer {
  if (!pcm || pcm.length < 2) return pcm

  const sampleCount = Math.floor(pcm.length / 2)
  if (sampleCount <= 0) return pcm

  // Read int16 samples
  const samples = new Int16Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = pcm.readInt16LE(i * 2)
  }

  // DC offset removal
  let sum = 0
  for (let i = 0; i < sampleCount; i++) sum += samples[i]
  const mean = Math.trunc(sum / sampleCount)
  if (mean !== 0) {
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = (samples[i] - mean) as unknown as Int16Array[number]
    }
  }

  // Gentle high-pass filter (~80 Hz)
  const fc = 80
  const a = Math.exp((-2 * Math.PI * fc) / sampleRate)
  let prevX = 0
  let prevY = 0
  const filtered = new Float32Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    const x = samples[i]
    const y = a * (prevY + x - prevX)
    filtered[i] = y
    prevX = x
    prevY = y
  }

  // Peak normalize to ~-3 dBFS, cap max gain to ~+12 dB
  let peak = 1
  for (let i = 0; i < sampleCount; i++) {
    const v = Math.abs(filtered[i])
    if (v > peak) peak = v
  }
  const target = 0.707 * 32767 // ≈ -3 dBFS
  const rawGain = target / peak
  const gain = Math.min(rawGain, 4.0)

  const out = Buffer.alloc(sampleCount * 2)
  if (gain > 1.05) {
    for (let i = 0; i < sampleCount; i++) {
      const v = Math.round(filtered[i] * gain)
      const clamped = Math.max(-32768, Math.min(32767, v))
      out.writeInt16LE(clamped, i * 2)
    }
  } else {
    for (let i = 0; i < sampleCount; i++) {
      const v = Math.round(filtered[i])
      const clamped = Math.max(-32768, Math.min(32767, v))
      out.writeInt16LE(clamped, i * 2)
    }
  }

  return out
}
