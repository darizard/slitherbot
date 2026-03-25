export type WSMessage = {
    type: WSMessageType
}

export function isWSMessage(message: WSMessage): message is WSMessage {
    return (message.type === 'alert' ||
            message.type === 'ping' ||
            message.type === 'pong'
    )
}

export type AlertMessage = WSMessage & {
    type: 'alert',
    userId: string,
    data: {
        imageFile: string | undefined,
        audioFile: string | undefined,
        alertText: string | undefined,
        duration: number | undefined
    }
}

export function isAlertMessage(message: AlertMessage): message is AlertMessage {
    return (message.type === 'alert' &&
            (message.data.imageFile === undefined || typeof message.data.imageFile === 'string') &&
            (message.data.audioFile === undefined || typeof message.data.audioFile === 'string') &&
            (message.data.alertText === undefined || typeof message.data.alertText === 'string') &&
            (message.data.duration === undefined || typeof message.data.duration === 'number')
    )
}

export type PingMessage = WSMessage & {
    type: 'ping'
}

export function isPingMessage(message: WSMessage | PingMessage): message is PingMessage {
    return (message.type === 'ping' && Object.keys(message).length === 1)
}

export type PongMessage = WSMessage & {
    type: 'pong'
}

export function isPongMessage(message: WSMessage | PongMessage): message is PongMessage {
    return (message.type === 'pong' && Object.keys(message).length === 1)
}

export type WSClient = {
    type: WSClientType,
    userId: string | undefined
}

export type WSClientType = 'alerts' | 'controller'

export function isValidClientType(type: WSClientType): type is WSClientType {
    return (
        type === 'alerts' ||
        type === 'controller'
    )
}

export type WSMessageType = 'alert' | 'ping' | 'pong'

export function isValidMessageType(type: WSMessageType): type is WSMessageType {
    return(
        type === 'alert' ||
        type === 'ping' ||
        type === 'pong'
    )
}

export * as default from './slitherwstypes.js'