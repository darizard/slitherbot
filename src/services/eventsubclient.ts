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
import type { CreateSubscriptionRequestBody, CreateSubscriptionSuccessResponse, TwitchEventSubNotification, 
				WebhookCallbackChallengeRequest, EventSubCondition, SubscriptionType, 
				SlitherUserEventSubscription, SlitherAppEventSubscription } from '../types/eventsubtypes.js'
import appsql from '../db/queries/appauth.js'
import eventsubsql from '../db/queries/eventsub.js'
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
	const twitchSubs = await fetchAllSubscriptions()
	if(!twitchSubs) {
		console.error(`Error retrieving Event Subscription infromation from Twitch. Unable to manage EventSub subscriptions.`)
		return
	}

	// For each user, ensure that both Twitch and the DB have a subscription for all of the required event types, and that their IDs match
	
	// 1. Loop through all of the twitch subs and assign the subscription ID to each {user, subType} value via a map.
	// App-level sub types will map the subscription ID to the type only
	const twitchUserSubs = new Map<{ channel_id: string, type: SubscriptionType }, string>()
	const twitchAppSubs = new Map<SubscriptionType, string>()

	twitchSubs.forEach((twitchSub) => {
		if(twitchSub.status !== 'enabled') {

			handleDisabledSubscription(twitchSub) // TODO: Implement this. Delete sub from DB and take any necessary steps
			twitchSubs.delete(twitchSub)

		} else if(SlitherEventSub.requiredAppTypes.has(twitchSub.type)) {

			twitchAppSubs.set(twitchSub.type, twitchSub.id)
	
		} else if(SlitherEventSub.requiredUserTypes.has(twitchSub.type)) {

			const subUserId = SlitherEventSub.broadcasterOf(twitchSub.condition, twitchSub.type)
			if(!subUserId) return
			twitchUserSubs.set({ channel_id: subUserId, type: twitchSub.type}, twitchSub.id)
			
		} else { 

			// TODO: Subscription type is unsupported. Delete via the Twitch API.
			twitchSubs.delete(twitchSub)

		}
	})

	// Maps are built for Event Subscriptions on both Twitch and DB sides. Begin by matching each Twitch-side sub ID to its
	// corresponding DB-side sub ID. For any conflicts, update the DB to show the Twitch-side ID. When the match is complete,
	// remove the corresponding entry from both Twitch-side and DB-side map objects
	const dbUserSubsToUpsert = new Set<SlitherUserEventSubscription>()
	twitchUserSubs.entries().forEach((twitchUserSub) => {
		const key = twitchUserSub[0]
		const twitchSubId = twitchUserSub[1]
		
		const matchingIdFromDb = dbUserSubs.get(key)
		if(matchingIdFromDb === undefined || matchingIdFromDb !== twitchSubId) {
			dbUserSubsToUpsert.add({

				id: twitchSubId,
				channel_id: key.channel_id,
				type: key.type,
				version: SlitherEventSub.versionOf(key.type) || ''
			})
		}

		// This .delete(key) call ensures that, after the loop, dbUserSubs will only contain records
		// that still do not match any enabled subscriptions from the Twitch API. Slither will need
		// to subscribe to these required events with Twitch and update the DB with those sub ids
		if(matchingIdFromDb !== undefined) { dbUserSubs.delete(key) }
	})

	const dbAppSubsToUpsert = new Set<SlitherAppEventSubscription>()
	twitchAppSubs.entries().forEach((twitchAppSub) => {
		const key = twitchAppSub[0]
		const twitchSubId = twitchAppSub[1]

		const matchingIdFromDb = dbAppSubs.get(key)
		if(matchingIdFromDb === undefined || matchingIdFromDb !== twitchSubId) {

			dbAppSubsToUpsert.add({
				id: twitchSubId,
				type: key,
				version: SlitherEventSub.versionOf(key) || ''
			})

		}
		
		// This .delete(key) call ensures that, after the loop, dbAppSubs will only contain records
		// that still do not match any enabled subscriptions from the Twitch API. Slither will need
		// to subscribe to these required events with Twitch and update the DB with those sub ids
		if(matchingIdFromDb !== undefined) { dbAppSubs.delete(key) }
	})

	if(dbUserSubsToUpsert.size > 0) await eventsubsql.upsertUserEventSub([...dbUserSubsToUpsert])
	if(dbAppSubsToUpsert.size > 0) await eventsubsql.upsertAppEventSub([...dbAppSubsToUpsert])

	// TODO: Create missing required subscriptions here

}

async function fetchAllSubscriptions(): Promise<Set<TwitchEventSubNotification> | undefined> {

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
		const resData = (await res.json()).data as TwitchEventSubNotification[]
		if(resWasOk) return new Set(resData)
		return undefined

	})

	return subsFromTwitch
}

