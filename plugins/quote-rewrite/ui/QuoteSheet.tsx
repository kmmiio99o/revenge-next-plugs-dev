import React from 'react'
import { Dimensions, ScrollView, Text, View } from 'react-native'
import { copyImage, copyText, saveImageToGallery } from '../lib/clipboard'
import { buildFileName, buildPayload } from '../lib/layout'
import { getSelectedChannelIdSafe } from '../lib/messages'
import { QuotePreview } from '../lib/render'
import { showToast } from '../lib/revenge'
import { sendQuoteAttachment, sendTextMessage } from '../lib/send'
import { getStoredSettings } from '../lib/settings'
import { FONTS, THEMES } from '../lib/themes'
import {
	resolveZiplineCredentials,
	uploadDataUrlToZipline,
} from '../lib/zipline'
import {
	ActionSheet,
	ActionSheetCloseButton,
	BottomSheetTitleHeader,
	Button,
	hideActionSheet,
	TableRadioGroup,
	TableRadioRow,
	TableRowGroup,
	TableSwitchRow,
	TextInput,
} from './components'
import type { QuoteRequest } from '../lib/layout'
import type { QuoteSource } from '../lib/messages'
import type { QuoteRenderResult } from '../lib/render'
import type { QuoteStyle } from '../lib/types'

export const ACTION_SHEET_KEY = 'MakeItAQuoteSheet'

interface QuoteSheetProps {
	source: QuoteSource
	/** Renders and sends immediately, then closes — the `instantQuote` path. */
	autoSend?: boolean
	/** Replaces the card body, used by `/quote custom_text`. */
	initialText?: string
}

