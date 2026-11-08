import { useState } from 'react'
import { type Ctx, suggestPrep } from './ctx'
import { CHANNEL_NAME, PREP_TIMES, type Order, fmtTime, won } from './sim'
import { Ticket } from './Ticket'
import { isRealEnter } from './ui'

export function Inbox(c: Ctx) {
  const { arrived, stateOf, now, next, state, update, soldOut } = c
  const [showPast, setShowPast] = useState(false)
  const [printId, setPrintId] = useState<string | null>(null)

  const newOrders = arrived.filter((o) => stateOf(o).status === 'new')
  const inKitchen = arrived.filter((o) => stateOf(o).status === 'accepted')
  const ready = arrived.filter((o) => stateOf(o).status === 'ready')
  const past = arrived.filter((o) => ['picked', 'cancelled'].includes(stateOf(o).status)).slice().reverse()
  const printed = arrived
    .filter((o) => stateOf(o).printed && stateOf(o).status !== 'cancelled')
    .sort((a, b) => (stateOf(b).acceptedAt ?? 0) - (stateOf(a).acceptedAt ?? 0))
    .slice(0, 3)

  function accept(o: Order, prep: number) {
    c.setOrder(o.id, (s) =>
      s.status !== 'new' ? s : { ...s, status: 'accepted', prep, acceptedAt: now, printed: state.autoPrint || s.printed },
    )
  }

  function cancel(o: Order) {
    if (!confirm(`${CHANNEL_NAME[o.channel]} ${o.id} 주문을 취소로 표시할까요?\n(배달앱에서도 취소해 주세요)`)) return
    const prev = stateOf(o)
    c.setOrder(o.id, (s) => ({ ...s, status: 'cancelled' }))
    c.toast('주문을 취소로 표시했어요', () => c.setOrder(o.id, () => prev))
  }

  function doPrint(id: string) {
    setPrintId(id)
    c.setOrder(id, (s) => ({ ...s, printed: true }))
    setTimeout(() => window.print(), 50)
  }

  const printOrder = printId ? arrived.find((o) => o.id === printId) : undefined

  return (
    <div className="inbox">
      <div className="inbox-main">
        <div className="stats" role="status">
          <span>
            새 주문 <b>{newOrders.length}</b>
          </span>
          <span>
            주방 <b>{inKitchen.length}</b>
          </span>
          <span>
            포장 대기 <b>{ready.length}</b>
          </span>
          {next && (
            <button type="button" className="btn ghost small" onClick={() => c.jumpTo(next.at)}>
              다음 주문 바로 받기 (데모)
            </button>
          )}
        </div>

        <section aria-labelledby="h-new">
          <h2 id="h-new">새 주문</h2>
          {newOrders.length === 0 && <p className="empty">새 주문이 오면 소리와 함께 여기에 떠요.</p>}
          <div className="cards">
            {newOrders.map((o) => {
              const opts = PREP_TIMES[o.channel]
              const sug = suggestPrep(opts, inKitchen.length)
              const bad = o.items.filter((i) => soldOut.has(i.id))
              return (
                <article key={o.id} className={`card new ch-${o.channel}`} aria-label={`${CHANNEL_NAME[o.channel]} 주문 ${o.id}`}>
                  <OrderHead o={o} />
                  <Items o={o} />
                  {bad.length > 0 && (
                    <p className="warn">품절 메뉴가 들어 있어요: {bad.map((i) => i.name).join(', ')} — 손님께 연락 후 취소하세요</p>
                  )}
                  <div className="addr">
                    {o.address} · {won(o.total)}
                  </div>
                  <div className="accept-row">
                    <button type="button" className="btn primary big" onClick={() => accept(o, sug)}>
                      접수 · {sug}분
                    </button>
                    <div className="prep-alt" role="group" aria-label="다른 조리시간으로 접수">
                      {opts
                        .filter((m) => m !== sug)
                        .map((m) => (
                          <button key={m} type="button" className="btn ghost" onClick={() => accept(o, m)}>
                            {m}분
                          </button>
                        ))}
                    </div>
                  </div>
                  <button type="button" className="link danger" onClick={() => cancel(o)}>
                    주문 취소
                  </button>
                </article>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="h-kitchen">
          <h2 id="h-kitchen">주방에서 만드는 중</h2>
          {inKitchen.length === 0 && <p className="empty">접수한 주문이 여기와 주방 화면에 나와요.</p>}
          <div className="cards">
            {inKitchen.map((o) => {
              const s = stateOf(o)
              const left = Math.round((s.acceptedAt ?? 0) + (s.prep ?? 0) - now)
              return (
                <article key={o.id} className={`card ch-${o.channel}`} aria-label={`${CHANNEL_NAME[o.channel]} 주문 ${o.id}`}>
                  <OrderHead o={o} extra={left >= 0 ? `${left}분 남음` : `${-left}분 늦음`} late={left < 0} />
                  <Items o={o} />
                  <Memo c={c} o={o} />
                  <div className="row">
                    <button type="button" className="btn" onClick={() => c.setOrder(o.id, (x) => ({ ...x, status: 'ready', readyAt: now }))}>
                      다 됐음
                    </button>
                    <button type="button" className="btn ghost" onClick={() => doPrint(o.id)}>
                      주문표 인쇄
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="h-ready">
          <h2 id="h-ready">포장 · 픽업 대기</h2>
          {ready.length === 0 && <p className="empty">다 만든 주문이 여기에 모여요.</p>}
          <div className="cards">
            {ready.map((o) => (
              <article key={o.id} className={`card ch-${o.channel}`} aria-label={`${CHANNEL_NAME[o.channel]} 주문 ${o.id}`}>
                <OrderHead o={o} />
                <Items o={o} />
                <div className="row">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      c.setOrder(o.id, (x) => ({ ...x, status: 'picked' }))
                      c.toast(`${o.id} 픽업 완료`, () => c.setOrder(o.id, (x) => ({ ...x, status: 'ready' })))
                    }}
                  >
                    픽업 완료
                  </button>
                  <button type="button" className="btn ghost" onClick={() => c.setOrder(o.id, (x) => ({ ...x, status: 'accepted' }))}>
                    주방으로 되돌리기
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="h-past">
          <h2 id="h-past">
            <button type="button" className="link" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}>
              지난 주문 {past.length}건 {showPast ? '접기' : '보기'}
            </button>
          </h2>
          {showPast && (
            <ul className="past">
              {past.map((o) => (
                <li key={o.id}>
                  <span className={`badge ch-${o.channel}`}>{CHANNEL_NAME[o.channel]}</span> {fmtTime(o.at)} {o.id} ·{' '}
                  {o.items.map((i) => `${i.name} ${i.qty}`).join(', ')} · {won(o.total)}
                  {stateOf(o).status === 'cancelled' && <b className="danger"> 취소</b>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="print-panel" aria-labelledby="h-print">
        <h2 id="h-print">자동 출력 미리보기</h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={state.autoPrint}
            onChange={(e) => update((s) => ({ ...s, autoPrint: e.target.checked }))}
          />
          접수하면 주문표 자동 출력
        </label>
        {printed.length === 0 && <p className="empty">접수한 주문표가 여기에 나와요.</p>}
        {printed.map((o) => (
          <div key={o.id} className="ticket-wrap">
            <Ticket order={o} st={stateOf(o)} />
            <button type="button" className="btn ghost small" onClick={() => doPrint(o.id)}>
              인쇄
            </button>
          </div>
        ))}
      </aside>

      <div className="print-area" aria-hidden="true">
        {printOrder && <Ticket order={printOrder} st={stateOf(printOrder)} />}
      </div>
    </div>
  )
}

function OrderHead({ o, extra, late }: { o: Order; extra?: string; late?: boolean }) {
  return (
    <div className="card-head">
      <span className={`badge ch-${o.channel}`}>{CHANNEL_NAME[o.channel]}</span>
      <span className="time">{fmtTime(o.at)}</span>
      <span className="oid">{o.id}</span>
      {extra && <span className={late ? 'left late' : 'left'}>{extra}</span>}
    </div>
  )
}

function Items({ o }: { o: Order }) {
  return (
    <>
      <ul className="items">
        {o.items.map((i) => (
          <li key={i.id}>
            <span>{i.name}</span> <b>{i.qty}</b>
            {i.options.length > 0 && <span className="opt">{i.options.join(', ')}</span>}
          </li>
        ))}
      </ul>
      {o.request && (
        <p className="req">
          <span className="req-label">요청</span> {o.request}
        </p>
      )}
    </>
  )
}

function Memo({ c, o }: { c: Ctx; o: Order }) {
  const st = c.stateOf(o)
  const [text, setText] = useState('')
  const id = `memo-${o.id}`
  function save() {
    const t = text.trim().slice(0, 100)
    if (!t) return
    c.setOrder(o.id, (s) => ({ ...s, memo: s.memo ? `${s.memo} / ${t}` : t }))
    setText('')
  }
  return (
    <div className="memo">
      {st.memo && <p className="memo-text">메모: {st.memo}</p>}
      <label htmlFor={id} className="sr-only">
        주방에 전할 메모
      </label>
      <input
        id={id}
        value={text}
        maxLength={100}
        placeholder="전화로 받은 추가 요청 (Enter)"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (isRealEnter(e)) {
            e.preventDefault()
            save()
          }
        }}
      />
      <button type="button" className="btn ghost small" onClick={save} disabled={!text.trim()}>
        추가
      </button>
    </div>
  )
}
