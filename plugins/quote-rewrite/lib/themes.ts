export interface ThemeColors {
	/** Card background. */
	bg: string
	/** Primary quote text. */
	text: string
	/** Author line and secondary text. */
	muted: string
	/** Handle, watermark and accent text. */
	accent: string
}

export interface QuoteTheme {
	id: string
	label: string
	dark: ThemeColors
	light: ThemeColors
}

/**
 * Each theme ships a dark and a light palette. The `light` toggle is not a
 * separate design — it selects the light variant of whichever hue is active,
 * so every theme stays consistent with itself.
 */
export const THEMES: QuoteTheme[] = [
	{
		id: 'midnight',
		label: 'Midnight',
		dark: {
			bg: '#000000',
			text: '#ffffff',
			muted: '#9a9a9a',
			accent: '#8a8a8a',
		},
		light: {
			bg: '#f5f5f7',
			text: '#0d0d0f',
			muted: '#5c5c66',
			accent: '#6b6b75',
		},
	},
	{
		id: 'crimson',
		label: 'Crimson',
		dark: {
			bg: '#170004',
			text: '#ffe9ec',
			muted: '#c08089',
			accent: '#ff5c72',
		},
		light: {
			bg: '#fff1f2',
			text: '#3d0008',
			muted: '#8a4b55',
			accent: '#d61f36',
		},
	},
	{
		id: 'ocean',
		label: 'Ocean',
		dark: {
			bg: '#00121f',
			text: '#e6f6ff',
			muted: '#7fa8bd',
			accent: '#4fd1ff',
		},
		light: {
			bg: '#eef8ff',
			text: '#00202f',
			muted: '#4a7288',
			accent: '#0b8fc4',
		},
	},
	{
		id: 'forest',
		label: 'Forest',
		dark: {
			bg: '#02140a',
			text: '#e9fff2',
			muted: '#7fb694',
			accent: '#4ade80',
		},
		light: {
			bg: '#f0fbf3',
			text: '#032012',
			muted: '#4e7a62',
			accent: '#16a34a',
		},
	},
	{
		id: 'sunset',
		label: 'Sunset',
		dark: {
			bg: '#180b00',
			text: '#fff4e6',
			muted: '#c7a582',
			accent: '#ff9f43',
		},
		light: {
			bg: '#fff8ef',
			text: '#2b1500',
			muted: '#8a6f4d',
			accent: '#ea6a12',
		},
	},
	{
		id: 'amethyst',
		label: 'Amethyst',
		dark: {
			bg: '#100520',
			text: '#f4ecff',
			muted: '#a596c4',
			accent: '#c084fc',
		},
		light: {
			bg: '#f8f3ff',
			text: '#1a0a33',
			muted: '#6f6191',
			accent: '#8b3ff0',
		},
	},
	{
		id: 'graphite',
		label: 'Graphite',
		dark: {
			bg: '#111318',
			text: '#e6e8ee',
			muted: '#8b90a0',
			accent: '#aab0c0',
		},
		light: {
			bg: '#eceef2',
			text: '#14161c',
			muted: '#5f6472',
			accent: '#4a4f5c',
		},
	},
]

export function getTheme(id?: string): QuoteTheme {
	return THEMES.find(theme => theme.id === id) ?? THEMES[0]!
}

export function resolveColors(themeId: string, light: boolean): ThemeColors {
	const theme = getTheme(themeId)
	return light ? theme.light : theme.dark
}

/**
 * Canvas font stacks. System families are named explicitly so the WebView
 * picks the platform face rather than silently falling back to its default.
 */
export interface FontOption {
	id: string
	label: string
	stack: string
}

export const FONTS: FontOption[] = [
	{
		id: 'rounded',
		label: 'M PLUS Rounded 1c',
		stack: "'QuoteRounded', 'Noto Color Emoji', sans-serif",
	},
	{
		id: 'system',
		label: 'System Sans',
		stack: "system-ui, 'Noto Color Emoji', sans-serif",
	},
	{
		id: 'serif',
		label: 'Serif',
		stack: "Georgia, 'Noto Serif', 'Noto Color Emoji', serif",
	},
	{
		id: 'mono',
		label: 'Monospace',
		stack:
			"'DejaVu Sans Mono', 'Noto Sans Mono', 'Noto Color Emoji', monospace",
	},
]

export function getFontStack(id?: string): FontOption {
	return FONTS.find(font => font.id === id) ?? FONTS[0]!
}

/** Hex colour → `rgba(...)` string, used to fade the scrim out to `bg`. */
export function hexToRgba(hex: string, alpha: number): string {
	const raw = hex.replace('#', '').trim()
	const full =
		raw.length === 3
			? raw
					.split('')
					.map(ch => ch + ch)
					.join('')
			: raw
	const num = Number.parseInt(full, 16)
	if (Number.isNaN(num)) return `rgba(0, 0, 0, ${alpha})`
	const r = (num >> 16) & 0xff
	const g = (num >> 8) & 0xff
	const b = num & 0xff
	return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
