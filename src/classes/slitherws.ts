/* 
*  WebSocket wrappers to simplify usage within SlitherBot. And also for some practice using inheritance
*  and polymorphism, and organizing project files and objects in a good way.
*/

import { WebSocket, RawData } from 'ws'

import type { WSMessage, AlertMessage, PingMessage, PongMessage } from '../types/slitherwstypes.js'
import { isAlertMessage, isPingMessage, isPongMessage } from '../types/slitherwstypes.js'

import { ssl as sslConfig } from '../config.js'

import { SignJWT } from 'jose'

export interface ISlitherWebSocket {

    readonly userId: string
    readonly clientType: string
    readonly instantiationTimestamp: number

    readonly onError: (error: Error) => void
    readonly onClose: () => void
    readonly onMessage: (rawMessage: RawData) => void

    connect(connectionTarget: string | WebSocket, forwards?: ISlitherWebSocket | ISlitherWebSocket[]): void
    send(message: AlertMessage | PingMessage | PongMessage | undefined, recipient?: ISlitherWebSocket | ISlitherWebSocket[]): void

}

export class SlitherControllerClientWebSocket implements ISlitherWebSocket {

    readonly userId: string
    readonly clientType: string
    readonly instantiationTimestamp: number
    
    readonly onError: (error: Error) => void
    readonly onOpen: () => void
    readonly onClose: () => void
    readonly onMessage: (rawMessage: RawData) => void

    #ws: WebSocket | undefined // The underlying abstracted WebSocket. Will not be undefined after the connect method is called
    #secret: string | undefined

    #queue: (AlertMessage | PingMessage | PongMessage)[] // Queue for messages in case the controller somehow loses websocket connection to the WebSocket server

    // Timeouts for Keep Alive pings and Reconnect attempts
    #keepAliveTimeout: NodeJS.Timeout | undefined
    #reconnectTimeout: NodeJS.Timeout | undefined
    
