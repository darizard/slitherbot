export type EventSubSubscription = {

    id: string
    status: string
    type: string
    version: string
    cost: number
    created_at: string
    condition: EventSubSubscriptionCondition

    [key: string]: unknown

}

export type EventSubSubscriptionCondition = {

    broadcaster_user_id?: string
    moderator_user_id?: string
    broadcaster_id?: string
    user_id?: string
    reward_id?: string

    // unlikely to use these, but they are part of the Condition spec for some events
    client_id?: string
    conduit_id?: string
    organization_id?: string
    category_id?: string
    campaign_id?: string
    extension_client_id?: string

}

// Sent to Twitch as part of a subscription creation Request
export type EventSubSubscriptionTransport = {

    method: 'webhook'
    callback: string
    secret?: string // defined for outgoing transports

}

export type CreateSubscriptionRequest = {

    type: string
    version: string
    condition: EventSubSubscriptionCondition
    transport: EventSubSubscriptionTransport

}

export type CreateSubscriptionSuccessResponse = {

    id: string
    status: string
    type: string
    version: string
    condition: EventSubSubscriptionCondition
    created_at: string
    transport: EventSubSubscriptionTransport
    cost: number
    total: number
    total_cost: number
    max_total_cost: number

}