import { EventSubCondition, SubscriptionType } from "../types/eventsubtypes.js"
import { twitch as twitchConfig, ssl as sslConfig } from '../config.js'

export class SlitherEventSub {

    static readonly #subVersionMap = new Map<SubscriptionType, string>([
        // Required Alert Subscriptions
        ['channel.follow', '2'],
        ['channel.subscribe', '1'],
        ['channel.subscription.gift', '1'],
        ['channel.subscription.message', '1'],
        ['channel.raid', '1'],
        ['channel.bits.use', '1'],
        ['channel.channel_points_custom_reward_redemption.add', '1'],
        ['channel.channel_points_custom_reward_redemption.update', '1'],
        ['channel.hype_train.begin', '2'],
        ['channel.hype_train.end', '2'],
        // Required user-level data maintenance subscription
        ['user.update', '1'],

        // Required App-level subscriptions
        ['user.authorization.grant', '1'],
        ['user.authorization.revoke', '1'],

        // ====Potential future alerts or non-alerts use--currently unsupported====
        ['channel.hype_train.progress', '2'],
        ['channel.subscription.end', '1'],
        ['channel.channel_points_automatic_reward_redemption.add', '2'],
        ['channel.chat.message', '1'],
        ['channel.chat.notification', '1'],
        ['channel.moderate', '2'],
        ['channel.shoutout.create', '1'],
        ['channel.shoutout.receive', '1']
    ])

    static readonly #callbackURI = `https://${sslConfig.hostName}/slither/event`

    static readonly requiredUserTypes = new Set<SubscriptionType>([
        'channel.follow',
        'channel.subscribe',
        'channel.subscription.gift', 
		'channel.subscription.message',
        'channel.raid',
        'channel.bits.use',
        'channel.channel_points_custom_reward_redemption.add',
		'channel.channel_points_custom_reward_redemption.update',
        'channel.hype_train.begin',
        'channel.hype_train.end',
        'user.update'
    ])

    static readonly requiredAppTypes = new Set<SubscriptionType>([
        'user.authorization.grant',
        'user.authorization.revoke'
    ])
    
    static readonly scopes = new Set<string>(['bits:read', 'channel:read:redemptions', 'channel:manage:redemptions', 
	'moderator:read:followers', 'channel:read:subscriptions', 'moderator:read:shoutouts', 'moderator:manage:shoutouts', 
	'channel:read:hype_train', 'channel:read:predictions', 'channel:manage:predictions', 'channel:read:polls',
	'channel:manage:polls', 'user:read:chat'])

    static readonly subscriptionCreationTransport = Object.freeze({
        method: 'webhook',
        callback: this.#callbackURI,
        secret: twitchConfig.eventsubSecret
    })

    static versionOf(type: SubscriptionType): string {
        return this.#subVersionMap.get(type) as string
    }

    static conditionOf(subType: SubscriptionType, channelId?: string): EventSubCondition {
        switch(subType) {
            // broadcaster_user_id only
            case 'channel.bits.use':
            case 'channel.subscribe':
            case 'channel.subscription.gift':
            case 'channel.subscription.message':
            case 'channel.subscription.end':
            case 'channel.channel_points_automatic_reward_redemption.add':
            case 'channel.channel_points_custom_reward_redemption.add':
            case 'channel.channel_points_custom_reward_redemption.update':
            case 'channel.hype_train.begin':
            case 'channel.hype_train.end':
            case 'channel.hype_train.progress':
                return { broadcaster_user_id: channelId }
            
            // broadcaster_user_id and user_id
            // TODO: These will remain unsupported until I research into them some more
            case 'channel.chat.message':
            case 'channel.chat.notification':
                return { }

            // user_id only
            case 'user.update':
                return { user_id: channelId }

            // broadcaster_user_id and moderator_user_id
            case 'channel.follow':
            case 'channel.moderate':
            case 'channel.shoutout.create':
            case 'channel.shoutout.receive':
                return { broadcaster_user_id: channelId, moderator_user_id: channelId }

            // client_id only
            case 'user.authorization.grant':
            case 'user.authorization.revoke':
                return { client_id: twitchConfig.clientId }

            // to_broadcaster_user_id only
            case 'channel.raid':
                return { to_broadcaster_user_id: channelId }
                // If we somehow want notifications when the user raids another channel then perform
                // logic and then return either to_... or from_... in the condition

            default:
                console.log(`Cannot provide condition for invalid sub type: ${subType satisfies never}`)
                return {}
        }
    }

    static broadcasterOf(subCondition: EventSubCondition, subType: SubscriptionType): string {

        switch(subType) {
            // broadcaster_user_id only
            case 'channel.bits.use':
            case 'channel.subscribe':
            case 'channel.subscription.gift':
            case 'channel.subscription.message':
            case 'channel.subscription.end':
            case 'channel.channel_points_automatic_reward_redemption.add':
            case 'channel.channel_points_custom_reward_redemption.add':
            case 'channel.channel_points_custom_reward_redemption.update':
            case 'channel.hype_train.begin':
            case 'channel.hype_train.end':
            case 'channel.hype_train.progress':
                return subCondition.broadcaster_user_id as string
            
            // broadcaster_user_id and user_id
            // TODO: These will remain unsupported until I research into them some more
            case 'channel.chat.message':
            case 'channel.chat.notification':
                return ''

            // user_id only
            case 'user.update':
                return subCondition.user_id as string

            // broadcaster_user_id and moderator_user_id
            case 'channel.follow':
            case 'channel.moderate':
            case 'channel.shoutout.create':
            case 'channel.shoutout.receive':
                return subCondition.broadcaster_user_id as string

            // client_id only
            case 'user.authorization.grant':
            case 'user.authorization.revoke':
                return ''

            // to_broadcaster_user_id only
            case 'channel.raid':
                return subCondition.to_broadcaster_user_id as string
                // If we somehow want notifications when the user raids another channel then perform
                // logic and then return either to_... or from_... in the condition

            default:
                console.log(`Cannot provide broadcasterId for invalid sub type: ${subType satisfies never}`)
                return ''
        }

    }

}

