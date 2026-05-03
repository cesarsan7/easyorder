/**
 * EasyOrder — Paletas de colores para plantillas de restaurante
 *
 * Cada paleta define los tokens de diseño que controlan el color de acento
 * del dashboard y del menú público.  Las propiedades neutras (sidebar, bordes,
 * texto base) son compartidas por todas las paletas y se declaran en NEUTRAL_TOKENS.
 *
 * USO MULTI-TENANT (futuro):
 *   - Guardar `theme_id` en la tabla `restaurante` (o en una tabla de configuración).
 *   - En el layout del dashboard y en el menú público, resolver la paleta con
 *     `getTheme(themeId)` y pasarla como prop o context.
 *   - Agregar pantalla de selección en /dashboard/[slug]/configuracion.
 */

export type ThemeId =
  | 'indigo'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'violet'
  | 'sky'

export interface ThemeTokens {
  /** Identificador único de la paleta */
  id: ThemeId
  /** Nombre legible para mostrar en el selector */
  name: string
  /** Descripción breve del carácter de la paleta */
  description: string
  /** Color principal (equivalente a *-500 en Tailwind) */
  accent: string
  /** Fondo suave del acento para ítem activo / badges (equivalente a *-50) */
  accentLight: string
  /** Texto sobre fondo claro con buen contraste (equivalente a *-700) */
  accentText: string
  /** Color del anillo de foco / hover suave (equivalente a *-100) */
  accentRing: string
  /** Preview: array de 3 swatches [accent, accentLight, accentText] */
  swatches: [string, string, string]
}

/**
 * Tokens neutros compartidos por todas las paletas.
 * No dependen del color de acento elegido.
 */
export const NEUTRAL_TOKENS = {
  sidebarBg:   '#FFFFFF',
  sidebarBdr:  '#E5E7EB', // gray-200
  sidebarText: '#6B7280', // gray-500
  sidebarHover:'#F9FAFB', // gray-50
  pageBg:      '#F8FAFC',
  textPrimary: '#111827', // gray-900
  textMuted:   '#9CA3AF', // gray-400
} as const

/**
 * Las 6 paletas disponibles.
 *
 * Paleta actualmente en uso: 'indigo'
 */
export const THEMES: Record<ThemeId, ThemeTokens> = {

  // ── 1. Indigo — SaaS moderno ────────────────────────────────────────────────
  indigo: {
    id:          'indigo',
    name:        'Índigo',
    description: 'SaaS moderno y profesional. Ideal para marcas tecnológicas o neutras.',
    accent:      '#6366F1', // indigo-500
    accentLight: '#EEF2FF', // indigo-50
    accentText:  '#4338CA', // indigo-700
    accentRing:  '#E0E7FF', // indigo-100
    swatches:    ['#6366F1', '#EEF2FF', '#4338CA'],
  },

  // ── 2. Esmeralda — Fresco y natural ────────────────────────────────────────
  emerald: {
    id:          'emerald',
    name:        'Esmeralda',
    description: 'Fresco y natural. Perfecto para locales saludables, veganos o de cocina verde.',
    accent:      '#10B981', // emerald-500
    accentLight: '#ECFDF5', // emerald-50
    accentText:  '#047857', // emerald-700
    accentRing:  '#D1FAE5', // emerald-100
    swatches:    ['#10B981', '#ECFDF5', '#047857'],
  },

  // ── 3. Rosa — Cálido y apetitoso ───────────────────────────────────────────
  rose: {
    id:          'rose',
    name:        'Rosa',
    description: 'Cálido y apetitoso. Ideal para pastelerías, cafés o cocina artesanal.',
    accent:      '#F43F5E', // rose-500
    accentLight: '#FFF1F2', // rose-50
    accentText:  '#BE123C', // rose-700
    accentRing:  '#FFE4E6', // rose-100
    swatches:    ['#F43F5E', '#FFF1F2', '#BE123C'],
  },

  // ── 4. Ámbar — Energético y vibrante ───────────────────────────────────────
  amber: {
    id:          'amber',
    name:        'Ámbar',
    description: 'Energético y vibrante. Clásico para pizzerías, hamburgueserías y comida rápida.',
    accent:      '#F59E0B', // amber-500
    accentLight: '#FFFBEB', // amber-50
    accentText:  '#B45309', // amber-700
    accentRing:  '#FEF3C7', // amber-100
    swatches:    ['#F59E0B', '#FFFBEB', '#B45309'],
  },

  // ── 5. Violeta — Premium y elegante ────────────────────────────────────────
  violet: {
    id:          'violet',
    name:        'Violeta',
    description: 'Premium y elegante. Para restaurantes de alta cocina, barras de cócteles o marcas de lujo.',
    accent:      '#8B5CF6', // violet-500
    accentLight: '#F5F3FF', // violet-50
    accentText:  '#6D28D9', // violet-700
    accentRing:  '#EDE9FE', // violet-100
    swatches:    ['#8B5CF6', '#F5F3FF', '#6D28D9'],
  },

  // ── 6. Cielo — Limpio y confiable ──────────────────────────────────────────
  sky: {
    id:          'sky',
    name:        'Cielo',
    description: 'Limpio y confiable. Versátil para cualquier tipo de local que busque transmitir frescura y orden.',
    accent:      '#0EA5E9', // sky-500
    accentLight: '#F0F9FF', // sky-50
    accentText:  '#0369A1', // sky-700
    accentRing:  '#E0F2FE', // sky-100
    swatches:    ['#0EA5E9', '#F0F9FF', '#0369A1'],
  },
}

/** Lista ordenada para renderizar el selector de paletas en UI */
export const THEME_LIST: ThemeTokens[] = Object.values(THEMES)

/** Paleta por defecto del sistema */
export const DEFAULT_THEME_ID: ThemeId = 'indigo'

/**
 * Resuelve la paleta dado un `theme_id` de la base de datos.
 * Si el valor no existe o es nulo, retorna la paleta por defecto.
 *
 * @example
 *   const theme = getTheme(restaurante.theme_id)
 *   // → usa theme.accent, theme.accentLight, etc.
 */
export function getTheme(themeId?: string | null): ThemeTokens {
  if (themeId && themeId in THEMES) {
    return THEMES[themeId as ThemeId]
  }
  return THEMES[DEFAULT_THEME_ID]
}
