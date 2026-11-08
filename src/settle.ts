import type { Channel, Order } from './sim'

// 앱별 금액 표시 방식
// 주걱: 주문 금액을 보여 주고 수수료는 정산서에 따로
// 빨리와: 수수료 · 배달비 · 결제수수료를 뺀 "입금 예정액"만 보여 준다
// 동네배달: 매출(주문 금액)을 보여 주고 수수료는 별도 표기
// 요율은 가게 계약마다 달라서 화면에서 바꿀 수 있게 했다. 기본값은 상생안 구간(중개 2.0~7.8%, 배달비 1,900~3,400원) 안에서 잡은 값.
export interface FeeRule {
  commissionPct: number
  paymentPct: number
  deliveryFee: number
  appShows: 'gross' | 'net'
}

export const DEFAULT_FEES: Record<Channel, FeeRule> = {
  jugeok: { commissionPct: 6.8, paymentPct: 3.0, deliveryFee: 2900, appShows: 'gross' },
  ppalliwa: { commissionPct: 7.8, paymentPct: 3.0, deliveryFee: 3400, appShows: 'net' },
  dongnae: { commissionPct: 2.0, paymentPct: 3.0, deliveryFee: 1900, appShows: 'gross' },
}

export interface ChannelSettle {
  count: number
  gross: number
  fee: number
  net: number
  appShown: number
}

export function settleChannel(orders: Order[], rule: FeeRule): ChannelSettle {
  const gross = orders.reduce((s, o) => s + o.total, 0)
  const fee = Math.round(
    orders.reduce(
      (s, o) => s + (o.total * (rule.commissionPct + rule.paymentPct)) / 100 + rule.deliveryFee,
      0,
    ),
  )
  const net = gross - fee
  return { count: orders.length, gross, fee, net, appShown: rule.appShows === 'net' ? net : gross }
}
