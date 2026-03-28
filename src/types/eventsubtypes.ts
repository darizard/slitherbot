import type { CreateSubscriptionCondition as ConditionFromBase, CreateSubscriptionTransport, EventNotificationTransport } from "./base/eventsub-base.js" // Conditions

//**************EVENT NOTIFICATION HANDLING**************/

//***BASE TYPES***/
export type EventSubSubscription = {

    id: string
    status: string
    type: string
    version: string
    cost: number
    created_at: string

    condition: Omit<CreateSubscriptionCondition, 'type'>

}

export type EventSubEvent = {



}

//***SPECIFIC TYPES***/
export type ChannelFollowEventNotification = EventSubSubscription & {

    

}


//**************SUBSCRIPTION MANAGEMENT**************/


export type CreateSubscriptionCondition = ConditionFromBase

export type CreateSubscriptionRequest = {

    type: string
    version: string
    condition: Omit<ConditionFromBase, 'type'>
    transport: CreateSubscriptionTransport

}

export type CreateSubscriptionSuccessResponse = {

    id: string
    status: string
    type: string
    version: string
    condition: ConditionFromBase
    created_at: string
    transport: EventNotificationTransport
    cost: number
    total: number
    total_cost: number
    max_total_cost: number

}