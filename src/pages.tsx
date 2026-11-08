import { useState } from 'react'
import type { Ctx } from './ctx'
import { CHANNELS, CHANNEL_NAME, MENU, type Channel, fmtTime, todayKey, won } from './sim'
import { type ChannelSettle, settleChannel } from './settle'
import { soldCount, supplyMessage, supplyPlan, fmtQty } from './supply'
import { resetAll } from './store'
import { copyText, isRealEnter, parseWon } from './ui'

/* ---------------- 품절 ---------------- */

export function SoldOut(c: Ctx) {
  const { state, update, now, soldOut } = c

  function toggle(id: string, name: string) {
    const was = soldOut.has(id)
    setSoldOut(id, !was)
    // 되돌리기도 지금 시각부터 반대로 바꾸는 것 — 이미 들어온 주문 내용은 그대로 둔다
    c.toast(was ? `${name} 다시 팔아요 — 세 앱 모두 반영` : `${name} 품절 — 주걱 · 빨리와 · 동네배달 모두 반영`, () =>
      setSoldOut(id, was),
    )
  }

  function setSoldOut(id: string, out: boolean) {
    update((s) => {
      const open = s.soldOut.some((r) => r.menuId === id && r.to === null)
      if (out === open) return s
      return {
        ...s,
        soldOut: out
          ? [...s.soldOut, { menuId: id, from: now, to: null }]
          : s.soldOut.map((r) => (r.menuId === id && r.to === null ? { ...r, to: now } : r)),
        posSoldOutChecked: s.posSoldOutChecked.filter((x) => x !== id),
      }
    })
  }

  const outItems = MENU.filter((m) => soldOut.has(m.id))

  return (
    <div className="page">
      <h1>품절</h1>
      <p className="lead">누르면 세 앱에 한 번에 품절로 바뀌어요. 다시 누르면 판매를 다시 시작해요. 내일이 되면 저절로 풀려요.</p>
      <div className="menu-grid">
        {MENU.map((m) => {
          const out = soldOut.has(m.id)
          return (
            <button
              key={m.id}
              type="button"
              className={out ? 'menu-btn out' : 'menu-btn'}
              aria-pressed={out}
              onClick={() => toggle(m.id, m.name)}
            >
              <span className="m-name">{m.name}</span>
              <span className="m-state">{out ? '품절' : '판매 중'}</span>
            </button>
          )
        })}
      </div>

      {outItems.length > 0 && (
        <section className="panel" aria-labelledby="h-out">
          <h2 id="h-out">지금 품절인 메뉴</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>메뉴</th>
                {CHANNELS.map((ch) => (
                  <th key={ch}>{CHANNEL_NAME[ch]}</th>
                ))}
                <th>포스</th>
              </tr>
            </thead>
            <tbody>
              {outItems.map((m) => {
                const rule = state.soldOut.find((r) => r.menuId === m.id && r.to === null)
                const posDone = state.posSoldOutChecked.includes(m.id)
                return (
                  <tr key={m.id}>
                    <th scope="row">
                      {m.name}
                      {rule && <div className="sub">{fmtTime(rule.from)}부터</div>}
                    </th>
                    {CHANNELS.map((ch) => (
                      <td key={ch}>{m.channels.includes(ch) ? <span className="ok">품절 반영</span> : <span className="muted">판매 안 함</span>}</td>
                    ))}
                    <td>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={posDone}
                          onChange={(e) =>
                            update((s) => ({
                              ...s,
                              posSoldOutChecked: e.target.checked
                                ? [...s.posSoldOutChecked, m.id]
                                : s.posSoldOutChecked.filter((x) => x !== m.id),
                            }))
                          }
                        />
                        {posDone ? '포스도 껐어요' : '포스는 직접 (메뉴 길게 누르기)'}
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

/* ---------------- 마감 정산 ---------------- */

function MoneyInput({ id, label, value, onChange }: { id: string; label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : value.toLocaleString('ko-KR'))
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="money">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={text}
          placeholder="0"
          onChange={(e) => {
            const n = parseWon(e.target.value)
            setText(n === null ? '' : n.toLocaleString('ko-KR'))
            onChange(n)
          }}
        />
        <span>원</span>
      </div>
    </div>
  )
}

export function Settle(c: Ctx) {
  const { arrived, stateOf, state, update, now } = c
  const [copied, setCopied] = useState(false)
  const valid = arrived.filter((o) => stateOf(o).status !== 'cancelled')
  const cancelled = arrived.length - valid.length
  const open = valid.filter((o) => ['new', 'accepted', 'ready'].includes(stateOf(o).status)).length
  const per = Object.fromEntries(
    CHANNELS.map((ch) => [ch, settleChannel(valid.filter((o) => o.channel === ch), state.fees[ch])]),
  ) as Record<Channel, ChannelSettle>
  const basis = state.ledgerBasis
  const appVal = (ch: Channel) => (basis === 'gross' ? per[ch].gross : per[ch].net)
  const card = state.hallCard ?? 0
  const cash = state.hallCash ?? 0
  const total = card + cash + CHANNELS.reduce((s, ch) => s + appVal(ch), 0)
  const date = todayKey().slice(5, 7) + '-' + todayKey().slice(7)
  const csvHead = '날짜,카드,현금,주걱,빨리와,동네배달,합계'
  const csvRow = [date, card, cash, appVal('jugeok'), appVal('ppalliwa'), appVal('dongnae'), total].join(',')

  async function copy() {
    const ok = await copyText(`${csvHead}\n${csvRow}`)
    setCopied(ok)
    c.toast(ok ? '장부 한 줄을 복사했어요 (엑셀에 붙여넣기)' : '복사가 안 됐어요. 아래 글자를 길게 눌러 복사하세요')
  }

  return (
    <div className="page">
      <h1>마감 정산</h1>
      <p className="lead">
        {fmtTime(now)} 기준 · 배달 {valid.length}건{cancelled > 0 && ` (취소 ${cancelled}건 뺌)`}
        {open > 0 && ` · 아직 진행 중 ${open}건 포함`}
      </p>

      <section className="panel" aria-labelledby="h-apps">
        <h2 id="h-apps">배달앱 3곳</h2>
        <div className="tbl-wrap">
          <table className="tbl num stack">
            <thead>
              <tr>
                <th>앱</th>
                <th>건수</th>
                <th>주문 금액</th>
                <th>수수료 · 배달비 (추정)</th>
                <th>입금 예정</th>
                <th>앱 화면에 보이는 금액</th>
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((ch) => (
                <tr key={ch}>
                  <th scope="row">
                    <span className={`badge ch-${ch}`}>{CHANNEL_NAME[ch]}</span>
                  </th>
                  <td data-label="건수">{per[ch].count}</td>
                  <td data-label="주문 금액">{won(per[ch].gross)}</td>
                  <td data-label="수수료 · 배달비">-{won(per[ch].fee)}</td>
                  <td data-label="입금 예정">{won(per[ch].net)}</td>
                  <td data-label="앱 화면 금액">
                    <div><b>{won(per[ch].appShown)}</b>
                    <div className="sub">{state.fees[ch].appShows === 'net' ? '수수료 뺀 입금액만 보여요' : '주문 금액 그대로'}</div></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">앱 화면의 숫자와 "앱 화면에 보이는 금액"이 같으면 맞는 거예요.</p>
      </section>

      <section className="panel" aria-labelledby="h-hall">
        <h2 id="h-hall">홀 (카드 단말기 · 현금)</h2>
        <div className="fields">
          <MoneyInput id="hall-card" label="카드 (단말기 정산표 합계)" value={state.hallCard} onChange={(v) => update((s) => ({ ...s, hallCard: v }))} />
          <MoneyInput id="hall-cash" label="현금 (서랍)" value={state.hallCash} onChange={(v) => update((s) => ({ ...s, hallCash: v }))} />
        </div>
      </section>

      <section className="panel" aria-labelledby="h-ledger">
        <h2 id="h-ledger">장부에 적을 한 줄</h2>
        <fieldset className="radios">
          <legend>배달앱 금액 기준</legend>
          <label>
            <input type="radio" name="basis" checked={basis === 'gross'} onChange={() => update((s) => ({ ...s, ledgerBasis: 'gross' }))} />
            주문 금액 (지금 장부와 같게)
          </label>
          <label>
            <input type="radio" name="basis" checked={basis === 'net'} onChange={() => update((s) => ({ ...s, ledgerBasis: 'net' }))} />
            실제 입금액
          </label>
        </fieldset>
        <div className="tbl-wrap">
          <table className="tbl num ledger stack">
            <thead>
              <tr>
                {csvHead.split(',').map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="날짜">{date}</td>
                <td data-label="카드">{card.toLocaleString('ko-KR')}</td>
                <td data-label="현금">{cash.toLocaleString('ko-KR')}</td>
                <td data-label="주걱">{appVal('jugeok').toLocaleString('ko-KR')}</td>
                <td data-label="빨리와">{appVal('ppalliwa').toLocaleString('ko-KR')}</td>
                <td data-label="동네배달">{appVal('dongnae').toLocaleString('ko-KR')}</td>
                <td data-label="합계">
                  <b>{total.toLocaleString('ko-KR')}</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {(state.hallCard === null || state.hallCash === null) && <p className="warn">카드 · 현금을 넣어야 합계가 맞아요.</p>}
        <div className="row">
          <button type="button" className="btn primary big" onClick={copy}>
            {copied ? '복사됨 — 다시 복사' : '장부 한 줄 복사'}
          </button>
          <button type="button" className="btn ghost" onClick={() => window.print()}>
            인쇄
          </button>
        </div>
      </section>

      <details className="panel">
        <summary>수수료 기준 바꾸기</summary>
        <p className="hint">앱마다 계약한 요율이 달라요. 정산서를 보고 맞춰 주세요.</p>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>앱</th>
                <th>중개 %</th>
                <th>결제 %</th>
                <th>배달비 (건당)</th>
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((ch) => (
                <tr key={ch}>
                  <th scope="row">{CHANNEL_NAME[ch]}</th>
                  {(['commissionPct', 'paymentPct', 'deliveryFee'] as const).map((k) => (
                    <td key={k}>
                      <input
                        className="num-in"
                        type="number"
                        min={0}
                        max={k === 'deliveryFee' ? 10000 : 50}
                        step={k === 'deliveryFee' ? 100 : 0.1}
                        aria-label={`${CHANNEL_NAME[ch]} ${k === 'commissionPct' ? '중개 수수료' : k === 'paymentPct' ? '결제 수수료' : '배달비'}`}
                        value={state.fees[ch][k]}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(Number(e.target.value) || 0, k === 'deliveryFee' ? 10000 : 50))
                          update((s) => ({ ...s, fees: { ...s.fees, [ch]: { ...s.fees[ch], [k]: v } } }))
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="panel">
        <summary>데모 처음부터</summary>
        <p className="hint">주문 · 품절 · 재고 · 정산 입력을 모두 지우고 11:40부터 다시 시작해요.</p>
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            if (confirm('모든 기록을 지우고 처음부터 시작할까요?')) {
              resetAll()
              location.hash = '#/'
              location.reload()
            }
          }}
        >
          모두 지우기
        </button>
      </details>
    </div>
  )
}

/* ---------------- 발주 ---------------- */

export function Supply(c: Ctx) {
  const { state, update, now, arrived, stateOf } = c
  const [extra, setExtra] = useState('')
  const rows = supplyPlan(now, state.stock, state.hallFactor)
  const msg = supplyMessage(rows, state.supplyExtra)
  const deadline = 17 * 60
  const leftMin = Math.round(deadline - now)
  const sold = soldCount(arrived.filter((o) => stateOf(o).status !== 'cancelled'))
  const short = rows.filter((r) => r.shortToday)

  function setStock(id: string, v: number) {
    update((s) => ({ ...s, stock: { ...s.stock, [id]: Math.max(0, Math.min(99, Math.round(v * 2) / 2)) } }))
  }

  function addExtra() {
    const t = extra.trim().slice(0, 40)
    if (!t) return
    update((s) => ({ ...s, supplyExtra: [...s.supplyExtra, t] }))
    setExtra('')
  }

  async function copy() {
    const ok = await copyText(msg)
    c.toast(ok ? '발주 문구를 복사했어요. 이사장님 메신저에 붙여넣기 하세요' : '복사가 안 됐어요. 글자를 길게 눌러 복사하세요')
  }

  return (
    <div className="page">
      <h1>발주</h1>
      <div className={state.supplySentAt !== null ? 'banner ok' : leftMin <= 30 ? 'banner urgent' : 'banner'} role="status">
        {state.supplySentAt !== null
          ? `오늘 발주 보냄 (${fmtTime(state.supplySentAt)})`
          : leftMin > 0
            ? `우리식자재 발주 마감 17:00 — ${Math.floor(leftMin / 60) > 0 ? `${Math.floor(leftMin / 60)}시간 ` : ''}${leftMin % 60}분 남음`
            : `17:00 마감이 지났어요 — 전화로 먼저 물어보세요`}
      </div>

      {short.length > 0 && (
        <p className="warn">
          오늘 저녁까지 모자랄 수 있어요: {short.map((r) => r.ing.name).join(', ')} — 동네마트에서 사 오거나 미리 품절 준비
        </p>
      )}

      <section className="panel" aria-labelledby="h-stock">
        <h2 id="h-stock">남은 재료 넣기</h2>
        <p className="hint">냉장고 · 선반을 보고 남은 양만 맞춰 주세요. 나머지는 판매량으로 계산해요.</p>
        <div className="tbl-wrap">
          <table className="tbl stock">
            <thead>
              <tr>
                <th>재료</th>
                <th>남은 양</th>
                <th>오늘 마감까지 쓸 양</th>
                <th>내일 쓸 양</th>
                <th>발주 제안</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ing.id} className={r.shortToday ? 'short' : ''}>
                  <th scope="row">
                    {r.ing.name}
                    <div className="sub">{r.ing.unit}</div>
                  </th>
                  <td>
                    <div className="stepper">
                      <button type="button" aria-label={`${r.ing.name} 줄이기`} onClick={() => setStock(r.ing.id, r.stock - r.ing.step)}>
                        -
                      </button>
                      <output aria-live="polite" aria-label={`${r.ing.name} 남은 양`}>
                        {fmtQty(r.stock)}
                      </output>
                      <button type="button" aria-label={`${r.ing.name} 늘리기`} onClick={() => setStock(r.ing.id, r.stock + r.ing.step)}>
                        +
                      </button>
                    </div>
                  </td>
                  <td>{fmtQty(Math.round(r.restToday * 10) / 10)}</td>
                  <td>{fmtQty(Math.round(r.tomorrow * 10) / 10)}</td>
                  <td>
                    <b>{r.order > 0 ? `${fmtQty(r.order)} ${r.ing.unit}` : '안 시켜도 됨'}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary>계산 방법</summary>
          <p className="hint">
            지난 6일 배달 주문으로 시간대별 판매량을 구하고, 홀 판매는 배달의{' '}
            <label>
              <input
                className="num-in"
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={state.hallFactor}
                aria-label="홀 판매 배수"
                onChange={(e) => update((s) => ({ ...s, hallFactor: Math.max(0, Math.min(5, Number(e.target.value) || 0)) }))}
              />
              배
            </label>
            로 봐요. 남은 재료로 오늘 마감까지 쓰고, 남는 양을 빼서 내일 하루치(+10% 여유)를 맞춰요.
          </p>
        </details>
      </section>

      <section className="panel" aria-labelledby="h-sold">
        <h2 id="h-sold">오늘 배달로 나간 것</h2>
        {Object.keys(sold).length === 0 ? (
          <p className="empty">아직 없어요</p>
        ) : (
          <ul className="chips">
            {Object.entries(sold)
              .sort((a, b) => b[1] - a[1])
              .map(([n, q]) => (
                <li key={n}>
                  {n} <b>{q}</b>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="h-msg">
        <h2 id="h-msg">거래처에 보낼 문구</h2>
        <div className="field inline">
          <label htmlFor="extra">다른 품목 더하기</label>
          <input
            id="extra"
            value={extra}
            maxLength={40}
            placeholder="예: 포장용기 대 1박스"
            onChange={(e) => setExtra(e.target.value)}
            onKeyDown={(e) => {
              if (isRealEnter(e)) {
                e.preventDefault()
                addExtra()
              }
            }}
          />
          <button type="button" className="btn ghost" onClick={addExtra} disabled={!extra.trim()}>
            더하기
          </button>
        </div>
        {state.supplyExtra.length > 0 && (
          <ul className="chips">
            {state.supplyExtra.map((x, i) => (
              <li key={`${x}-${i}`}>
                {x}
                <button
                  type="button"
                  className="chip-x"
                  aria-label={`${x} 빼기`}
                  onClick={() => update((s) => ({ ...s, supplyExtra: s.supplyExtra.filter((_, j) => j !== i) }))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <pre className="msg" aria-label="발주 문구">
          {msg || '시킬 게 없어요'}
        </pre>
        <div className="row">
          <button type="button" className="btn primary big" onClick={copy} disabled={!msg}>
            문구 복사
          </button>
          {state.supplySentAt === null ? (
            <button type="button" className="btn" onClick={() => update((s) => ({ ...s, supplySentAt: now }))} disabled={!msg}>
              보냈어요
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={() => update((s) => ({ ...s, supplySentAt: null }))}>
              보냄 취소
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
