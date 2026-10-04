import { registerQuoteSlashCommand } from './commands/quote'
import { setJsonStorageInstance } from './lib/settings'
import { patchMessageActionSheet } from './patches/actionSheet'
import Settings from './ui/Settings'
import type { StoredSettings } from './lib/types'

export default plugin<{ jsonStorage: StoredSettings }>({
	jsonStorage: {
		load: true,
		default: {
			instantQuote: true,
			zipline: { enabled: false, host: 'i.allyapp.cc', token: '' },
			defaultSettings: {
				light: false,
				color: false,
				bold: false,
				flip: false,
				new: false,
				gif: false,
				watermark: false,
				watermarkText: 'Make It A Quote',
				theme: 'midnight',
				font: 'rounded',
			},
		},
	},

	start(api) {
		api.logger?.info?.('[Quote] Starting Make It A Quote…')

		if (api.jsonStorage) setJsonStorageInstance(api.jsonStorage)

		api.cleanup(patchMessageActionSheet())
		api.cleanup(registerQuoteSlashCommand())

		api.logger?.info?.('[Quote] Started cleanly.')
	},

	stop() {},

	SettingsComponent: Settings,
})
