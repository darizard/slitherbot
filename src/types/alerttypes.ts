import { SubscriptionType } from "./eventsubtypes.js";

export type EventAlertCategory = 'Follows' | 'Subscriptions' | 'Channel Points' | 'Raids' | 'Hype Trains' | 'Bits';

export type EventAlertDetails = {

    category: EventAlertCategory
    subscriptionId: string
    subscriptionType: SubscriptionType
    imageFile: string | null
    audioFile: string | null
    alertText: string | null
    alertDuration: number | null
    audioVolume: number | null
    alertDescription: string | null

}