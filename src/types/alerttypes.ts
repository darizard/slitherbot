export type EventAlertCategory = 'Follows' | 'Subscriptions' | 'Channel Points' | 'Raids' | 'Hype Trains' | 'Bits';

export type EventAlertDetails = {

    subscriptionId: string
    imageFile: string | null
    audioFile: string | null
    alertText: string | null
    alertDuration: number | null
    audioVolume: number | null

}