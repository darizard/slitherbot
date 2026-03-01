interface WebhookCallbackVerificationEvent {
    challenge: string
    subscription: {
        id: string
        status: string
        type: string
        version: string
        cost: number
        condition: {
            broadcaster_user_id: string
        }
        transport: {
            method: string
            callback: string
        }
        created_at: string
    }
}

interface Subscription {

}

type ChannelPointsCustomRewardRedemptionAddEvent = {

}