import type { KeyboardEvent } from 'react'

/** 한글 조합 중 Enter는 무시한다 (조합 확정용 Enter가 제출로 잡히는 문제). */
export function isRealEnter(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter') return false
  const native = e.nativeEvent as globalThis.KeyboardEvent
  if (native.isComposing || native.keyCode === 229) return false
  return true
}

let audio: AudioContext | null = null

/** 사용자가 한 번이라도 누른 뒤에만 소리를 낼 수 있다 (브라우저 정책). */
export function unlockAudio() {
  if (audio) return
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (Ctx) audio = new Ctx()
  } catch {
    audio = null
  }
}

export function beep(times = 2) {
  if (!audio) return
  try {
    for (let i = 0; i < times; i++) {
      const o = audio.createOscillator()
      const g = audio.createGain()
      o.frequency.value = 880
      o.connect(g)
      g.connect(audio.destination)
      const t = audio.currentTime + i * 0.25
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      o.start(t)
      o.stop(t + 0.2)
    }
  } catch {
    /* 소리 실패는 무시 */
  }
}

export function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ko-KR'
    u.rate = 0.95
    window.speechSynthesis.speak(u)
  } catch {
    /* 음성 미지원 */
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function parseWon(s: string): number | null {
  const d = s.replace(/[^0-9]/g, '')
  if (!d) return null
  const n = Number(d)
  return Number.isFinite(n) && n <= 100_000_000 ? n : null
}
