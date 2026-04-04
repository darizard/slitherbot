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
import { twitch as twitchConfig } from '../config.js'
import type { CreateSubscriptionRequestBody, TwitchEventNotification, 
				WebhookCallbackChallengeRequest, SubscriptionType, 
				SlitherUserEventSubscription, SlitherAppEventSubscription } from '../types/eventsubtypes.js'

// DB imports
import eventsubsql from '../db/queries/eventsub.js'
import twitchauthsql from '../db/queries/twitchauth.js'

// internal classes
import { SlitherEventSub } from '../classes/eventsub.js'

// removed imports - reminder to implement these more completely in other apps on the server
// import { setMic1Mute as setMuteOBS } from './obsclient.js';
// import { setDariMicMute as setMuteDiscord } from './discordclient.js';

export * as default from './eventsubclient.js'

/*************************************************************************
 * Establishes a Twitch App Access Token for SlitherBot and maintains EventSub
 * Subscriptions
 *************************************************************************/
export async function initialize(): Promise<void> {

	// Validates App Access Token in DB, then obtains and immediately validates a new one if necessary
	const appToken = await getValidatedSlitherAppToken()
	if(!appToken) {
		console.error(`Failed to obtain an app access token on initial connection. Unable to manage EventSub subscriptions.`)
		return
	}

	const activeUserIds = await twitchauthsql.getActiveChannels()

	// Ensure each required sub has a record in the database
	await eventsubsql.initRequiredUserSubs(activeUserIds)
	await eventsubsql.initRequiredAppSubs()

	// Query all Slither's User Event Subscription details from the database and map each value 'id' to key '{ channel_id, type }'
	const dbUserSubs = await (async () => {
		const rtnMap = new Map<{ channel_id: string, type: SubscriptionType }, string | null>();
		(await eventsubsql.getAllUserSubscriptions()).forEach((dbUserSub) => {
			rtnMap.set({ channel_id: dbUserSub.channel_id, type: dbUserSub.type }, dbUserSub.id)
		})
		return rtnMap
	})()
	// Query all Slither's App Event Subscription details from the database and map each value 'id' to key 'type'
	const dbAppSubs = await (async () => {
		const rtnMap = new Map<SubscriptionType, string | null>();
		(await eventsubsql.getAllAppSubscriptions()).forEach((dbAppSub) => {
			rtnMap.set(dbAppSub.type, dbAppSub.id)
		})
		return rtnMap
	})()
	
	if(!dbUserSubs || !dbAppSubs) {
		console.error(`Internal error retrieving Subscription IDs to initizalize the Event Sub client. Unable to manage EventSub subscriptions.`)
		return
	}

	// Fetch all of Slither's EventSub Subscriptions from Twitch
	const twitchSubs = await fetchAllTwitchSubscriptions()
	if(!twitchSubs) {
		console.error(`Error retrieving Event Subscription infromation from Twitch. Unable to manage EventSub subscriptions.`)
		return
	}

	// Compare subscription ids of all required event types received from Twitch to the information in the DB and update
	// every subscription in the DB with Twitch's sub id. Afterward, for all required subscriptions for active users
	// which still have an id of NULL, subscribe to the related events via the Twitch API and update the sub IDs in the DB
	
	
	// 1. Loop through all of the twitch subs and assign the subscription ID to each {user, subType} value via a map.
	// App-level sub types will map the subscription ID to the type only
	const twitchUserSubs = new Map<{ channel_id: string, type: SubscriptionType }, string>()
	const twitchAppSubs = new Map<SubscriptionType, string>()

	const dbUserSubsToUpdate = new Set<SlitherUserEventSubscription>()
	const dbAppSubsToUpdate = new Set<SlitherAppEventSubscription>()

	twitchSubs.forEach((twitchSub) => {
		if(twitchSub.status !== 'enabled') {

			handleDisabledSubscription(twitchSub) // TODO: Implement this. Delete sub from DB and take any necessary steps
			twitchSubs.delete(twitchSub)

		} else if(SlitherEventSub.requiredAppTypes.has(twitchSub.type)) {
			
			const subIdFromDb = dbAppSubs.get(twitchSub.type)
			if(subIdFromDb === undefined) console.error(`Error grabbing subscription Id during EventSub client initialization.`)
			else if(subIdFromDb !== twitchSub.id) {
				
				dbAppSubsToUpdate.add({
					id: twitchSub.id,
					type: twitchSub.type,
					version: SlitherEventSub.versionOf(twitchSub.type)
				})
			}

			twitchAppSubs.set(twitchSub.type, twitchSub.id)
	
		} else if(SlitherEventSub.requiredUserTypes.has(twitchSub.type)) {
			
			const channelId = SlitherEventSub.broadcasterOf(twitchSub.condition, twitchSub.type)
			// TODO: Look into hashing object keys in order to prevent this from being O(twitchSubs * dbSubs) = O(n^2)
			const subIdFromDb = dbUserSubs.entries().find((entry) => {
				return (entry[0].channel_id === channelId && entry[0].type === twitchSub.type)
			})?.[1]
			
			if(subIdFromDb === undefined) console.error(`Error grabbing subscription Id during EventSub client initialization.`)
			else if(subIdFromDb !== twitchSub.id) {

				dbUserSubsToUpdate.add({
					id: twitchSub.id,
					channel_id: channelId,
					type: twitchSub.type,
					version: SlitherEventSub.versionOf(twitchSub.type)
				})
			}
			twitchUserSubs.set({ channel_id: channelId, type: twitchSub.type}, twitchSub.id)
			
		} else { 

			// TODO: Elevate error, we have an unexpected event subscription with Twitch
			console.error(`Unexpected event subscription returned by Twitch API, id = ${twitchSub.id}. Investigate.`)
			handleDisabledSubscription(twitchSub)
			twitchSubs.delete(twitchSub)

		}
	})

	if(dbUserSubsToUpdate.size > 0) await eventsubsql.upsertUserEventSub([...dbUserSubsToUpdate])
	if(dbAppSubsToUpdate.size > 0) await eventsubsql.upsertAppEventSub([...dbAppSubsToUpdate]);

	// All database eventsubs have been synced to the subscription information received from the Twitch API
	// For any required subs for active users that still have a NULL id, subscribe to the corresponding event
	// via Twitch API and update the subscription IDs in the database
	(await eventsubsql.getNullAppSubTypes()).forEach(async (subType) => {
		await subscribeToEvent(subType)
	});
	(await eventsubsql.getNullUserSubs(activeUserIds)).forEach(async (nullUserSub) => {
		await subscribeToEvent(nullUserSub.type, nullUserSub.channel_id)
	})

}

