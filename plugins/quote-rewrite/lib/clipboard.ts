import { Platform } from 'react-native'
import {
	parseDataUrl,
	removeFromCache,
	saveToGallery,
	writeToCache,
} from './files'
import { getRevenge, showToast } from './revenge'

function getClipboard(): any {
	const rev = getRevenge()
	return (
		rev?.externals?.ReactNativeClipboard?.Clipboard ??
		rev?.externals?.ReactNativeClipboard ??
		null
	)
}

export function copyText(text: string, successMessage?: string): boolean {
	const clipboard = getClipboard()
	if (!clipboard || typeof clipboard.setString !== 'function') {
		showToast('Clipboard unavailable.')
		return false
	}
	try {
		clipboard.setString(String(text ?? ''))
		showToast(successMessage ?? 'Copied to clipboard.')
		return true
	} catch (error) {
		console.warn('[Quote] Clipboard write failed:', error)
		showToast('Failed to copy.')
		return false
	}
}

/**
 * Puts the rendered card on the system clipboard.
 *
 * `RNCClipboard` guards `setImage` with an iOS check and its Android native
 * module rejects the call outright, so on Android the best that can be put on
 * the clipboard is the `file://` URI of the card — the message says so rather
 * than claiming an image was copied.
 */
export async function copyImage(
	dataUrl: string,
	filename: string,
): Promise<void> {
	const parts = parseDataUrl(dataUrl)
	if (!parts) {
		showToast('Nothing to copy yet.')
		return
	}
	const clipboard = getClipboard()
	if (!clipboard) {
		showToast('Clipboard unavailable.')
		return
	}

	if (Platform.OS !== 'android' && typeof clipboard.setImage === 'function') {
		try {
			clipboard.setImage(parts.body)
			showToast('Quote image copied to clipboard.')
			return
		} catch (error) {
			console.warn('[Quote] Clipboard image write failed:', error)
		}
	}

	try {
		const file = await writeToCache(dataUrl, filename)
		if (typeof clipboard.setString === 'function') {
			clipboard.setString(file.uri)
		}
		showToast(
			'Image clipboard is not supported on Android — copied the image file path instead.',
		)
	} catch (error) {
		console.warn('[Quote] Clipboard write failed:', error)
		showToast('Failed to copy image.')
	}
}

export async function saveImageToGallery(
	dataUrl: string,
	filename: string,
): Promise<void> {
	const parts = parseDataUrl(dataUrl)
	if (!parts) {
		showToast('Nothing to save yet.')
		return
	}

	let path = ''
	try {
		const file = await writeToCache(dataUrl, filename)
		path = file.path
		const saved = await saveToGallery(file.path, filename, parts.mime)
		if (saved) {
			showToast('Saved to gallery.')
			return
		}
		showToast(
			parts.mime.includes('gif')
				? 'GIFs cannot be saved to the gallery — send it instead.'
				: 'Saving to the gallery is not supported here.',
		)
	} catch (error) {
		console.warn('[Quote] Gallery save failed:', error)
		showToast('Failed to save image.')
	} finally {
		if (path) setTimeout(() => removeFromCache(path), 3_000)
	}
}
