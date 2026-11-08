import { CLOSE_MIN, DAY_SEED, type Order, generateDay } from './sim'

// 재료 1단위(발주 단위)로 만들 수 있는 양. 가게에서 실제로 재 보고 고칠 값.
export interface Ingredient {
  id: string
  name: string
  unit: string
  perPack: number
  step: number
}

export const INGREDIENTS: Ingredient[] = [
  { id: 'gim', name: '김', unit: '속(100장)', perPack: 100, step: 1 },
  { id: 'danmuji', name: '단무지', unit: '봉', perPack: 40, step: 0.5 },
  { id: 'ham', name: '햄', unit: 'kg', perPack: 35, step: 0.5 },
  { id: 'tuna', name: '참치', unit: '캔(대)', perPack: 12, step: 1 },
  { id: 'cheese', name: '슬라이스 치즈', unit: '팩(50장)', perPack: 50, step: 0.5 },
  { id: 'donkatsu', name: '돈까스', unit: '팩(10장)', perPack: 10, step: 1 },
  { id: 'tteok', name: '떡볶이 떡', unit: '봉(1.5kg)', perPack: 6, step: 0.5 },
  { id: 'eomuk', name: '어묵', unit: '봉', perPack: 10, step: 0.5 },
  { id: 'ramen', name: '라면사리', unit: '박스(40개)', perPack: 40, step: 0.5 },
  { id: 'jjol', name: '쫄면사리', unit: '봉(5인분)', perPack: 5, step: 1 },
  { id: 'sundae', name: '순대', unit: 'kg', perPack: 4, step: 0.5 },
]

export const DEFAULT_STOCK: Record<string, number> = {
  gim: 1,
  danmuji: 1,
  ham: 1.5,
  tuna: 3,
  cheese: 1,
  donkatsu: 2,
  tteok: 3,
  eomuk: 2,
  ramen: 1,
  jjol: 2,
  sundae: 1.5,
}

// 메뉴 1개에 드는 재료 (단위: 개 · 장 · 인분)
const RECIPE: Record<string, Record<string, number>> = {
  'gimbap-basic': { gim: 1, danmuji: 1, ham: 1 },
  'gimbap-tuna': { gim: 1, danmuji: 1, ham: 1, tuna: 1 },
  'gimbap-cheese': { gim: 1, danmuji: 1, ham: 1, cheese: 2 },
  'gimbap-ttaengcho': { gim: 1, danmuji: 1, ham: 1 },
  'gimbap-donkatsu': { gim: 1, danmuji: 1, donkatsu: 1 },
  tteokbokki: { tteok: 1, eomuk: 0.3 },
  rabokki: { tteok: 0.7, ramen: 1, eomuk: 0.3 },
  jjolmyeon: { jjol: 1 },
  sundae: { sundae: 1 },
  eomuk: { eomuk: 1 },
}

export function usage(orders: Order[]): Record<string, number> {
  const u: Record<string, number> = {}
  for (const o of orders) {
    for (const it of o.items) {
      const r = RECIPE[it.id]
      if (!r) continue
      for (const [ing, n] of Object.entries(r)) u[ing] = (u[ing] ?? 0) + n * it.qty
      if (it.options.includes('치즈 추가')) u.cheese = (u.cheese ?? 0) + it.qty
    }
  }
  return u
}

export function soldCount(orders: Order[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const o of orders) for (const it of o.items) c[it.name] = (c[it.name] ?? 0) + it.qty
  return c
}

// 지난 6일 배달 주문 (시뮬레이터 기록). 실제로는 지난 주문 기록이 쌓이면 그걸 쓴다.
let pastCache: Order[][] | null = null
export function pastDays(): Order[][] {
  if (!pastCache) pastCache = [1, 2, 3, 4, 5, 6].map((k) => generateDay(DAY_SEED - k, `past-${k}`))
  return pastCache
}

export interface SupplyRow {
  ing: Ingredient
  stock: number
  restToday: number
  tomorrow: number
  order: number
  shortToday: boolean
}

/**
 * 발주 제안. 배달 주문은 기록이 있고, 홀 판매는 배달의 hallFactor배로 본다.
 * 남은 재고로 오늘 마감까지 버티고, 내일 하루치(+10% 여유)를 아침 납품으로 채운다.
 */
export function supplyPlan(now: number, stock: Record<string, number>, hallFactor: number): SupplyRow[] {
  const days = pastDays()
  const mult = 1 + hallFactor
  const avg = (pick: (o: Order) => boolean) => {
    const total: Record<string, number> = {}
    for (const d of days) {
      const u = usage(d.filter(pick))
      for (const [k, v] of Object.entries(u)) total[k] = (total[k] ?? 0) + v
    }
    for (const k of Object.keys(total)) total[k] = (total[k] / days.length) * mult
    return total
  }
  const rest = avg((o) => o.at > now && o.at <= CLOSE_MIN)
  const full = avg(() => true)
  return INGREDIENTS.map((ing) => {
    const s = stock[ing.id] ?? 0
    const restToday = (rest[ing.id] ?? 0) / ing.perPack
    const tomorrow = (full[ing.id] ?? 0) / ing.perPack
    const leftTonight = Math.max(0, s - restToday)
    const need = tomorrow * 1.1 - leftTonight
    const order = need <= 0 ? 0 : Math.ceil(need / ing.step) * ing.step
    return { ing, stock: s, restToday, tomorrow, order, shortToday: s < restToday }
  })
}

export function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function supplyMessage(rows: SupplyRow[], extra: string[]): string {
  const lines = rows.filter((r) => r.order > 0).map((r) => `${r.ing.name} ${fmtQty(r.order)}${r.ing.unit.replace(/\(.*\)/, '')}`)
  const all = [...lines, ...extra]
  if (all.length === 0) return ''
  return ['이사장님 두줄김밥입니다.', '내일 아침 납품 부탁드려요.', '', ...all.map((l) => `- ${l}`), '', '감사합니다.'].join('\n')
}
