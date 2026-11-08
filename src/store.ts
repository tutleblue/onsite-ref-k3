import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DAY_SEED,
  DEMO_START_MIN,
  type Order,
  type SoldOutRule,
  generateDay,
  loadClock,
  saveClock,
  simNow,
  todayKey,
} from './sim'
import { DEFAULT_FEES, type FeeRule } from './settle'
import { DEFAULT_STOCK } from './supply'
import type { Channel } from './sim'

export type Status = 'new' | 'accepted' | 'ready' | 'picked' | 'cancelled'

export interface OrderState {
  status: Status
  prep?: number
  acceptedAt?: number
  readyAt?: number
  memo?: string
  printed?: boolean
}

export interface AppState {
  v: 1
  orders: Record<string, OrderState>
  soldOut: SoldOutRule[]
  autoPrint: boolean
  voice: boolean
  kitchenAuto: boolean
  bigText: boolean
  stock: Record<string, number>
  hallCard: number | null
  hallCash: number | null
  ledgerBasis: 'gross' | 'net'
  fees: Record<Channel, FeeRule>
  hallFactor: number
  supplyExtra: string[]
  supplySentAt: number | null
  posSoldOutChecked: string[]
}

const KEY = 'kimbap.app.v1'

const INITIAL: AppState = {
  v: 1,
  orders: {},
  soldOut: [],
  autoPrint: true,
  voice: false,
  kitchenAuto: true,
  bigText: false,
  stock: DEFAULT_STOCK,
  hallCard: null,
  hallCash: null,
  ledgerBasis: 'gross',
  fees: DEFAULT_FEES,
  hallFactor: 1.5,
  supplyExtra: [],
  supplySentAt: null,
  posSoldOutChecked: [],
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return INITIAL
    const s = JSON.parse(raw)
    if (s && s.v === 1) return { ...INITIAL, ...s }
  } catch {
    /* 깨진 저장값은 버리고 새로 */
  }
  return INITIAL
}

export function resetAll() {
  localStorage.removeItem(KEY)
  localStorage.removeItem('kimbap.clock.v1')
}

/** 앱 전체 상태. localStorage에 저장하고, 같은 컴퓨터의 다른 창(주방 모니터)과 실시간으로 맞춘다. */
export function useAppState() {
  const [state, setState] = useState<AppState>(load)
  const [saveError, setSaveError] = useState(false)
  const skipSave = useRef(false)

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }, [state])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          skipSave.current = true
          setState({ ...INITIAL, ...JSON.parse(e.newValue) })
        } catch {
          /* 무시 */
        }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((f: (s: AppState) => AppState) => setState(f), [])
  return { state, update, saveError }
}

export function useClock() {
  const [clock, setClock] = useState(loadClock)
  const [now, setNow] = useState(() => simNow(clock))
  useEffect(() => {
    setNow(simNow(clock))
    const t = setInterval(() => setNow(simNow(clock)), 1000)
    return () => clearInterval(t)
  }, [clock])
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'kimbap.clock.v1') setClock(loadClock())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const jumpTo = useCallback(
    (min: number) => {
      const c = { ...clock, offsetSec: clock.offsetSec + (min - simNow(clock)) * 60 + 1 }
      saveClock(c)
      setClock(c)
    },
    [clock],
  )
  return { now, jumpTo }
}

export function useOrders(state: AppState, now: number) {
  const dateKey = todayKey()
  const rulesKey = JSON.stringify(state.soldOut)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => generateDay(DAY_SEED, dateKey, state.soldOut), [dateKey, rulesKey])
  const arrived = all.filter((o) => o.at <= now)
  const next = all.find((o) => o.at > now)
  const stateOf = (o: Order): OrderState =>
    state.orders[o.id] ?? { status: o.at < DEMO_START_MIN ? 'picked' : 'new' }
  return { all, arrived, next, stateOf }
}

/** 지금 이 시각에 품절인 메뉴 id */
export function soldOutNow(rules: SoldOutRule[], now: number): Set<string> {
  return new Set(rules.filter((r) => now >= r.from && (r.to === null || now < r.to)).map((r) => r.menuId))
}
