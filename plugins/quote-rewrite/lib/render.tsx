import React from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { buildRendererHtml } from './renderer'
import { find, findByProps, getRevenge } from './revenge'
import type { QuotePayload } from './layout'

export interface QuoteRenderResult {
	dataUrl: string
	mime: string
}

let cachedWebView: any

/**
 * Resolves Discord's bundled `react-native-webview` export.
 *
 * The component lives in a runtime module that exports `WebView` both as a
 * named and a default export, so the first pass looks for a module that
 * exposes `WebView` and nothing else — the shape cloud-sync already relies on.
 */
export function resolveWebView(): any {
	if (cachedWebView !== undefined) return cachedWebView

	cachedWebView = null
	try {
		cachedWebView =
			find<any>(m => Boolean(m?.WebView) && !m.default)?.WebView ?? null
	} catch {}

	if (!cachedWebView) {
		try {
			cachedWebView = findByProps<any>('WebView')?.WebView ?? null
		} catch {}
	}

	if (!cachedWebView) {
		try {
			const rev = getRevenge()
			const generated = rev?.utils?.discord?.withGeneratedIconComponent
			void generated
			cachedWebView = rev?.react?.ReactNative?.WebView ?? null
		} catch {}
	}

	return cachedWebView
}

interface QuotePreviewProps {
	payload: QuotePayload
	onResult: (result: QuoteRenderResult | null) => void
	onError?: (message: string) => void
	/** Width the preview image should occupy. */
	width: number
}

/**
 * Visible preview plus the off-screen WebView that actually rasterises the
 * card. Remounting is driven by the caller rebuilding `payload`, which keeps
 * one render in flight per settings change.
 */
export function QuotePreview({
	payload,
	onResult,
	onError,
	width,
}: QuotePreviewProps) {
	const WebView = React.useMemo(() => resolveWebView(), [])
	const html = React.useMemo(() => buildRendererHtml(payload), [payload])
	const [failed, setFailed] = React.useState(false)
	const [image, setImage] = React.useState<string | null>(null)

	React.useEffect(() => {
		setFailed(false)
		setImage(null)
		onResult(null)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [payload.renderId])

	const handleScroll = React.useCallback(
		(event: any) => {
			const raw = event?.nativeEvent?.data
			if (typeof raw !== 'string') return

			let parsed: any
			try {
				parsed = JSON.parse(raw)
			} catch {
				return
			}
			if (parsed?.renderId !== payload.renderId) return

			if (parsed.type === 'result' && typeof parsed.dataUrl === 'string') {
				setFailed(false)
				setImage(parsed.dataUrl)
				onResult({
					dataUrl: parsed.dataUrl,
					mime: parsed.mime || 'image/png',
				})
				return
			}

			if (parsed.type === 'error') {
				const message = String(parsed.message || 'Render failed')
				setFailed(true)
				setImage(null)
				onError?.(message)
				onResult(null)
			}
		},
		[payload.renderId, onResult, onError],
	)

	const height = Math.round((width * 630) / 1200)

	return (
		<View>
			<View style={[styles.frame, { width, height }]}>
				{image ? (
					<Image
						source={{ uri: image }}
						resizeMode="cover"
						style={{ width: '100%', height: '100%' }}
					/>
				) : (
					<Text style={styles.message}>
						{failed ? 'Render failed.' : 'Rendering…'}
					</Text>
				)}
			</View>
			{WebView ? (
				<WebView
					key={`quote-renderer-${payload.renderId}`}
					source={{ html, baseUrl: 'https://localhost' }}
					javaScriptEnabled
					domStorageEnabled
					onMessage={handleScroll}
					style={styles.hidden}
				/>
			) : null}
		</View>
	)
}

const styles = StyleSheet.create({
	frame: {
		alignSelf: 'center',
		borderRadius: 10,
		overflow: 'hidden',
		backgroundColor: '#101014',
		alignItems: 'center',
		justifyContent: 'center',
	},
	message: {
		color: '#9aa0ae',
		fontSize: 13,
		textAlign: 'center',
		paddingHorizontal: 12,
	},
	hidden: {
		position: 'absolute',
		width: 1,
		height: 1,
		opacity: 0,
		left: -9999,
		top: -9999,
	},
})
