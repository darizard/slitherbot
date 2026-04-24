import { SubscriptionType } from "./eventsubtypes.js";

export type EventAlertCategory = 'Follows' | 'Subscriptions' | 'Channel Points' | 'Raids' | 'Hype Trains' | 'Bits';

export type EventAlertDetails = {

    category: EventAlertCategory
    subscriptionId: string
    subscriptionType: SubscriptionType
    imageFileName: string | null
    audioFileName: string | null
    alertText: string | null
    alertDuration: number | null
    audioVolume: number | null
    alertDescription: string | null

}

export type AlertPostReqBody = {

    subscriptionId: string
    audioVolume: string | undefined
    alertDuration: string | undefined
    alertText: string | undefined

}

export type AlertUpdateData = {

    audio_volume?: number
    duration?: number
    alert_text?: string
    image_file?: string
    image_file_name?: string
    audio_file?: string
    audio_file_name?: string

}