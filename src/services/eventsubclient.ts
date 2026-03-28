// ***************************************************************************************************************
// ***************************************************************************************************************
// ***************************************************************************************************************
//
// Connects to Twitch's EventSub system to receive messages forwarded from the reverse proxy configured on the local server.
// EventSub will only send http requests directly to port 443, so the reverse proxy is necessary to forward them to 
// the correct port for this app. The middleware is configured with various event handlers for different Twitch events, 
// and logs subscription creation and deletion successes and failures. Future plans include expanding event handlers to trigger 
// actions in other apps on the server based on Twitch events.
//
// ***************************************************************************************************************
// ***************************************************************************************************************
// ***************************************************************************************************************

// internal app imports
import { getValidatedSlitherAppToken } from './twitchauth.js'
import { twitch as twitchConfig, ssl as sslConfig } from '../config.js'
import type { CreateSubscriptionRequest, CreateSubscriptionSuccessResponse, EventSubSubscription } from '../types/eventsubtypes.js'

// removed imports - reminder to implement these more completely in other apps on the server
// import { setMic1Mute as setMuteOBS } from './obsclient.js';
// import { setDariMicMute as setMuteDiscord } from './discordclient.js';

export * as default from './eventsubclient.js'

let APP_TOKEN: string | undefined

const EVENT_REDIRECT_URI = `https://${sslConfig.hostName}/slither/event`

// String array defining the scopes our User Access Tokens will request
export const eventSubScopes = new Set<string>(['bits:read', 'channel:read:redemptions', 'channel:manage:redemptions', 'moderator:read:followers', 'channel:read:subscriptions', 
						'moderator:read:shoutouts', 'moderator:manage:shoutouts', 'channel:read:hype_train', 'channel:read:predictions', 'channel:manage:predictions',
						'channel:read:polls', 'channel:manage:polls', 'user:read:chat'])

/*************************************************************************
 * Establishes a Twitch App Access Token for SlitherBot and maintains EventSub
 * Subscriptions
 *************************************************************************/
export async function initialize() {

	APP_TOKEN = await getValidatedSlitherAppToken()
	if(!APP_TOKEN) {
		console.error(`Failed to obtain an app access token on initial connection. Unable to manage EventSub subscriptions.`)
		return
	}

	const allSubs = await getEventSubSubscriptions()
	if(!allSubs) {

		// TODO: If this happens we're in a weird spot. Elevate error.
		console.error(`Failed to obtain subscriptions from Twitch on app startup. Unable to manage EventSubsubscriptions`)
		return

	}

	console.log(`allSubs: ${JSON.stringify(allSubs)}`)

}

async function getEventSubSubscriptions(): Promise<EventSubSubscription[] | undefined> {

	APP_TOKEN = await getValidatedSlitherAppToken()

	const allSubs = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions`, { method: 'GET',
																		headers: {
																			Authorization: `Bearer ${APP_TOKEN}`,
																			'Client-Id': twitchConfig.clientId
																		}
																	})
	.then(async (res) => {

		if(res.ok) return (await res.json()).data as EventSubSubscription[]
		return undefined

	})

	allSubs?.forEach(async (sub) => {

		const status = sub.status.toLowerCase()
		// TODO: Check status on every sub we have and delete disabled ones. For now, check everything is working
		if(sub.status !== 'enabled' && await unsubscribeFromEvent(sub)) {

			console.log(await subscribeToEvent({
				type: sub.type,
				version: sub.version,
				condition: sub.condition,
				transport: {
					method: 'webhook',
					callback: EVENT_REDIRECT_URI,
					secret: twitchConfig.eventsubSecret
				}
			}))
		}
	})

	return allSubs

}

async function unsubscribeFromEvent(subscription: EventSubSubscription): Promise<boolean> {

	APP_TOKEN = await getValidatedSlitherAppToken()

	return await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscription.id}`, { method: 'DELETE',
																									 headers: {
																										Authorization: `Bearer ${APP_TOKEN}`,
																										'Client-Id': twitchConfig.clientId
																									 }
																							})
	.then(async (res) => {
		
		// TODO: Include in error log elevation. Something is wrong if we have a subscription ID we can't delete
		if(!res.ok) {
			console.error(	`Unsuccessful deletion of subscription type ${subscription.type}, `,
						  	`authorizer object: ${JSON.stringify(subscription.condition)} `,
						  	`error code ${res.status}`)
		} else {
			console.log(`Successfully deleted subscription id ${subscription.id}`)
		}

		return res.ok

	})

}

async function subscribeToEvent(request: CreateSubscriptionRequest): Promise<CreateSubscriptionSuccessResponse | undefined> {

	APP_TOKEN = await getValidatedSlitherAppToken()

	return await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${APP_TOKEN}`,
			'Client-Id': twitchConfig.clientId,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(request)
	}).then(async (res) => {

		const subscribeResult = await res.json()
		if(res.ok) return subscribeResult
		console.log(`Subscribing to event of type ${request.type} failed. Response object: ${JSON.stringify(subscribeResult)}`)
		return undefined

	})

}