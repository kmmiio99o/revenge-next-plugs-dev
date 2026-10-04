import React from 'react'
import {
	extractQuoteSource,
	findMessage,
	isQuotableMessage,
} from '../lib/messages'
import { findByProps, getRevenge } from '../lib/revenge'
import { getStoredSettings } from '../lib/settings'
import { openLazyActionSheet } from '../ui/components'
import QuoteSheet, { ACTION_SHEET_KEY } from '../ui/QuoteSheet'

function getClientUtils(): any {
	const rev = getRevenge()
	const clientUtils = rev?.plugins?.clientUtils ?? rev?.clientUtils
	if (clientUtils) return clientUtils

	const globals = globalThis as any
	return globals.__c_utils ?? globals.clientUtils
}

function optionValue(args: any, name: string): string | undefined {
	if (!args) return undefined
	if (!Array.isArray(args)) return args[name]
	const entry = args.find((item: any) => item?.name === name)
	return entry?.value
}

/**
 * `/quote` — opens the same sheet as the message row, optionally pinned to a
 * specific message id or with the body replaced.
 */
export function registerQuoteSlashCommand(): () => void {
	let retry: ReturnType<typeof setInterval> | null = null

	const register = (): boolean => {
		const clientUtils = getClientUtils()
		if (typeof clientUtils?.registerCommand !== 'function') return false

		try {
			clientUtils.registerCommand(
				{
					name: 'quote',
					displayName: 'quote',
					description:
						'Make It A Quote — turn a message into a quote card image',
					options: [
						{
							type: 3,
							name: 'message_id',
							displayName: 'message_id',
							description: 'Message ID to quote (defaults to the latest)',
							required: false,
						},
						{
							type: 3,
							name: 'custom_text',
							displayName: 'custom_text',
							description: 'Quote this text instead of the message content',
							required: false,
						},
					],
					execute: async (args: any, ctx: any) => {
						const channelId =
							ctx?.channelId ||
							ctx?.channel?.id ||
							findByProps('getChannelId')?.getChannelId?.() ||
							''

						const target = findMessage(
							channelId,
							optionValue(args, 'message_id'),
						)
						if (!target) {
							return ctx.reply?.({
								ephemeral: true,
								content: 'Could not find a message to quote in this channel.',
							})
						}
						if (!isQuotableMessage(target)) {
							return ctx.reply?.({
								ephemeral: true,
								content: 'That message cannot be quoted.',
							})
						}

						const customText = optionValue(args, 'custom_text')
						const source = extractQuoteSource(target, channelId)
						if (customText) source.text = customText

						const autoSend = getStoredSettings().instantQuote !== false
						openLazyActionSheet(
							() =>
								React.createElement(QuoteSheet, {
									source,
									autoSend,
									initialText: customText,
								}),
							ACTION_SHEET_KEY,
							{},
						)

						return ctx.reply?.({
							ephemeral: true,
							content: autoSend
								? `Rendering a quote for \`${target.id}\`…`
								: `Opened Make It A Quote for \`${target.id}\`.`,
						})
					},
				},
				{
					id: 'dev.everestmcarthur.quote',
					name: 'Make It A Quote',
					description: 'Generate quote cards on-device, right in Discord',
					icon: 'QuoteIcon',
				},
			)
			return true
		} catch (error) {
			console.warn('[Quote] Failed to register slash command:', error)
			return false
		}
	}

	if (!register()) {
		retry = setInterval(() => {
			if (!register()) return
			if (retry) clearInterval(retry)
			retry = null
		}, 1000)
	}

	return () => {
		if (retry) clearInterval(retry)
		try {
			getClientUtils()?.unregisterCommand?.('quote')
		} catch {}
	}
}
