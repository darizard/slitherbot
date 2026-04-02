//***SUBSCRIPTION COMPONENT TYPES***/
export type SubscriptionType = 
    'channel.bits.use' | 
    'channel.chat.message' | 
    'channel.chat.notification' |
    'channel.follow' |
    'channel.subscribe' |
    'channel.subscription.end' |
    'channel.subscription.gift' |
    'channel.subscription.message' |
    'channel.raid' |
    'channel.moderate' |
    'channel.channel_points_automatic_reward_redemption.add' |
    'channel.channel_points_custom_reward_redemption.add' |
    'channel.channel_points_custom_reward_redemption.update' |
    'channel.hype_train.begin' |
    'channel.hype_train.progress' |
    'channel.hype_train.end' |
    'user.update' |
    'user.authorization.grant' |
    'user.authorization.revoke' |
    'channel.shoutout.create' |
    'channel.shoutout.receive'

export type EventSubStatus = 
    'enabled' | 'webhook_callback_verification_pending' | 'webhook_callback_verification_failed' |
    'notification_failures_exceeded' | 'authorization_revoked' | 'moderator_removed' | 
    'user_removed' | 'version_removed' | 'beta_maintenance' | 'websocket_disconnected' | 
    'websocket_failed_ping_pong' | 'websocket_received_inbound_traffic' | 'websocket_connection_unused' |
    'websocket_internal_error' | 'websocket_network_timeout' | 'websocket_network_error'


export type EventSubCondition = {
    broadcaster_user_id?: string
    moderator_user_id?: string
    user_id?: string
    client_id?: string
    reward_id?: string
    from_broadcaster_user_id?: string
    to_broadcaster_user_id?: string
}

export type EventSubTransport = {

    method: 'webhook'
    callback: string
    secret?: string

}

//**************EVENT NOTIFICATION HANDLING**************/
export type TwitchEventSubNotification = {

    id: string
    status: string
    type: SubscriptionType
    version: string
    cost: number
    created_at: string
    condition: EventSubCondition
    transport: EventSubTransport

}

//*******************TYPE USED BY DB********************/
export type SlitherUserEventSubscription = {

    id: string | null
    channel_id: string
    type: SubscriptionType
    version: string
    status?: string

}

export type SlitherAppEventSubscription = {

    id: string | null
    type: SubscriptionType
    version: string
    status?: string

}

//**************SUBSCRIPTION MANAGEMENT**************/

export type CreateSubscriptionRequestBody = {

    type: SubscriptionType
    version: string
    condition: EventSubCondition
    transport: EventSubTransport

}

export type CreateSubscriptionSuccessResponse = {

    id: string
    status: string
    type: SubscriptionType
    version: string
    condition: EventSubCondition
    created_at: string
    transport: EventSubTransport
    cost: number
    total: number
    total_cost: number
    max_total_cost: number

}

export type WebhookCallbackChallengeRequest = {

    challenge: string
    subscription: {
        id: string
        status: 'webhook_callback_verification_pending'
        type: SubscriptionType
        version: string
        cost: number
        condition: EventSubCondition
        transport: EventSubTransport
        created_at: string
    }

}