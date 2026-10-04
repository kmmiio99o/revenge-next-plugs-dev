export interface QuoteStyle {
	/** Renders the light variant of the active theme. */
	light: boolean
	/** Full-colour avatar instead of the desaturated one. */
	color: boolean
	/** Forces the whole quote body bold regardless of inline markup. */
	bold: boolean
	/** Swaps the avatar and text column sides. */
	flip: boolean
	/** Uses the modern (centred, circular avatar) card. */
	new: boolean
	/** Emits a single-frame GIF instead of a PNG. */
	gif: boolean
	watermark: boolean
	watermarkText: string
	theme: string
	font: string
}

export interface ZiplineConfig {
	enabled: boolean
	host: string
	token: string
}

export interface StoredSettings {
	/** Opens the sheet in auto-render + auto-send mode. */
	instantQuote: boolean
	zipline: ZiplineConfig
	defaultSettings: QuoteStyle
}
