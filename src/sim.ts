// 배달앱 3곳(주걱 · 빨리와 · 동네배달) 주문 시뮬레이터.
// 실제 배달앱과 연결할 수 없어서, 시드를 고정한 가짜 주문을 시간에 맞춰 만든다.
// 같은 시드면 항상 같은 주문이 같은 시각에 들어온다.

export type Channel = 'jugeok' | 'ppalliwa' | 'dongnae'

export const CHANNELS: Channel[] = ['jugeok', 'ppalliwa', 'dongnae']

export const CHANNEL_NAME: Record<Channel, string> = {
  jugeok: '주걱',
  ppalliwa: '빨리와',
  dongnae: '동네배달',
}

export const CHANNEL_PREFIX: Record<Channel, string> = {
  jugeok: 'JG',
  ppalliwa: 'PW',
  dongnae: 'DN',
}

// 앱마다 고를 수 있는 조리시간 (분)
export const PREP_TIMES: Record<Channel, number[]> = {
  jugeok: [10, 15, 20, 30, 40],
  ppalliwa: [10, 15, 20, 30],
  dongnae: [15, 20, 30],
}

export interface MenuItem {
  id: string
  name: string
  appPrice: number
  channels: Channel[]
  options: string[]
  weight: number
}

// 가게 메뉴판 (배달 가격)
export const MENU: MenuItem[] = [
  { id: 'gimbap-basic', name: '기본김밥', appPrice: 4500, channels: ['jugeok', 'ppalliwa', 'dongnae'], options: ['오이 빼기', '단무지 많이', '밥 적게'], weight: 10 },
  { id: 'gimbap-tuna', name: '참치김밥', appPrice: 5500, channels: ['jugeok', 'ppalliwa', 'dongnae'], options: ['오이 빼기', '단무지 많이', '치즈 추가'], weight: 9 },
  { id: 'gimbap-cheese', name: '치즈김밥', appPrice: 5500, channels: ['jugeok', 'ppalliwa', 'dongnae'], options: ['오이 빼기', '단무지 많이'], weight: 6 },
  { id: 'gimbap-ttaengcho', name: '땡초김밥', appPrice: 5500, channels: ['jugeok', 'ppalliwa', 'dongnae'], options: ['오이 빼기', '단무지 많이'], weight: 3 },
  { id: 'gimbap-donkatsu', name: '돈까스김밥', appPrice: 6500, channels: ['jugeok', 'ppalliwa', 'dongnae'], options: ['오이 빼기', '단무지 많이', '치즈 추가'], weight: 5 },
  { id: 'tteokbokki', name: '떡볶이', appPrice: 7000, channels: ['jugeok', 'ppalliwa', 'dongnae'], options: ['덜 맵게', '치즈 추가'], weight: 8 },
  { id: 'rabokki', name: '라볶이', appPrice: 8000, channels: ['jugeok', 'ppalliwa'], options: ['덜 맵게', '치즈 추가'], weight: 4 },
  { id: 'jjolmyeon', name: '쫄면', appPrice: 8000, channels: ['jugeok', 'ppalliwa', 'dongnae'], options: ['덜 맵게', '오이 빼기'], weight: 3 },
  { id: 'sundae', name: '순대', appPrice: 6000, channels: ['jugeok', 'ppalliwa'], options: [], weight: 3 },
  { id: 'eomuk', name: '어묵', appPrice: 5000, channels: ['jugeok', 'ppalliwa', 'dongnae'], options: [], weight: 4 },
  { id: 'drink-cider', name: '사이다', appPrice: 2000, channels: ['jugeok'], options: [], weight: 1 },
]

export const MENU_BY_ID: Record<string, MenuItem> = Object.fromEntries(MENU.map((m) => [m.id, m]))

export interface OrderItem {
  id: string
  name: string
  qty: number
  price: number
  options: string[]
}

export interface Order {
  id: string
  channel: Channel
  at: number // 그날 0시부터 분
  items: OrderItem[]
  request: string
  address: string
  total: number
}

export interface SoldOutRule {
  menuId: string
  from: number // 분. 이 시각 "뒤"에 들어오는 주문부터 빠진다
  to: number | null // 이 시각까지 들어온 주문에 적용
}

const ADDRESSES = [
  '새솔대 공학관 3층 연구실',
  '새솔대 공학관 5층',
  '새솔대 인문관 1층 과사무실',
  '새솔대 인문관 4층',
  '새솔대 기숙사 2동',
  '두줄로 18길 7 302호',
  '두줄로 18길 7 105호',
  '다솜길 21 201호',
  '다솜길 21 301호',
  '한울로 105 4층',
]

const FREE_REQUESTS = [
  '젓가락 2개',
  '수저 안 주셔도 돼요',
  '문 앞에 두고 문자 주세요',
  '벨 누르지 말아주세요',
  '단무지 많이 주세요',
  '오이 빼주세요 알레르기 있어요',
  '덜 맵게 해주세요',
  '김밥 썰어서 주세요',
  '빨리 부탁드려요',
]

export const OPEN_MIN = 9 * 60 + 10
export const CLOSE_MIN = 21 * 60 + 40

