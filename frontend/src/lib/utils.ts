import { validateAddress } from '@alephium/web3'
import { CountdownGame } from '../../../artifacts/ts/CountdownGame'
import testnetDeployments from '../../../deployments/.deployments.testnet.json'
import mainnetDeployments from '../../../deployments/.deployments.mainnet.json'

const deploymentsData = import.meta.env.VITE_ALEPHIUM_NETWORK === 'mainnet' ? mainnetDeployments : testnetDeployments
import type { AppPage, StoredActiveBet, TimerPart } from '../types'

// ─── Deployments ────────────────────────────────────────────────────────────

function getDeploymentsArray() {
  return Array.isArray(deploymentsData) ? deploymentsData : [deploymentsData]
}

export function getContractAddressFromDeployments(): string | undefined {
  for (const deployment of getDeploymentsArray()) {
    const countdownGame = deployment.contracts?.CountdownGame
    if (countdownGame?.contractInstance?.address) {
      return countdownGame.contractInstance.address
    }
  }
  return undefined
}

export function getBettingContractAddressFromDeployments(): string | undefined {
  for (const deployment of getDeploymentsArray()) {
    const contracts = deployment.contracts as Record<string, { contractInstance?: { address?: string } }> | undefined
    const betting = contracts?.CountdownBettingMarket
    if (betting?.contractInstance?.address) {
      return betting.contractInstance.address
    }
  }
  return undefined
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_NODE_URL = 'https://node.testnet.alephium.org'
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_COUNTDOWN_CONTRACT_ADDRESS?.trim() || getContractAddressFromDeployments() || ''
export const BETTING_CONTRACT_ADDRESS =
  import.meta.env.VITE_BETTING_CONTRACT_ADDRESS?.trim() || getBettingContractAddressFromDeployments() || ''
export const NODE_URL = (import.meta.env.VITE_NODE_URL ?? DEFAULT_NODE_URL).trim() || DEFAULT_NODE_URL
export const NETWORK = import.meta.env.VITE_ALEPHIUM_NETWORK?.trim() || 'testnet'
export const EXPLORER_URL =
  NETWORK === 'mainnet' ? 'https://explorer.alephium.org' : 'https://testnet.alephium.org'
export const fetcher: typeof fetch = (input, init) => window.fetch(input, init)
export const THIRTY_MINUTES_MS = 30n * 60n * 1000n
export const BET_STORAGE_PREFIX = 'halph.active-bet.'

// ─── Address helpers ─────────────────────────────────────────────────────────

export function stripAddressGroup(address: string): string {
  const colonIndex = address.indexOf(':')
  if (colonIndex !== -1) {
    return address.slice(0, colonIndex)
  }
  return address
}

export function formatAddress(address: string): string {
  const cleaned = stripAddressGroup(address)
  if (cleaned.length <= 12) return cleaned
  return `${cleaned.slice(0, 6)}...${cleaned.slice(-4)}`
}

export function formatAddressWithYou(address: string, connectedAddress?: string): string {
  const cleaned = stripAddressGroup(address)
  const connectedCleaned = connectedAddress ? stripAddressGroup(connectedAddress) : ''
  const formatted = formatAddress(address)
  if (connectedCleaned && cleaned === connectedCleaned) {
    return `${formatted} (You)`
  }
  return formatted
}

export function isValidAlephiumAddress(address: string): boolean {
  const normalized = stripAddressGroup(address.trim())
  if (normalized.length === 0) return false
  try {
    validateAddress(normalized)
    return true
  } catch {
    return false
  }
}

// ─── Amount helpers ───────────────────────────────────────────────────────────

export function attoToAlph(atto: bigint, decimals: number = 4): string {
  const base = 10n ** 18n
  const integer = atto / base
  const fraction = (atto % base).toString().padStart(18, '0').slice(0, decimals)
  return `${integer.toString()}.${fraction}`
}

export function alphToAtto(value: string): bigint | null {
  const normalized = value.trim()
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const paddedFraction = (fraction + '0'.repeat(18)).slice(0, 18)
  return BigInt(whole) * 10n ** 18n + BigInt(paddedFraction)
}

export function sanitizeBetAmountInput(raw: string): string {
  const withDot = raw.replace(/,/g, '.')
  let result = ''
  let dotSeen = false
  for (const char of withDot) {
    if (char >= '0' && char <= '9') {
      result += char
    } else if (char === '.' && !dotSeen) {
      result += char
      dotSeen = true
    }
  }
  if (result.startsWith('.')) return `0${result}`
  return result
}

// ─── Local storage ────────────────────────────────────────────────────────────

export function getBetStorageKey(walletAddress: string): string {
  return `${BET_STORAGE_PREFIX}${stripAddressGroup(walletAddress)}`
}

export function readStoredActiveBet(walletAddress: string): StoredActiveBet | null {
  try {
    const raw = window.localStorage.getItem(getBetStorageKey(walletAddress))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredActiveBet
    if (!parsed?.roundId || !parsed?.target || !parsed?.amount || !parsed?.status) return null
    return parsed
  } catch {
    return null
  }
}

export function writeStoredActiveBet(walletAddress: string, payload: StoredActiveBet): void {
  window.localStorage.setItem(getBetStorageKey(walletAddress), JSON.stringify(payload))
}

export function clearStoredActiveBet(walletAddress: string): void {
  window.localStorage.removeItem(getBetStorageKey(walletAddress))
}

// ─── Routing ──────────────────────────────────────────────────────────────────

export function getBasePath(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function pageFromLocation(pathname: string, hash: string): AppPage {
  const normalizedHash = hash.replace(/^#/, '')
  if (normalizedHash === '/betting') return 'betting'
  if (normalizedHash === '/howto') return 'instructions'

  const base = getBasePath()
  const withoutBase = pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname
  if (withoutBase === '/betting') return 'betting'
  if (withoutBase === '/howto') return 'instructions'
  return 'game'
}

export function urlFromPage(page: AppPage): string {
  const base = getBasePath()
  if (page === 'betting') return `${base}#/betting`
  if (page === 'instructions') return `${base}#/howto`
  return `${base}#/`
}

// ─── Timer ────────────────────────────────────────────────────────────────────

export function msToTimerParts(ms: bigint): TimerPart[] {
  if (ms <= 0n) {
    return [{ value: '0', unit: 's' }]
  }
  const second = 1000n
  const minute = 60n * second
  const hour = 60n * minute
  const day = 24n * hour
  const year = 365n * day

  let remaining = ms
  const years = remaining / year
  remaining %= year
  const days = remaining / day
  remaining %= day
  const hours = remaining / hour
  remaining %= hour
  const minutes = remaining / minute
  remaining %= minute
  const seconds = remaining / second

  const parts: TimerPart[] = []
  let started = false

  if (years > 0n) {
    parts.push({ value: years.toString(), unit: 'y' })
    started = true
  }
  if (days > 0n || started) {
    parts.push({ value: days.toString(), unit: 'd' })
    started = true
  }
  if (hours > 0n || started) {
    parts.push({ value: hours.toString().padStart(2, '0'), unit: 'h' })
    started = true
  }
  if (minutes > 0n || started) {
    parts.push({ value: minutes.toString().padStart(2, '0'), unit: 'm' })
    started = true
  }
  parts.push({ value: seconds.toString().padStart(2, '0'), unit: 's' })

  return parts
}

export function formatCompactTimer(parts: TimerPart[]): string {
  if (parts.length === 0) return '0s'
  const visible = parts.slice(0, 3)
  const compact = visible.map((part) => `${part.value}${part.unit}`).join(' ')
  return parts.length > 3 ? `${compact} ...` : compact
}

export function getHalvedCount(durationMs: bigint): number {
  const initial = CountdownGame.consts.INITIAL_DURATION_MS
  if (durationMs <= 0n || durationMs > initial) return 0
  let count = 0
  let probe = initial
  while (probe > durationMs) {
    probe = probe / 2n
    if (probe == 0n) break
    count += 1
  }
  return count
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
