import { CHANNEL_NAME, type Order, fmtTime, won } from './sim'
import type { OrderState } from './store'

export function Ticket({ order, st }: { order: Order; st: OrderState }) {
  const due = st.acceptedAt !== undefined && st.prep ? st.acceptedAt + st.prep : null
  return (
    <div className="ticket">
      <div className="t-head">
        <span>[{CHANNEL_NAME[order.channel]}]</span>
        <span>{order.id}</span>
      </div>
      <div className="t-time">
        주문 {fmtTime(order.at)}
        {due !== null && ` · 픽업 ${fmtTime(due)}`}
      </div>
      <hr />
      <ul className="t-items">
        {order.items.map((i) => (
          <li key={i.id}>
            <span>{i.name}</span>
            <b>{i.qty}</b>
            {i.options.length > 0 && <div className="t-opt">* {i.options.join(', ')}</div>}
          </li>
        ))}
      </ul>
      {(order.request || st.memo) && (
        <div className="t-req">
          {order.request && <div>요청: {order.request}</div>}
          {st.memo && <div>메모: {st.memo}</div>}
        </div>
      )}
      <hr />
      <div className="t-foot">
        <div>{order.address}</div>
        <div>{won(order.total)} (결제 완료)</div>
      </div>
    </div>
  )
}
