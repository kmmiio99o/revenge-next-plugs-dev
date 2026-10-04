import React from 'react'
import { ScrollView, Text, View } from 'react-native'
import { showToast } from '../lib/revenge'
import {
	defaultSettings,
	getStoredSettings,
	updateStoredSettings,
} from '../lib/settings'
import { FONTS, THEMES } from '../lib/themes'
import {
	Button,
	Page,
	TableRadioGroup,
	TableRadioRow,
	TableRowGroup,
	TableSwitchRow,
	TextInput,
} from './components'
import type { PluginApi } from '@revenge-mod/plugins/types'
import type { StoredSettings } from '../lib/types'

function readSettings(api?: PluginApi<{ jsonStorage: StoredSettings }>) {
	const instance = api?.jsonStorage
	if (instance) {
		const cached = instance.cache ?? {}
		return {
			...defaultSettings,
			...cached,
			defaultSettings: {
				...defaultSettings.defaultSettings,
				...(cached.defaultSettings ?? {}),
			},
			zipline: {
				...defaultSettings.zipline,
				...(cached.zipline ?? {}),
			},
		} satisfies StoredSettings
	}
	return getStoredSettings()
}

export default function Settings({
	api,
}: {
	api?: PluginApi<{ jsonStorage: StoredSettings }>
}) {
	const [settings, setSettings] = React.useState<StoredSettings>(() =>
		readSettings(api),
	)
	const [host, setHost] = React.useState(settings.zipline.host)
	const [token, setToken] = React.useState(settings.zipline.token)

	const write = React.useCallback((patch: Partial<StoredSettings>) => {
		updateStoredSettings(patch)
		setSettings(previous => ({
			...previous,
			...patch,
			defaultSettings: {
				...previous.defaultSettings,
				...(patch.defaultSettings ?? {}),
			},
			zipline: {
				...previous.zipline,
				...(patch.zipline ?? {}),
			},
		}))
	}, [])

	const style = settings.defaultSettings
	const patchStyle = (partial: Partial<StoredSettings['defaultSettings']>) =>
		write({ defaultSettings: { ...style, ...partial } })

	const saveZipline = React.useCallback(() => {
		write({
			zipline: { ...settings.zipline, host: host.trim(), token: token.trim() },
		})
		showToast('Zipline settings saved.')
	}, [host, token, settings.zipline, write])

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
				<TableRowGroup
					title="Behavior"
					description="How the quote sheet behaves when it opens"
				>
					<TableSwitchRow
						label="Instant Quote"
						subLabel="Render and send as soon as the sheet opens"
						value={settings.instantQuote}
						onValueChange={(value: boolean) => write({ instantQuote: value })}
					/>
				</TableRowGroup>

				<TableRowGroup
					title="Default Quote Style"
					description="Applied to every new quote card"
				>
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

				<TableRowGroup
					title="Default Theme"
					description="Palette used for the card"
				>
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

				<TableRowGroup
					title="Default Font"
					description="Typeface used for the card"
				>
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
					title="Zipline"
					description="Upload cards to your own Zipline host and paste the link"
				>
					<TableSwitchRow
						label="Use Zipline"
						subLabel="Share quotes as links instead of attachments"
						value={settings.zipline.enabled}
						onValueChange={(value: boolean) =>
							write({ zipline: { ...settings.zipline, enabled: value } })
						}
					/>
					<TextInput
						label="Host"
						value={host}
						placeholder="i.allyapp.cc"
						autoCapitalize="none"
						autoCorrect={false}
						onChange={setHost}
						onChangeText={setHost}
					/>
					<TextInput
						label="API Token"
						value={token}
						placeholder="Zipline API token"
						secureTextEntry
						autoCapitalize="none"
						autoCorrect={false}
						onChange={setToken}
						onChangeText={setToken}
					/>
					<View style={{ marginTop: 4 }}>
						<Button
							text="Save Zipline Settings"
							variant="secondary"
							size="md"
							onPress={saveZipline}
						/>
					</View>
				</TableRowGroup>

				<TableRowGroup
					title="Reset"
					description="Restore every customization except your Zipline credentials"
				>
					<View style={{ marginTop: 4 }}>
						<Button
							text="Restore Defaults"
							variant="secondary"
							size="md"
							onPress={() => {
								write({
									instantQuote: defaultSettings.instantQuote,
									defaultSettings: { ...defaultSettings.defaultSettings },
								})
								showToast('Quote defaults restored.')
							}}
						/>
					</View>
					<Text
						style={{
							fontSize: 12,
							opacity: 0.6,
							paddingHorizontal: 4,
							paddingTop: 8,
						}}
					>
						Rendered fully on-device in a hidden WebView. No quote API, no
						analytics, no upload unless Zipline is enabled.
					</Text>
				</TableRowGroup>
			</ScrollView>
		</Page>
	)
}
