import { useCallback, useEffect, useRef, useState } from 'react'
import type { Ctx } from './ctx'
import { Inbox } from './Inbox'
import { Kitchen } from './Kitchen'
import { Settle, SoldOut, Supply } from './pages'
import { CHANNEL_NAME, fmtTime } from './sim'
import { type OrderState, soldOutNow, useAppState, useClock, useOrders } from './store'
import { beep, unlockAudio } from './ui'

const ROUTES = [
  { hash: '#/', label: '주문' },
  { hash: '#/kitchen', label: '주방' },
  { hash: '#/soldout', label: '품절' },
  { hash: '#/settle', label: '정산' },
  { hash: '#/supply', label: '발주' },
] as const

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/')
  useEffect(() => {
    const f = () => setHash(location.hash || '#/')
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return ROUTES.some((r) => r.hash === hash) ? hash : '#/'
}

export default function App() {
  const hash = useHash()
  const { state, update, saveError } = useAppState()
  const { now, jumpTo } = useClock()
  const { all, arrived, next, stateOf } = useOrders(state, now)
  const [toastMsg, setToastMsg] = useState<{ msg: string; undo?: () => void; id: number } | null>(null)
  const [announce, setAnnounce] = useState('')
  const soldOut = soldOutNow(state.soldOut, now)

  const toast = useCallback((msg: string, undo?: () => void) => {
    setToastMsg({ msg, undo, id: Date.now() })
  }, [])

  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToastMsg(null), 4000)
    return () => clearTimeout(t)
  }, [toastMsg])

  const setOrder = useCallback(
    (id: string, f: (s: OrderState) => OrderState | null) => {
      update((s) => {
        const cur = s.orders[id] ?? { status: 'new' as const }
        const nextState = f(cur)
        if (nextState === cur) return s
        const orders = { ...s.orders }
        if (nextState === null) delete orders[id]
        else orders[id] = nextState
        return { ...s, orders }
      })
    },
    [update],
  )

  // 새 주문 알림 (소리 + 화면 읽기 프로그램)
  const seen = useRef<number | null>(null)
  const newCount = arrived.filter((o) => stateOf(o).status === 'new').length
  useEffect(() => {
    if (seen.current !== null && arrived.length > seen.current) {
      const fresh = arrived.slice(seen.current)
      beep(2)
      setAnnounce(`새 주문 ${fresh.map((o) => CHANNEL_NAME[o.channel]).join(', ')}`)
    }
    seen.current = arrived.length
  }, [arrived.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // 조리시간이 지나면 주방에서 저절로 "포장 대기"로 (주방 화면 설정)
  useEffect(() => {
    if (!state.kitchenAuto) return
    const due = arrived.filter((o) => {
      const s = stateOf(o)
      return s.status === 'accepted' && s.acceptedAt !== undefined && s.prep !== undefined && s.acceptedAt + s.prep <= now
    })
    for (const o of due) setOrder(o.id, (s) => (s.status === 'accepted' ? { ...s, status: 'ready', readyAt: now } : s))
  }, [Math.floor(now), state.kitchenAuto]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const route = ROUTES.find((r) => r.hash === hash)
    document.title = `${route?.label ?? '주문'} · 두줄김밥`
  }, [hash])

  const ctx: Ctx = { state, update, now, all, arrived, next, jumpTo, stateOf, setOrder, toast, soldOut }
  const kitchen = hash === '#/kitchen'

  return (
    <div
      className={`app ${kitchen ? 'is-kitchen' : ''} ${state.bigText ? 'big-text' : ''}`}
      onPointerDown={unlockAudio}
      onKeyDown={unlockAudio}
    >
      <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}>
        본문으로
      </a>
      <header className="top">
        <span className="brand">두줄김밥</span>
        <nav aria-label="화면">
          {ROUTES.map((r) => (
            <a key={r.hash} href={r.hash} aria-current={hash === r.hash ? 'page' : undefined}>
              {r.label}
              {r.hash === '#/' && newCount > 0 && <span className="dot" aria-label={`새 주문 ${newCount}건`}>{newCount}</span>}
            </a>
          ))}
        </nav>
        <div className="top-right">
          <span className="clock" aria-label={`지금 ${fmtTime(now)}`}>
            {fmtTime(now)}
          </span>
          <button
            type="button"
            className="btn ghost small"
            aria-pressed={state.bigText}
            onClick={() => update((s) => ({ ...s, bigText: !s.bigText }))}
          >
            글씨 크게
          </button>
        </div>
      </header>
      {saveError && <p className="warn bar">저장 공간이 꽉 차서 저장이 안 되고 있어요. 지난 기록을 지워 주세요.</p>}
      {soldOut.size > 0 && !kitchen && (
        <p className="soldout-bar">
          품절 중: {[...soldOut].length}개 메뉴 — <a href="#/soldout">보기</a>
        </p>
      )}
      <main id="main" tabIndex={-1}>
        {hash === '#/' && <Inbox {...ctx} />}
        {hash === '#/kitchen' && <Kitchen {...ctx} />}
        {hash === '#/soldout' && <SoldOut {...ctx} />}
        {hash === '#/settle' && <Settle {...ctx} />}
        {hash === '#/supply' && <Supply {...ctx} />}
      </main>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
      {toastMsg && (
        <div className="toast" role="status" key={toastMsg.id}>
          <span>{toastMsg.msg}</span>
          {toastMsg.undo && (
            <button
              type="button"
              onClick={() => {
                toastMsg.undo?.()
                setToastMsg(null)
              }}
            >
              되돌리기
            </button>
          )}
        </div>
      )}
    </div>
  )
}
