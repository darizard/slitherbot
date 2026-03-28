// Channel Bits Use
type ChannelBitsUseCondition = {

    type: 'channel.bits.use'
    broadcaster_user_id: string
}

// Channel Chat Message
type ChannelChatMessageCondition = {

    type: 'channel.chat.message'
    broadcaster_user_id: string
    user_id: string

}

// Channel Chat Notification
type ChannelChatNotificationCondition = {

    type: 'channel.chat.notification'
    broadcaster_user_id: string
    user_id: string

}

// Channel Follow
type ChannelFollowCondition = {
    
    type: 'channel.follow'
    broadcaster_user_id: string
    moderator_user_id: string

}

// Channel Subscribe
type ChannelSubscribeCondition = {

    type: 'channel.subscribe'
    broadcaster_user_id: string

}

// Channel Subscription End
type ChannelSubscriptionEndCondition = {

    type: 'channel.subscription.end'
    broadcaster_user_id: string

}

// Channel Subscription Gift
type ChannelSubscriptionGiftCondition = {

    type: 'channel.subscription.gift'
    broadcaster_user_id: string

}

// Channel Subscription Message (Resub)
type ChannelSubscriptionMessageCondition = {

    type: 'channel.subscription.message'
    broadcaster_user_id: string

}

// Channel Cheer
type ChannelCheerCondition = {

    type: 'channel.cheer'
    broadcaster_user_id: string

}

// Channel Raid (Channel Unraid is lumped into Channel Moderate)
type ChannelRaidCondition = {
    
    type: 'channel.raid'
    from_broadcaster_user_id: string
    to_broadcaster_user_id?: never

} | {

    type: 'channel.raid'
    from_broadcaster_user_id?: never
    to_broadcaster_user_id: string

}

// Channel Moderate V2 (Includes Warnings)
type ChannelModerateV2Condition = {

    type: 'channel.moderate'
    broadcaster_user_id: string
    moderator_user_id: string

}

// Channel Channel Points Automatic Reward Redemption Add V2
type ChannelChannelPointsAutomaticRewardRedemptionAddV2Condition = {

    type: 'channel.channel_points_automatic_reward_redemption.add'
    broadcaster_user_id: string

}

// Channel Channel Points Custom Reward Redemption Add
type ChannelChannelPointsCustomRewardRedemptionAddCondition = {

    type: 'channel.channel_points_custom_reward_redemption.add'
    broadcaster_user_id: string
    reward_id?: string

}

// Channel Channel Points Custom Reward Redemption Update
type ChannelChannelPointsCustomRewardRedemptionUpdateCondition = {

    type: 'channel.channel_points_custom_reward_redemption.update'
    broadcaster_user_id: string
    reward_id?: string

}

// Channel Hype Train Begin
type ChannelHypeTrainBeginCondition = {

    type: 'channel.hype_train.begin'
    broadcaster_user_id: string

}

// Channel Hype Train Progress
type ChannelHypeTrainProgressCondition = {

    type: 'channel.hype_train.progress'
    broadcaster_user_id: string

}

// Channel Hype Train End
type ChannelHypeTrainEndCondition = {

    type: 'channel.hype_train.end'
    broadcaster_user_id: string

}

// User Update
type UserUpdateCondition = {

    type: 'user.update'
    user_id: string

}

// User Authorization Grant
type UserAuthorizationGrantCondition = {

    type: 'user.authorization.grant'
    client_id: string

}

// User Authorization Revoke
type UserAuthorizationRevokeCondition = {

    type: 'user.authorization.revoke'
    client_id: string

}

// Channel Shoutout Create
type ChannelShoutoutCreateCondition = {

    type: 'channel.shoutout.create'
    broadcaster_user_id: string
    moderator_user_id: string

}

// Channel Shoutout Receive
type ChannelShoutoutReceiveCondition = {

    type: 'channel.shoutout.receive'
    broadcaster_user_id: string
    moderator_user_id: string

}

export type CreateSubscriptionCondition = 
    ChannelBitsUseCondition | ChannelChatMessageCondition |
    ChannelChatNotificationCondition | ChannelFollowCondition |
    ChannelSubscribeCondition | ChannelSubscriptionEndCondition |
    ChannelSubscriptionGiftCondition | ChannelSubscriptionMessageCondition |
    ChannelCheerCondition | ChannelRaidCondition | ChannelModerateV2Condition |
    ChannelChannelPointsAutomaticRewardRedemptionAddV2Condition |
    ChannelChannelPointsCustomRewardRedemptionAddCondition |
    ChannelChannelPointsCustomRewardRedemptionUpdateCondition |
    ChannelHypeTrainBeginCondition | ChannelHypeTrainProgressCondition |
    ChannelHypeTrainEndCondition | UserUpdateCondition |
    UserAuthorizationGrantCondition | UserAuthorizationRevokeCondition |
    ChannelShoutoutCreateCondition | ChannelShoutoutReceiveCondition

export type CreateSubscriptionTransport = {

    method: 'webhook'
    callback: string
    secret: string

}

export type EventNotificationTransport = {

    method: 'webhook'
    callback: string

}