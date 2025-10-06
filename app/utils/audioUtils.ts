export function createStereo48kWavFromMonoPCM(
  pcm16le: Uint8Array,
  srcRate = 16000,
  targetRate = 48000,
  bitsPerSample = 16,
): ArrayBuffer {
  const sampleCount = Math.floor(pcm16le.length / 2)
  const src = new Float32Array(sampleCount)
  for (let i = 0, j = 0; i < sampleCount; i++, j += 2) {
    let s = (pcm16le[j] | (pcm16le[j + 1] << 8)) & 0xffff
    if (s & 0x8000) s = s - 0x10000
    src[i] = Math.max(-1, Math.min(1, s / 32768))
  }

  const ratio = targetRate / srcRate
  const outLen = Math.max(1, Math.floor(src.length * ratio))
  const resampled = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i / ratio
    const idx = Math.floor(pos)
    const frac = pos - idx
    const a = src[idx] ?? 0
    const b = src[idx + 1] ?? a
    resampled[i] = a + (b - a) * frac
  }

  const numChannels = 2
  const interleaved = new Int16Array(outLen * numChannels)
  for (let i = 0, j = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]))
    const v = (s * 32767) | 0
    interleaved[j++] = v
    interleaved[j++] = v
  }

  const byteRate = (targetRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const dataLength = interleaved.byteLength
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, targetRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(36, 'data')
  view.setUint32(40, dataLength, true)

  new Uint8Array(buffer).set(new Uint8Array(interleaved.buffer), 44)
  return buffer
}
