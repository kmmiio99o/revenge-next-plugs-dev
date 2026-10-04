import { findByProps, getRevenge, getSelectedChannelId } from './revenge'

export interface QuoteSource {
	text: string
	username: string
	displayName: string
	avatarUrl: string
	targetUserId: string
	channelId: string
	roleColor?: string
	replyAuthor?: string
	messageId: string
}

/** Discord's `MessageType.USER_MESSAGE` set — only these are quotable. */
export const USER_MESSAGE_TYPES = new Set([0, 19, 20, 23, 26, 41, 45, 47, 68])

export function isQuotableMessage(message: any): boolean {
	if (!message) return false
	if (message.state && message.state !== 'SENT') return false
	if (message.type != null && !USER_MESSAGE_TYPES.has(message.type))
		return false
	return true
}

function messageStore(): any {
	const rev = getRevenge()
	return (
		rev?.everest?.getMessageStore?.() ??
		findByProps('getMessages', 'getMessage')
	)
}

export function getSelectedChannelIdSafe(): string {
	return getSelectedChannelId()
}

function defaultAvatarUrl(userId: string): string {
	try {
		const index = (BigInt(userId) >> 22n) % 6n
		return `https://cdn.discordapp.com/embed/avatars/${index}.png`
	} catch {
		return 'https://cdn.discordapp.com/embed/avatars/0.png'
	}
}

function resolveAvatarUrl(author: any, member: any, guildId: string): string {
	let url = ''
	try {
		if (typeof author?.getAvatarURL === 'function') {
			url = author.getAvatarURL(guildId, 512)
		}
	} catch {}
	if (!url && member?.avatar && guildId) {
		url = `https://cdn.discordapp.com/guilds/${guildId}/users/${author?.id}/avatars/${member.avatar}.png?size=512`
	}
	if (!url && author?.avatar && author?.id) {
		url = `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=512`
	}
	if (!url) url = defaultAvatarUrl(author?.id ?? '')

	// The card canvas cannot decode WebP.
	return url.replace('.webp', '.png')
}

/**
 * Pulls everything the card needs out of a Discord message record.
 */
export function extractQuoteSource(
	message: any,
	channelId?: string,
): QuoteSource {
	const rev = getRevenge()
	const memberStore =
		rev?.everest?.getGuildMemberStore?.() ?? findByProps('getMember')

	const author = message?.author ?? {}
	const targetUserId = author?.id ?? ''
	const username = author?.username ?? 'user'
	const guildId = message?.guild_id ?? message?.guildId

	const member =
		guildId && targetUserId && memberStore?.getMember
			? memberStore.getMember(guildId, targetUserId)
			: null

	const displayName =
		member?.nick || author?.globalName || author?.username || 'User'

	let text = message?.content || ''
	if (!text && message?.attachments?.length) {
		text = message.attachments[0].filename || '[Attachment]'
	} else if (!text && message?.sticker_items?.length) {
		text = `:${message.sticker_items[0].name}:`
	}

	let replyAuthor: string | undefined
	if (message?.referenced_message?.author) {
		const referenced = message.referenced_message.author
		replyAuthor = referenced.globalName || referenced.username
	}

	return {
		text,
		username,
		displayName,
		avatarUrl: resolveAvatarUrl(author, member, guildId),
		targetUserId,
		channelId: channelId || message?.channel_id || message?.channelId || '',
		roleColor: member?.colorString,
		replyAuthor,
		messageId: message?.id ?? '',
	}
}

export function findMessage(channelId: string, messageId?: string): any {
	const store = messageStore()
	if (!store) return undefined

	if (messageId) return store.getMessage?.(channelId, messageId)

	const messages = store.getMessages?.(channelId)
	const list =
		messages?.toArray?.() ||
		messages?._array ||
		(Array.isArray(messages) ? messages : [])
	return list[list.length - 1]
}