// Slither needs to keep subscriptions active for events which signify users authorizing or revoking its access
// to their events and data. TODO: Look into requirements for what needs to be done with this data when revocations
// come through
async function ensureUserAuthorizationSubscriptions(): Promise<void> {

	const authSubCondition: EventSubCondition = { client_id: twitchConfig.clientId }
	const authEventIds = await appsql.getAuthorizationEventSubscriptionIDs() // DB call
	let grant_id, revoke_id


	if(!authEventIds?.grant_id) {

		const eventsubRequest: CreateSubscriptionRequestBody = {
			type: 'user.authorization.grant',
			version: '1',
			condition: authSubCondition,
			transport: SlitherEventSub.subscriptionCreationTransport
		}

		const authGrantSubResponse = await subscribeToEventLegacy(eventsubRequest)
		grant_id = authGrantSubResponse?.id
		if(!grant_id) {
			// TODO: Elevate this, potentially to sending the admin an email. We should always be subscribed to user
			// authorization events no matter what
			console.error(`Error subscribing to User Authorization Grant events. Investigate on priority.`)
		}
	}

	if(!authEventIds.revoke_id) {

		const eventsubRequest: CreateSubscriptionRequestBody = {
			type: 'user.authorization.revoke',
			version: '1',
			condition: authSubCondition,
			transport: SlitherEventSub.subscriptionCreationTransport
		} 

		const authRevokeSubResponse = await subscribeToEventLegacy(eventsubRequest)
		revoke_id = authRevokeSubResponse?.id
		if(!revoke_id) {
			console.error(`Error subscribing to User Authorization Revoke events. Investigate on priority.`)
		}
	}
}

export async function registerNewEventSubscription(challengeReq: WebhookCallbackChallengeRequest): Promise<void> {

	// user.authorization.[grant/revoke] are special events that Slither maintains one of each of.
	// They are maintained in the AppInfo DB table and not in the EventSubSubscription table.

	// I may add another table to maintain App-level event subscriptions, but for now separate them
	// between Authorization events and everything else
	switch(challengeReq.subscription.type) {
		case 'user.authorization.grant':
			await appsql.updateAuthorizationEventSubscriptionIDs({ grant_id: challengeReq.subscription.id })
			break

		case 'user.authorization.revoke':
			await appsql.updateAuthorizationEventSubscriptionIDs({ revoke_id: challengeReq.subscription.id })
			break

		// All other events Slither currently subscribes to use a User Access Token
		default:
			const twitchId = challengeReq.subscription.condition.broadcaster_user_id ?? 
							 challengeReq.subscription.condition.to_broadcaster_user_id ??
							 challengeReq.subscription.condition.user_id

			if(!twitchId) {
				console.error(`Error registering Event Subscription: Could not retrieve twitch ID from object condition.`)
				break
			}
			
			const dbSub = {
				id: challengeReq.subscription.id,
				channel_id: twitchId,
				type: challengeReq.subscription.type,
				version: SlitherEventSub.versionOf(challengeReq.subscription.type) ?? ''
			}
			await eventsubsql.upsertUserEventSub(dbSub)

	}

}

export async function handleDisabledSubscription(subscription: TwitchEventSubNotification): Promise<void> {

	await unsubscribeFromEvent(subscription)

}

async function unsubscribeFromEvent(subscription: TwitchEventSubNotification): Promise<boolean> {

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


async function subscribeToEvent(channelId: string, subType: SubscriptionType): Promise<string | undefined> {

	const appToken = await getValidatedSlitherAppToken()
	const reqHeaders = { 			
			'Authorization': `Bearer ${appToken}`,
			'Client-Id': twitchConfig.clientId,
			'Content-Type': 'application/json'
	}

	const reqBody: CreateSubscriptionRequestBody = {

		type: subType,
		version: SlitherEventSub.versionOf(subType) ?? '',
		condition: SlitherEventSub.conditionOf(channelId, subType) ?? {},
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
			// We already have the requested subscription. Register the subscription.
		}
		// TODO: Elevate this error. We should never have a problem subscribing to an event.
		console.error(`Subscribing to event of type ${subType} failed. Response object: ${JSON.stringify(subscribeResult)}`)
		return undefined

	})

}

async function subscribeToEventLegacy(request: CreateSubscriptionRequestBody): Promise<CreateSubscriptionSuccessResponse | undefined> {

	const appToken = await getValidatedSlitherAppToken()
	const reqHeaders = { 			
			'Authorization': `Bearer ${appToken}`,
			'Client-Id': twitchConfig.clientId,
			'Content-Type': 'application/json'
	}

	return await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions`, {
		method: 'POST',
		headers: reqHeaders,
		body: JSON.stringify(request)
	}).then(async (res) => {

		const subscribeResult = await res.json()
		if(res.ok) return subscribeResult
		if(res.status === 409) {
			
		}
		// TODO: Elevate this error. We should never have a problem subscribing to an event.
		console.error(`Subscribing to event of type ${request.type} failed. Response object: ${JSON.stringify(subscribeResult)}`)
		return undefined

	})

}