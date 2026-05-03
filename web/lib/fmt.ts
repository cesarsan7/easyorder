/**
 * Formatea un número como precio según la moneda del restaurante.
 * moneda es el código ISO 4217 (CLP, EUR, USD, etc.)
 */
export function fmtPrice(amount: number, moneda: string): string {
  const symbols: Record<string, string> = {
    CLP: '$',
    USD: '$',
    EUR: '€',
    MXN: '$',
    ARS: '$',
    COP: '$',
    PEN: 'S/',
    BRL: 'R$',
  }

  const symbol = symbols[moneda] ?? moneda + ' '

  // CLP y otras monedas sin decimales
  const noDecimals = new Set(['CLP', 'COP', 'ARS'])
  if (noDecimals.has(moneda)) {
    return `${symbol}${Math.round(amount).toLocaleString('es-CL')}`
  }

  return `${symbol}${amount.toFixed(2)}`
}
