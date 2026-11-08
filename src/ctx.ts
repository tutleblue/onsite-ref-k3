import type { AppState, OrderState } from './store'
import type { Order } from './sim'

export interface Ctx {
  state: AppState
  update: (f: (s: AppState) => AppState) => void
  now: number
  all: Order[]
  arrived: Order[]
  next: Order | undefined
  jumpTo: (min: number) => void
  stateOf: (o: Order) => OrderState
  setOrder: (id: string, f: (s: OrderState) => OrderState | null) => void
  toast: (msg: string, undo?: () => void) => void
  soldOut: Set<string>
}

export function suggestPrep(options: number[], inKitchen: number): number {
  // 주방에 쌓인 주문 수로 조리시간을 고른다: 비면 짧게, 밀리면 길게 (라이더가 덜 기다리고 음식이 덜 식게)
  const want = 10 + inKitchen * 4
  return options.find((m) => m >= want) ?? options[options.length - 1]
}