function makeRenderId(): string {
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function QuoteSheet({
	source,
	autoSend,
	initialText,
}: QuoteSheetProps) {
	const defaults = React.useMemo(() => getStoredSettings().defaultSettings, [])

	const [style, setStyle] = React.useState<QuoteStyle>({ ...defaults })
	const [customMode, setCustomMode] = React.useState(Boolean(initialText))
	const [text, setText] = React.useState(initialText ?? source.text)
	const [displayName, setDisplayName] = React.useState(source.displayName)
	const [username, setUsername] = React.useState(source.username)
	const [avatarUrl, setAvatarUrl] = React.useState(source.avatarUrl)

	const request = React.useMemo<QuoteRequest>(
		() => ({ text, username, displayName, avatarUrl, style }),
		[text, username, displayName, avatarUrl, style],
	)

	// One state object holds the request together with the render id it was
	// built for, so the WebView never renders a payload it will immediately
	// discard. Settings changes settle for 250 ms first — every keystroke in
	// the custom-quote fields would otherwise restart a full rasterisation.
	const [active, setActive] = React.useState(() => ({
		request,
		renderId: makeRenderId(),
	}))
	const mounted = React.useRef(false)

	React.useEffect(() => {
		if (!mounted.current) {
			mounted.current = true
			return
		}
		const timeout = setTimeout(
			() => setActive({ request, renderId: makeRenderId() }),
			250,
		)
		return () => clearTimeout(timeout)
	}, [request])

	const payload = React.useMemo(
		() => buildPayload(active.request, active.renderId),
		[active],
	)

	const [result, setResult] = React.useState<QuoteRenderResult | null>(null)
	const [error, setError] = React.useState<string | null>(null)
	const [busy, setBusy] = React.useState(false)
	const busyRef = React.useRef(false)
	const sentRef = React.useRef<string | null>(null)

	const handleResult = React.useCallback((value: QuoteRenderResult | null) => {
		setResult(value)
		if (value) setError(null)
	}, [])

	const handleError = React.useCallback((message: string) => {
		setError(message)
	}, [])

	const patchStyle = React.useCallback((partial: Partial<QuoteStyle>) => {
		setStyle(previous => ({ ...previous, ...partial }))
	}, [])

	const filename = result ? buildFileName(active.request, result.mime) : ''

	const send = React.useCallback(
		async (value: QuoteRenderResult) => {
			if (busyRef.current) return
			const target = source.channelId || getSelectedChannelIdSafe()
			if (!target) {
				showToast('No channel to send the quote to.')
				return
			}

			busyRef.current = true
			setBusy(true)
			const name = buildFileName(active.request, value.mime)
			try {
				const credentials = resolveZiplineCredentials()
				if (credentials) {
					const url = await uploadDataUrlToZipline(value.dataUrl, name)
					if (url && sendTextMessage(target, url)) {
						showToast('Quote sent to channel!')
						hideActionSheet(ACTION_SHEET_KEY)
						return
					}
					showToast('Zipline upload failed — attaching the image instead.')
				}

				await sendQuoteAttachment(target, value.dataUrl, name)
				showToast('Quote sent to channel!')
				hideActionSheet(ACTION_SHEET_KEY)
			} catch (cause) {
				console.warn('[Quote] Failed to send quote:', cause)
				showToast(`Failed to send quote: ${(cause as any)?.message ?? cause}`)
			} finally {
				busyRef.current = false
				setBusy(false)
			}
		},
		[active.request, source.channelId],
	)

	React.useEffect(() => {
		if (!autoSend || !result || busyRef.current) return
		if (sentRef.current === active.renderId) return
		sentRef.current = active.renderId
		void send(result)
	}, [autoSend, result, active.renderId, send])

	const handleCopyImage = React.useCallback(() => {
		if (!result) return
		void copyImage(result.dataUrl, filename)
	}, [result, filename])

	const handleSave = React.useCallback(() => {
		if (!result) return
		void saveImageToGallery(result.dataUrl, filename)
	}, [result, filename])

	const handleCopyLink = React.useCallback(async () => {
		if (!result) return
		if (busyRef.current) return
		const credentials = resolveZiplineCredentials()
		if (!credentials) {
			showToast('Enable Zipline in the plugin settings first.')
			return
		}
		busyRef.current = true
		setBusy(true)
		try {
			const url = await uploadDataUrlToZipline(result.dataUrl, filename)
			if (url) copyText(url, 'Zipline link copied to clipboard.')
			else showToast('Zipline upload failed.')
		} finally {
			busyRef.current = false
			setBusy(false)
		}
	}, [result, filename])

	const hasZipline = React.useMemo(
		() => Boolean(resolveZiplineCredentials()),
		[],
	)
	const previewWidth = Math.max(
		230,
		Math.min((Dimensions.get('window')?.width ?? 360) - 88, 420),
	)

	const subtitle = source.replyAuthor
		? `Replying to @${source.replyAuthor}`
		: autoSend
			? 'Rendering on-device…'
			: 'Rendered on-device'

	return (
		<ActionSheet>
			<BottomSheetTitleHeader
				title="Make it a Quote"
				subtitle={subtitle}
				trailing={
					<ActionSheetCloseButton
						onPress={() => hideActionSheet(ACTION_SHEET_KEY)}
					/>
				}
			/>
			<ScrollView
				style={{ paddingHorizontal: 16 }}
				contentContainerStyle={{ paddingBottom: 32 }}
			>
				<View style={{ marginVertical: 8 }}>
					<QuotePreview
						payload={payload}
						onResult={handleResult}
						onError={handleError}
						width={previewWidth}
					/>
				</View>

				{error ? (
					<Text
						style={{
							color: '#f66',
							fontSize: 13,
							textAlign: 'center',
							marginBottom: 8,
						}}
					>
						{error}
					</Text>
				) : null}

				<TableRowGroup title="Quote Style">
					<TableSwitchRow
						label="Colored Avatar / Profile"
						subLabel="Render the avatar in full color instead of black & white"
						value={style.color}
						onValueChange={(value: boolean) => patchStyle({ color: value })}
					/>
					<TableSwitchRow
						label="Bold Text"
						subLabel="Render the whole quote body in bold"
						value={style.bold}
						onValueChange={(value: boolean) => patchStyle({ bold: value })}
					/>
					<TableSwitchRow
						label="Light Background"
						subLabel="Use the light variant of the active theme"
						value={style.light}
						onValueChange={(value: boolean) => patchStyle({ light: value })}
					/>
					<TableSwitchRow
						label="Flip Layout"
						subLabel="Swap the avatar and text positions"
						value={style.flip}
						onValueChange={(value: boolean) => patchStyle({ flip: value })}
					/>
					<TableSwitchRow
						label="Modern Layout"
						subLabel="Centered circular avatar above the quote"
						value={style.new}
						onValueChange={(value: boolean) => patchStyle({ new: value })}
					/>
					<TableSwitchRow
						label="Single-frame GIF"
						subLabel="Encode the card as a GIF instead of a PNG"
						value={style.gif}
						onValueChange={(value: boolean) => patchStyle({ gif: value })}
					/>
					<TableSwitchRow
						label="Watermark"
						subLabel="Show watermark text in the bottom right"
						value={style.watermark}
						onValueChange={(value: boolean) => patchStyle({ watermark: value })}
					/>
					{style.watermark ? (
						<TextInput
							label="Watermark Text"
							value={style.watermarkText}
							placeholder="Make It A Quote"
							onChange={(value: string) => patchStyle({ watermarkText: value })}
							onChangeText={(value: string) =>
								patchStyle({ watermarkText: value })
							}
						/>
					) : null}
				</TableRowGroup>

				<TableRowGroup title="Theme" description="Palette used for the card">
					<TableRadioGroup
						value={style.theme}
						onChange={(value: string) => patchStyle({ theme: value })}
					>
						{THEMES.map(theme => (
							<TableRadioRow
								key={theme.id}
								label={theme.label}
								value={theme.id}
							/>
						))}
					</TableRadioGroup>
				</TableRowGroup>

				<TableRowGroup title="Font" description="Typeface used for the card">
					<TableRadioGroup
						value={style.font}
						onChange={(value: string) => patchStyle({ font: value })}
					>
						{FONTS.map(font => (
							<TableRadioRow key={font.id} label={font.label} value={font.id} />
						))}
					</TableRadioGroup>
				</TableRowGroup>

				<TableRowGroup
					title="Customize Content"
					description="Edit what the card says without touching the message"
				>
					<TableSwitchRow
						label="Custom Quote Mode"
						subLabel="Edit text, author name, or avatar"
						value={customMode}
						onValueChange={setCustomMode}
					/>
					{customMode ? (
						<>
							<TextInput
								label="Quote Text"
								value={text}
								multiline
								onChange={setText}
								onChangeText={setText}
							/>
							<TextInput
								label="Display Name"
								value={displayName}
								onChange={setDisplayName}
								onChangeText={setDisplayName}
							/>
							<TextInput
								label="Username / Handle"
								value={username}
								onChange={setUsername}
								onChangeText={setUsername}
							/>
							<TextInput
								label="Avatar URL"
								value={avatarUrl}
								onChange={setAvatarUrl}
								onChangeText={setAvatarUrl}
							/>
						</>
					) : null}
				</TableRowGroup>

				<View style={{ gap: 10, marginTop: 18 }}>
					<Button
						text="Send to Channel"
						variant="primary"
						size="md"
						loading={busy}
						disabled={!result || busy}
						onPress={() => result && void send(result)}
					/>
					<Button
						text="Copy Image"
						variant="secondary"
						size="md"
						disabled={!result || busy}
						onPress={handleCopyImage}
					/>
					<Button
						text={hasZipline ? 'Copy Zipline Link' : 'Copy Link (no Zipline)'}
						variant="secondary"
						size="md"
						disabled={!result || busy}
						onPress={() => void handleCopyLink()}
					/>
					<Button
						text="Save Image"
						variant="secondary"
						size="md"
						disabled={!result || busy}
						onPress={handleSave}
					/>
				</View>
			</ScrollView>
		</ActionSheet>
	)
}
