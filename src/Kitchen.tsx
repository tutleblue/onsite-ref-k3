import { useEffect, useRef } from 'react'
import type { Ctx } from './ctx'
import { CHANNEL_NAME, type Order } from './sim'
import { speak } from './ui'

/**
 * 주방 화면
 * - 손을 안 대도 된다: 조리시간이 지나면 저절로 "포장 대기"로 넘어가고, 카운터에서 처리해도 넘어간다
 * - 만져야 하면: 화면 아래 절반이 통째로 "다 됐어요" 단추, 스페이스바 · Enter(발판 스위치)도 된다
 * - 소리로 읽기를 켜면 새로 맨 앞에 온 주문을 읽어 준다
 */
export function Kitchen(c: Ctx) {
  const { arrived, stateOf, now, state, update } = c
  const queue = arrived
    .filter((o) => stateOf(o).status === 'accepted')
    .sort((a, b) => (stateOf(a).acceptedAt ?? 0) - (stateOf(b).acceptedAt ?? 0))
  const ready = arrived.filter((o) => stateOf(o).status === 'ready')
  const top = queue[0]
  const rest = queue.slice(1, 4)

  const done = () => {
    if (!top) return
    c.setOrder(top.id, (s) => (s.status === 'accepted' ? { ...s, status: 'ready', readyAt: now } : s))
  }
  const doneRef = useRef(done)
  doneRef.current = done

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'SELECT' || t.tagName === 'A')) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        doneRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const spoken = useRef<string | null>(null)
  useEffect(() => {
    if (!top || !state.voice || spoken.current === top.id) return
    spoken.current = top.id
    const items = top.items.map((i) => `${i.name} ${i.qty}개`).join(', ')
    speak(`${CHANNEL_NAME[top.channel]}. ${items}.${top.request ? ` 요청, ${top.request}` : ''}`)
  }, [top, state.voice])

  return (
    <div className="kitchen">
      <div className="k-tools">
        <label className="switch">
          <input
            type="checkbox"
            checked={state.kitchenAuto}
            onChange={(e) => update((s) => ({ ...s, kitchenAuto: e.target.checked }))}
          />
          시간 되면 자동으로 다음
        </label>
        <label className="switch">
          <input type="checkbox" checked={state.voice} onChange={(e) => update((s) => ({ ...s, voice: e.target.checked }))} />
          소리로 읽기
        </label>
        <span className="k-count">
          대기 {queue.length} · 포장 {ready.length}
        </span>
      </div>

      {!top ? (
        <div className="k-empty" role="status">
          만들 주문 없음
        </div>
      ) : (
        <div className="k-grid">
          <section className="k-now" aria-label="지금 만들 주문" aria-live="polite">
            <NowCard o={top} c={c} />
            <button type="button" className="k-done" onClick={done}>
              다 됐어요
              <small>스페이스바 · Enter · 발판</small>
            </button>
          </section>
          <section className="k-next" aria-label="다음 주문">
            <h2>다음</h2>
            {rest.length === 0 && <p className="k-none">없음</p>}
            {rest.map((o) => (
              <div key={o.id} className={`k-small ch-${o.channel}`}>
                <div className="k-small-head">
                  <span className={`badge ch-${o.channel}`}>{CHANNEL_NAME[o.channel]}</span>
                  <span>{o.id.split('-').pop()}</span>
                </div>
                {o.items.map((i) => (
                  <div key={i.id}>
                    {i.name} <b>{i.qty}</b>
                  </div>
                ))}
                {o.request && <div className="k-small-req">{o.request}</div>}
              </div>
            ))}
            {queue.length > 4 && <p className="k-none">+{queue.length - 4}건 더</p>}
          </section>
        </div>
      )}
    </div>
  )
}

function NowCard({ o, c }: { o: Order; c: Ctx }) {
  const s = c.stateOf(o)
  const left = Math.round((s.acceptedAt ?? 0) + (s.prep ?? 0) - c.now)
  return (
    <div className={`k-card ch-${o.channel}`}>
      <div className="k-head">
        <span className={`badge big ch-${o.channel}`}>{CHANNEL_NAME[o.channel]}</span>
        <span className="k-id">{o.id.split('-').pop()}</span>
        <span className={left < 0 ? 'k-left late' : 'k-left'}>{left >= 0 ? `${left}분 남음` : `${-left}분 늦음`}</span>
      </div>
      <ul className="k-items">
        {o.items.map((i) => (
          <li key={i.id}>
            <span>{i.name}</span>
            <b>{i.qty}</b>
            {i.options.length > 0 && <div className="k-opt">{i.options.join(' · ')}</div>}
          </li>
        ))}
      </ul>
      {(o.request || s.memo) && (
        <div className="k-req">
          {o.request && <div>{o.request}</div>}
          {s.memo && <div>{s.memo}</div>}
        </div>
      )}
    </div>
  )
}
