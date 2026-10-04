import { forceBold, runsFromMessage, safeFilename } from './format'
import { getFontStack, resolveColors } from './themes'
import type { InlineRun } from './format'
import type { ThemeColors } from './themes'
import type { QuoteStyle } from './types'

/**
 * Geometry for both card layouts. 1200×630 matches the reference cards, so a
 * quote rendered here lands on Discord's embed ratio with no crop.
 */
export const CANVAS = { width: 1200, height: 630 } as const

const CLASSIC_LAYOUT = {
	width: CANVAS.width,
	height: CANVAS.height,
	/** Left edge of the text column. */
	textX: 660,
	textWidth: 480,
	maxContentHeight: 496,
	/** Width of the scrim that fades the avatar into the card. */
	gradientWidth: 430,
	/** The avatar is a square flush against the card edge. */
	avatarSize: CANVAS.height,
	avatarRadius: 0,
	avatarCenterX: 0,
	avatarCenterY: 0,
}

const MODERN_LAYOUT = {
	width: CANVAS.width,
	height: CANVAS.height,
	textX: 150,
	textWidth: 900,
	maxContentHeight: 300,
	gradientWidth: 0,
	avatarSize: 0,
	avatarRadius: 92,
	avatarCenterX: CANVAS.width / 2,
	avatarCenterY: 158,
}

/**
 * The two layouts share one shape, so a plain numeric record keeps the
 * classic card (whose avatar height is literally the canvas height) and the
 * modern card (whose avatar is drawn as a circle) interchangeable.
 */
export interface LayoutConfig {
	width: number
	height: number
	textX: number
	textWidth: number
	maxContentHeight: number
	gradientWidth: number
	avatarSize: number
	avatarRadius: number
	avatarCenterX: number
	avatarCenterY: number
}

const FONT_SIZES = {
	initial: 44,
	minimum: 18,
	decrement: 2,
	lineHeightMultiplier: 1.28,
	authorMultiplier: 0.55,
	usernameMultiplier: 0.42,
	authorMinimum: 22,
	usernameMinimum: 17,
	watermark: 18,
}

const SPACING = {
	authorTop: 54,
	username: 10,
	watermarkPadding: 22,
	/** Extra vertical gap between the avatar block and the text block. */
	modernGap: 46,
}

export interface QuoteRequest {
	text: string
	username: string
	displayName: string
	avatarUrl: string
	style: QuoteStyle
}

export interface QuotePayload {
	renderId: string
	runs: InlineRun[]
	displayName: string
	username: string
	avatarUrl: string
	colors: ThemeColors
	grayscale: boolean
	flip: boolean
	modern: boolean
	gif: boolean
	watermark: string
	fontFamily: string
	layout: LayoutConfig
	fonts: typeof FONT_SIZES
	spacing: typeof SPACING
}

/** Forces Discord CDN assets to a raster format the canvas can decode. */
export function normalizeAvatarUrl(raw: unknown): string {
	const url = String(raw ?? '')
	if (!url) return ''
	try {
		const parsed = new URL(url)
		parsed.searchParams.set('size', '512')
		if (
			parsed.hostname === 'cdn.discordapp.com' ||
			parsed.hostname === 'media.discordapp.net'
		) {
			parsed.pathname = parsed.pathname.replace(
				/\.(webp|gif|jpg|jpeg|png)$/i,
				'.png',
			)
			parsed.searchParams.set('format', 'png')
		}
		return parsed.toString()
	} catch {
		return url
	}
}

export function buildPayload(
	request: QuoteRequest,
	renderId: string,
): QuotePayload {
	const style = request.style
	let runs = runsFromMessage(request.text)
	if (runs.length === 0) runs = [{ text: ' ' }]
	if (style.bold) runs = forceBold(runs)

	const displayName = String(request.displayName || 'Unknown').slice(0, 64)
	const handle = String(request.username || 'unknown')
		.replace(/[^\w.\- ]/g, '')
		.trim()
		.slice(0, 32)

	return {
		renderId,
		runs,
		displayName,
		username: handle ? `@${handle}` : '@unknown',
		avatarUrl: normalizeAvatarUrl(request.avatarUrl),
		colors: resolveColors(style.theme, style.light),
		grayscale: !style.color,
		flip: Boolean(style.flip),
		modern: Boolean(style.new),
		gif: Boolean(style.gif),
		watermark: style.watermark
			? String(style.watermarkText || 'Make It A Quote').slice(0, 32)
			: '',
		fontFamily: getFontStack(style.font).stack,
		layout: style.new ? MODERN_LAYOUT : CLASSIC_LAYOUT,
		fonts: FONT_SIZES,
		spacing: SPACING,
	}
}

export function buildFileName(request: QuoteRequest, mime: string): string {
	const preview = String(request.text || '')
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 6)
		.join(' ')
	const author = String(request.username || 'quote').replace(/[^\w.-]/g, '')
	const extension = mime.includes('gif') ? 'gif' : 'png'
	return `${safeFilename(preview)}-${safeFilename(author, 32)}.${extension}`
}