async function fetchAllTwitchSubscriptions(): Promise<Set<TwitchEventNotification> | undefined> {

	const appToken = await getValidatedSlitherAppToken()

	// A set containing all of the Subscription data objects Twitch has for Slither's app token
	const subsFromTwitch = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions`, { method: 'GET',
																		headers: {
																			Authorization: `Bearer ${appToken}`,
																			'Client-Id': twitchConfig.clientId
																		}
																	})
	.then(async (res) => {

		const resWasOk = res.ok
		const resData = (await res.json()).data as TwitchEventNotification[]
		if(resWasOk) return new Set(resData)
		return undefined

	})

	return subsFromTwitch
}

export async function registerNewEventSubscription(challengeReq: WebhookCallbackChallengeRequest): Promise<void> {

	
	if(SlitherEventSub.requiredAppTypes.has(challengeReq.subscription.type)) {
		const dbSub = {
			id: challengeReq.subscription.id,
			type: challengeReq.subscription.type,
			version: SlitherEventSub.versionOf(challengeReq.subscription.type)
		}

		await eventsubsql.upsertAppEventSub(dbSub)

	// All other events Slither currently subscribes to use a User Access Token
	} else if(SlitherEventSub.requiredUserTypes.has(challengeReq.subscription.type)) {
		const twitchId = SlitherEventSub.broadcasterOf(challengeReq.subscription.condition, challengeReq.subscription.type)

		if(!twitchId) {
			console.error(`Error registering Event Subscription: Could not retrieve twitch ID from object condition.`)
			return
		}
		
		const dbSub = {
			id: challengeReq.subscription.id,
			channel_id: twitchId,
			type: challengeReq.subscription.type,
			version: SlitherEventSub.versionOf(challengeReq.subscription.type)
		}

		await eventsubsql.upsertUserEventSub(dbSub)
	} else {

		console.error(`Error registering Event Subscription: Unsupported event type: ${challengeReq.subscription.type}`)

	}
}

export async function handleDisabledSubscription(subscription: TwitchEventNotification): Promise<void> {

	await unsubscribeFromEvent(subscription)

}

async function unsubscribeFromEvent(subscription: TwitchEventNotification): Promise<boolean> {

	const appToken = await getValidatedSlitherAppToken()

	return await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscription.id}`, { method: 'DELETE',
																									 headers: {
																										Authorization: `Bearer ${appToken}`,
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

// Subscribe to User event if channelId is provided, otherwise subscribe to App event
async function subscribeToEvent(eventType: SubscriptionType, channelId?: string): Promise<string | undefined> {

	const appToken = await getValidatedSlitherAppToken()
	const reqHeaders = { 			
			'Authorization': `Bearer ${appToken}`,
			'Client-Id': twitchConfig.clientId,
			'Content-Type': 'application/json'
	}

	let reqBody: CreateSubscriptionRequestBody
	if(!SlitherEventSub.requiredUserTypes.has(eventType) &&
	   !SlitherEventSub.requiredAppTypes.has(eventType)) {

		console.error(`Cannot subscribe to unsupported event type: ${eventType}`)
		return

	   }

	reqBody = {

		type: eventType,
		version: SlitherEventSub.versionOf(eventType),
		condition: SlitherEventSub.conditionOf(eventType, channelId),
		transport: SlitherEventSub.subscriptionCreationTransport

	}

	return await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions`, {
		method: 'POST',
		headers: reqHeaders,
		body: JSON.stringify(reqBody)
	}).then(async (res) => {

		const subscribeResult = await res.json()
		if(res.ok) return subscribeResult
		if(res.status === 409) {
			// TODO: Elevate this error. We should never have a problem subscribing to an event
			console.error(`Already subscribed to event type ${eventType} for channel id ${channelId}. 409 response received from Twitch`)
			return undefined
		}
		// TODO: Elevate this error. We should never have a problem subscribing to an event
		console.error(`Subscribing to event of type ${eventType} failed. Response object: ${JSON.stringify(subscribeResult)}`)
		return undefined

	})

}