// mulberry32 — 작은 시드 난수
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 시간대별 배달 주문 수 (시간당). 대학가 점심 11:50~12:40에 몰린다.
function ratePerHour(min: number): number {
  if (min < 11 * 60) return 0.6
  if (min < 11 * 60 + 50) return 2
  if (min < 12 * 60 + 40) return 9
  if (min < 13 * 60 + 30) return 4
  if (min < 17 * 60) return 1.2
  if (min < 19 * 60 + 30) return 3.5
  return 1.5
}
const RATE_MAX = 9

function pickWeighted<T>(r: () => number, list: T[], w: (x: T) => number): T {
  const total = list.reduce((s, x) => s + w(x), 0)
  let v = r() * total
  for (const x of list) {
    v -= w(x)
    if (v <= 0) return x
  }
  return list[list.length - 1]
}

function isSoldOut(rules: SoldOutRule[], menuId: string, at: number) {
  return rules.some((x) => x.menuId === menuId && at > x.from && (x.to === null || at <= x.to))
}

export function pad(n: number, w = 2) {
  return String(n).padStart(w, '0')
}

export function fmtTime(min: number) {
  const m = Math.floor(min)
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function won(n: number) {
  return n.toLocaleString('ko-KR') + '원'
}

/** 하루 주문 전체를 만든다. rules가 있으면 그 시각에 품절인 메뉴는 주문에 들어가지 않는다. */
export function generateDay(seed: number, dateKey: string, rules: SoldOutRule[] = []): Order[] {
  const r = rng(seed)
  const orders: Order[] = []
  const seq: Record<Channel, number> = { jugeok: 0, ppalliwa: 0, dongnae: 0 }
  let t = OPEN_MIN
  while (true) {
    t += (-Math.log(1 - r()) / RATE_MAX) * 60
    if (t >= CLOSE_MIN - 10) break
    if (r() > ratePerHour(t) / RATE_MAX) continue
    const at = Math.round(t * 10) / 10 // 도착 판정(o.at <= now)과 품절 판정이 같은 값을 쓴다
    const cr = r()
    const channel: Channel = cr < 0.55 ? 'jugeok' : cr < 0.85 ? 'ppalliwa' : 'dongnae'
    const lines = r() < 0.45 ? 1 : r() < 0.8 ? 2 : 3
    const items: OrderItem[] = []
    for (let i = 0; i < lines; i++) {
      const avail = MENU.filter(
        (m) => m.channels.includes(channel) && !isSoldOut(rules, m.id, at) && !items.some((x) => x.id === m.id),
      )
      if (avail.length === 0) break
      const m = pickWeighted(r, avail, (x) => x.weight)
      const qty = m.id.startsWith('gimbap') ? (r() < 0.5 ? 1 : r() < 0.8 ? 2 : 3) : 1
      const options: string[] = []
      if (m.options.length && r() < 0.3) options.push(m.options[Math.floor(r() * m.options.length)])
      items.push({ id: m.id, name: m.name, qty, price: m.appPrice, options })
    }
    if (items.length === 0) continue
    const request = r() < 0.55 ? FREE_REQUESTS[Math.floor(r() * FREE_REQUESTS.length)] : ''
    const address = ADDRESSES[Math.floor(r() * ADDRESSES.length)]
    seq[channel]++
    const n = seq[channel]
    const id =
      channel === 'jugeok'
        ? `JG-${dateKey}-${pad(n, 4)}`
        : `${CHANNEL_PREFIX[channel]}-${dateKey.slice(5)}-${pad(n, 3)}`
    const total = items.reduce((s, x) => s + x.price * x.qty, 0)
    orders.push({ id, channel, at, items, request, address, total })
  }
  return orders
}

// ---- 데모 시계 ----
// 앱을 처음 연 순간을 11:40으로 두고, 실제 1초 = 가게 시간 10초로 흐른다.
// 실제 가게에선 배달앱 연동으로 바꿀 부분.
export const DEMO_START_MIN = 11 * 60 + 40
export const DEMO_SPEED = 10
export const DAY_SEED = 20261021

const CLOCK_KEY = 'kimbap.clock.v1'

interface ClockState {
  realStart: number
  offsetSec: number
}

export function loadClock(): ClockState {
  try {
    const raw = localStorage.getItem(CLOCK_KEY)
    if (raw) {
      const c = JSON.parse(raw)
      if (typeof c.realStart === 'number' && typeof c.offsetSec === 'number') return c
    }
  } catch {
    /* 깨진 값이면 새로 시작 */
  }
  const c = { realStart: Date.now(), offsetSec: 0 }
  saveClock(c)
  return c
}

export function saveClock(c: ClockState) {
  try {
    localStorage.setItem(CLOCK_KEY, JSON.stringify(c))
  } catch {
    /* 저장 공간이 없으면 시계만 매번 새로 시작 */
  }
}

export function simNow(c: ClockState, now = Date.now()): number {
  const m = DEMO_START_MIN + (((now - c.realStart) / 1000) * DEMO_SPEED + c.offsetSec) / 60
  return Math.min(m, CLOSE_MIN)
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}
