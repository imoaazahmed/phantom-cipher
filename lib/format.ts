import type { FormatType } from '@/lib/trades/types'

export function formatValue(value: unknown, type: FormatType): string {
  switch (type) {
    case 'currency': {
      const n = Number(value)
      if (isNaN(n)) return String(value ?? '')
      return '$' + Math.abs(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    }
    case 'number': {
      const n = Number(value)
      if (isNaN(n)) return String(value ?? '')
      return n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    }
    case 'percent': {
      const n = Number(value)
      if (isNaN(n)) return String(value ?? '')
      return n.toFixed(2) + '%'
    }
    case 'date': {
      if (!value) return ''
      const str = String(value)
      // YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const [y, m, d] = str.split('T')[0].split('-')
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        return `${parseInt(d)} ${months[parseInt(m) - 1]} '${y.slice(2)}`
      }
      return str
    }
    case 'time': {
      if (!value) return ''
      const str = String(value)
      const [hStr, mStr] = str.split(':')
      const h = parseInt(hStr)
      if (isNaN(h)) return str
      const ampm = h >= 12 ? 'PM' : 'AM'
      const h12 = h % 12 || 12
      return `${h12}:${mStr} ${ampm}`
    }
    case 'text':
      return String(value ?? '')
    case 'auto':
    default:
      return autoFormat(value)
  }
}

function autoFormat(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }
  const str = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return formatValue(value, 'date')
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(str)) return formatValue(value, 'time')
  return str
}
