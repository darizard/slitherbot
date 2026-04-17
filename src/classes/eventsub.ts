import { EventSubCondition, SubscriptionType, SlitherEventSubscription } from "../types/eventsubtypes.js";
import { twitch as twitchConfig, ssl as sslConfig } from '../config.js';

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
    ]);

    static readonly #subDescriptionMap = new Map<SubscriptionType, string>([
        ['channel.follow', "Viewer follows your channel"],
        ['channel.subscribe', "Viewer subscribes to your channel for the first time"],
        ['channel.subscription.message', "Viewer sends a resubscription notification"],
        ['channel.subscription.gift', "Viewer contributes one or more gift subs"],
        ['channel.raid', "Another streamer raids your channel"],
        ['channel.bits.use', "A viewer uses bits on your channel"],
        ['channel.channel_points_custom_reward_redemption.add', "A viewer redeems a custom channel points reward"],
        ['channel.channel_points_custom_reward_redemption.update', "A viewer's channel points reward redemption is updated"],
        ['channel.hype_train.begin', "A hype train begins on your channel"],
        ['channel.hype_train.end', "A hype train concludes on your channel"]
    ])

    static readonly #callbackURI = `https://${sslConfig.hostName}/slither/event`;

    static readonly alertSubscriptionTypes = new Set<SubscriptionType>([
        'channel.follow',
        'channel.subscribe',
        'channel.subscription.gift', 
		'channel.subscription.message',
        'channel.raid',
        'channel.bits.use',
        'channel.channel_points_custom_reward_redemption.add',
		'channel.channel_points_custom_reward_redemption.update',
        'channel.hype_train.begin',
        'channel.hype_train.end'
    ]);

    static readonly userMaintenanceTypes = new Set<SubscriptionType>([
        'user.update'
    ]);

    static readonly appMaintenanceTypes = new Set<SubscriptionType>([
        'user.authorization.grant',
        'user.authorization.revoke'
    ]);
    
    static readonly scopes = new Set<string>(['bits:read', 'channel:read:redemptions', 'channel:manage:redemptions', 
	'moderator:read:followers', 'channel:read:subscriptions', 'moderator:read:shoutouts', 'moderator:manage:shoutouts', 
	'channel:read:hype_train', 'channel:read:predictions', 'channel:manage:predictions', 'channel:read:polls',
	'channel:manage:polls', 'user:read:chat']);

    static readonly subscriptionCreationTransport = Object.freeze({
        method: 'webhook',
        callback: this.#callbackURI,
        secret: twitchConfig.eventsubSecret
    });

    static isAppSubType(type: SubscriptionType): boolean {
        return this.appMaintenanceTypes.has(type);
    }

    static isUserSubType(type: SubscriptionType): boolean {
        return this.userMaintenanceTypes.has(type) || this.alertSubscriptionTypes.has(type);
    }

    static versionOf(type: SubscriptionType): string {
        return this.#subVersionMap.get(type) as string;
    }

    // User-level events MUST contain the channelId or the returned object will be empty
    static conditionOf(subType: SubscriptionType, channelId: string): EventSubCondition {
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
                if(!channelId) return {};
                return { broadcaster_user_id: channelId };
            
            // broadcaster_user_id and user_id
            // TODO: These will remain unsupported until I research into them some more
            case 'channel.chat.message':
            case 'channel.chat.notification':
                return { };

            // user_id only
            case 'user.update':
                if(!channelId) return {};
                return { user_id: channelId };

            // broadcaster_user_id and moderator_user_id
            case 'channel.follow':
            case 'channel.moderate':
            case 'channel.shoutout.create':
            case 'channel.shoutout.receive':
                if(!channelId) return {};
                return { broadcaster_user_id: channelId, moderator_user_id: channelId };

            // client_id only
            case 'user.authorization.grant':
            case 'user.authorization.revoke':
                if(channelId !== '.') return {};
                return { client_id: twitchConfig.clientId };

            // to_broadcaster_user_id only
            case 'channel.raid':
                if(!channelId) return {};
                return { to_broadcaster_user_id: channelId };
                // If we somehow want notifications when the user raids another channel then perform
                // logic and then return either to_... or from_... in the condition

            default:
                console.log(`Cannot provide condition for invalid sub type: ${subType satisfies never}`);
                return {};
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
                return subCondition.broadcaster_user_id as string;
            
            // broadcaster_user_id and user_id
            // TODO: These will remain unsupported until I research into them some more
            case 'channel.chat.message':
            case 'channel.chat.notification':
                return '';

            // user_id only
            case 'user.update':
                return subCondition.user_id as string;

            // broadcaster_user_id and moderator_user_id
            case 'channel.follow':
            case 'channel.moderate':
            case 'channel.shoutout.create':
            case 'channel.shoutout.receive':
                return subCondition.broadcaster_user_id as string;

            // client_id only
            case 'user.authorization.grant':
            case 'user.authorization.revoke':
                return '';

            // to_broadcaster_user_id only
            case 'channel.raid':
                return subCondition.to_broadcaster_user_id as string;
                // If we somehow want notifications when the user raids another channel then perform
                // logic and then return either to_... or from_... in the condition

            default:
                console.log(`Cannot provide broadcasterId for invalid sub type: ${subType satisfies never}`);
                return '';
        }
    }

    static descriptionOf(subType: SubscriptionType) {

        return this.#subDescriptionMap.get(subType) ?? 'Oops, this sub type is unsupported';

    }

    static getRequiredSubscriptions(channelIds: string[] | string): Set<SlitherEventSubscription> {
        if(!Array.isArray(channelIds)) channelIds = [channelIds];

        const rtnSet: Set<SlitherEventSubscription> = new Set();

        // For every twitch channel user, add user sub types
        for(let channelId of channelIds) {
            for(let alertSubType of this.alertSubscriptionTypes) {
                rtnSet.add({ 
                    channel_id: channelId, 
                    type: alertSubType,
                    version: this.versionOf(alertSubType),
                    id: ''
                });
            }
            for(let userMaintenanceType of this.userMaintenanceTypes) {
                rtnSet.add({ 
                    channel_id: channelId, 
                    type: userMaintenanceType,
                    version: this.versionOf(userMaintenanceType),
                    id: ''
                });
            }
        }
        
        // Add all app sub types for channelId '.', representing the Slither app
        for(let appMaintenanceType of this.appMaintenanceTypes) {
            rtnSet.add({ 
                channel_id: '.', 
                type: appMaintenanceType,
                version: this.versionOf(appMaintenanceType),
                id: ''
            });
        }
        return rtnSet;
    }

}