    constructor() {

        this.#queue = []

        this.userId = '.controller.'
        this.clientType = 'controller'
        this.instantiationTimestamp = Date.now()

        this.onError = (error) => { console.error(`Error encountered on the controller client WebSocket: ${JSON.stringify(error)}`) }

        this.onOpen = () => {
            const queueInterval = setInterval(() => {
                this.send(this.#queue.pop())
                if(this.#queue.length === 0) clearInterval(queueInterval)
            }, 250)

            clearInterval(this.#reconnectTimeout)
        }

        this.onClose = () => {
            this.#ws?.removeAllListeners()
            clearInterval(this.#keepAliveTimeout)

            this.#reconnectTimeout = setInterval(() => this.#reconnect(), 1000 * 2)
        }

        this.onMessage = (rawMessage) => {

            const messageJSON = (() => {
                try { return JSON.parse(rawMessage.toString()) }
                catch(err) { 
                    console.error(`Client-side controller WebSocket received non-JSON message: ${JSON.stringify(err)}`)
                    return
                }
            })() as WSMessage

            switch(messageJSON.type) {
                case 'alert':
                    console.error(`Client-side controller WebSocket received unexpected alert-type message: ${JSON.stringify(messageJSON)}`)
                    break

                case 'ping':
                    if(isPingMessage(messageJSON)) 
                        this.send({ type: 'pong' } satisfies PongMessage)
                    else 
                        console.error(`Client-side controller WebSocket received malformed ping message: ${JSON.stringify(messageJSON)}`)
                    
                    break

                case 'pong':
                    if(!isPongMessage(messageJSON))
                        console.error(`Client-side controller WebSocket received malformed pong message: ${JSON.stringify(messageJSON)}`)

                    break

                default:
                    console.error(`Client-side controller WebSocket received message of invalid type: ${messageJSON.type satisfies never}`)
            }

        }

    }

    async connect(incomingSecret: string): Promise<void> {

        this.#secret = incomingSecret
        const SECRET = new TextEncoder().encode(incomingSecret)

        const token = await new SignJWT({ userId: this.userId, clientType: this.clientType })
                            .setIssuedAt()
                            .setProtectedHeader({alg: 'HS256'})
                            .sign(SECRET)

        this.#ws = new WebSocket(`wss://${sslConfig.hostName}/slither?clientType=${this.clientType}&token=${token}`)

        this.#ws.on('error', this.onError)
        this.#ws.on('open', this.onOpen)
        this.#ws.on('message', this.onMessage)
        this.#ws.on('close', this.onClose)

        this.#keepAliveTimeout = setInterval(() => this.#keepAlive(), 1000 * 30) // Send a KeepAlive ping every 30 seconds
        
    }

    send(message: AlertMessage | PingMessage | PongMessage | undefined): void {

        if(message === undefined) return
        
        if(!this.#ws) {
            console.error(`Controller Client WebSocket tried to send a message before connecting`)
            return
        } 
        
        if(this.#ws.readyState === WebSocket.CLOSED || this.#ws.readyState === WebSocket.CLOSING) {
            console.error(`Controller Client WebSocket send() failed: Socket is in the ${this.#ws.readyState} state.`)
            return
        } 

        if(this.#ws.readyState === WebSocket.CONNECTING) {
            this.#queue.push(message)
            return
        }
            
        this.#ws.send(JSON.stringify(message))

    }

    #keepAlive(): void {

        this.send({ type: "ping" } satisfies PingMessage)

    }

    #reconnect(): void {

        this.connect(this.#secret ?? '')

    }

}

export class SlitherControllerServerWebSocket implements ISlitherWebSocket {

    #ws: WebSocket | undefined

    readonly userId: string
    readonly clientType: string
    readonly instantiationTimestamp: number
    readonly forwardSockets: Set<SlitherAlertsServerWebSocket>

    onError: (error: Error) => void
    onMessage: (rawMessage: RawData) => void
    onClose: () => void

    constructor(forwardSockets: Set<SlitherAlertsServerWebSocket>) {

        this.userId = '.controller.'
        this.clientType = 'controller'
        this.instantiationTimestamp = Date.now()
        this.forwardSockets = forwardSockets

        this.onError = (error) => { 
            console.log(`Error occurred on server-side controller websocket: ${JSON.stringify(error)}`)
        }

        this.onMessage = (rawMessage: RawData) => { 

            const messageJSON = (() => {
                try { return JSON.parse(rawMessage.toString()) }
                catch(err) { return }
            })() as WSMessage

            switch(messageJSON.type) {

                case 'alert':
                    if(!isAlertMessage(messageJSON as AlertMessage)) {
                        console.error(`Server-side controller socket received malformed alert message: ${JSON.stringify(messageJSON)}`)
                        return
                    }
                    const alertMessage = messageJSON as AlertMessage

                    const matchingSockets: SlitherAlertsServerWebSocket[] = []
                    for(let socket of forwardSockets) {
                        if(socket.userId === alertMessage.userId) matchingSockets.push(socket)
                    }

                    this.send(alertMessage, matchingSockets)
                    
                    break

                case 'ping':
                    // ping messages should have nothing but the type
                    if(!isPingMessage(messageJSON)) {
                        console.error(`Server-side controller socket received malformed ping message: ${JSON.stringify(messageJSON)}`)
                        return
                    } 

                    this.#sendPongReply()
                    return

                case 'pong':
                    // TODO: Elevate this? We want to know if someone is sending weird messages to our websockets, especially if they've authenticated
                    if(!isPongMessage(messageJSON)) console.error(`Server-side controller socket received malformed pong message: ${JSON.stringify(messageJSON)}`)
                    return

                default:
                    // TODO: Elevate error as this could represent security concerns
                    console.log(`Server-side controller socket received message with invalid type: ${messageJSON.type satisfies never}`)
                    return

            }

        }

        this.onClose = () => { this.#ws?.removeAllListeners() }

    }

    connect(ws: WebSocket): void {

        if(this.#ws) this.#ws.close(1000)
        ws.removeAllListeners()

        ws.on('error', this.onError)
        ws.on('message', this.onMessage)
        ws.on('close', this.onClose)
        this.#ws = ws

    }

    send(message: AlertMessage, recipients?: ISlitherWebSocket[] | ISlitherWebSocket): void {

        if(!recipients) {
            this.#ws?.send(JSON.stringify(message))
            return
        }

        if(!Array.isArray(recipients)) recipients = [recipients]

        recipients.forEach((recipient) => { recipient.send(message) })

    }

    #sendPongReply() {

        if(!this.#ws) return
        this.#ws.send(JSON.stringify({ type: "pong" } satisfies PongMessage))

    }

}

export class SlitherAlertsServerWebSocket implements ISlitherWebSocket {

    #ws: WebSocket | undefined

    readonly userId: string
    readonly clientType: string
    readonly instantiationTimestamp: number

    readonly onError: (error: Error) => void
    readonly onMessage: (rawMessage: RawData) => void
    readonly onClose: () => void


    constructor(userId: string) {

        this.userId = userId
        this.clientType = 'alerts'
        this.instantiationTimestamp = Date.now()
 
        this.onError = (error) => { 
            console.log(`Error occurred on server-side alerts websocket: ${JSON.stringify(error)}`)
        }

        this.onMessage = (messageRaw) => { 

            const messageJSON = (() => {
                try { return JSON.parse(messageRaw.toString()) }
                catch(err) { 
                    console.error(`Server-side alerts socket received non-JSON message`) 
                    return
                }
            })() as WSMessage

            switch(messageJSON.type) {
                case 'alert':
                    if(!isAlertMessage(messageJSON as AlertMessage)) {
                        console.error(`Server-side alerts socket received invalid alert message: ${JSON.stringify(messageJSON)}`)
                        return
                    }
                    this.send(messageJSON as AlertMessage)
                    break

                case 'ping':
                    if(!isPingMessage(messageJSON)) {
                        console.error(`Server-side alerts socket received invalid ping message: ${JSON.stringify(messageJSON)}`)
                        return
                    }
                    this.#sendPong()
                    break

                case 'pong':
                    if(!isPongMessage(messageJSON)) {
                        console.error(`Server-side alerts socket received invalid pong message: ${JSON.stringify(messageJSON)}`)
                        return
                    }
                    break

                default:
                    console.error(`Server-side alerts socket received message of invalid type: ${messageJSON.type satisfies never}`)

            }

        }

        this.onClose = () => { 
            this.#ws?.removeAllListeners()
        }

    }

    connect(ws: WebSocket) {
        if(this.#ws) this.#ws.close(1000)
        
        ws.removeAllListeners()

        ws.on('error', this.onError)
        ws.on('message', this.onMessage)
        ws.on('close', this.onClose)

        this.#ws = ws
    }

    send(message: AlertMessage) {

        this.#ws?.send(JSON.stringify(message))

    }

    #sendPong() {
        this.#ws?.send(JSON.stringify({ type: 'pong'} satisfies PongMessage))
    }

}