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
import { getValidatedSlitherAppToken } from './twitchauth.js';
import { twitch as twitchConfig } from '../config.js';
import type { CreateSubscriptionRequestBody, TwitchEventNotification, 
				WebhookCallbackChallengeRequest, SubscriptionType, 
				SlitherEventSubscription } from '../types/eventsubtypes.js';

// DB imports
import eventsubsql from '../db/queries/eventsub.js';
import twitchauthsql from '../db/queries/twitchauth.js';

// internal classes
import { SlitherEventSub } from '../classes/eventsub.js';

// removed imports - reminder to implement these more completely in other apps on the server
// import { setMic1Mute as setMuteOBS } from './obsclient.js';
// import { setDariMicMute as setMuteDiscord } from './discordclient.js';

export * as default from './eventsubclient.js';

// TODO: Look into using Slither's registered Twitch Client ID rather than an arbitrary '.' string literal in the database.
//		 Also brainstorm / research best practices for this kind of scenario.

/*************************************************************************
 * Establishes a Twitch App Access Token for SlitherBot and maintains EventSub
 * Subscriptions. The server must ensure all App and User Access Tokens are 
 * validated and updated in the database before calling this message.
 *************************************************************************/
export async function initialize(): Promise<void> {

	// Validates App Access Token in DB, then obtains and immediately validates a new one if necessary
	const appToken = await getValidatedSlitherAppToken();
	if(!appToken) {
		console.error(`Failed to obtain an app access token on initial connection. Unable to manage EventSub subscriptions.`);
		return;
	}

	const activeUserIds = await twitchauthsql.getActiveChannels();

	// Query all Slither's Event Subscription details from the database and map each value 'id' to key '{ channel_id, type }'
	const dbSubsMap = await eventsubsql.getAllSubscriptions()
		.then((allSubs) => {

			const dbSubMap = new Map<{ channel_id: string, type: SubscriptionType }, string | null>();
			allSubs.forEach((dbUserSub) => { 
				dbSubMap.set({ channel_id: dbUserSub.channel_id, type: dbUserSub.type }, dbUserSub.id); 
			});
			return dbSubMap;

		});
	
	if(!dbSubsMap) {
		console.error(`Internal error retrieving Subscription IDs to initizalize the Event Sub client. Unable to manage EventSub subscriptions.`);
		return;
	}

	// Fetch all of Slither's EventSub Subscriptions from Twitch
	const twitchSubs = await fetchAllTwitchSubscriptions();
	if(!twitchSubs) {
		console.error(`Error retrieving Event Subscription infromation from Twitch. Unable to manage EventSub subscriptions.`);
		return;
	}

	// Compare subscription ids of all required event types received from Twitch to the information in the DB and update
	// every subscription in the DB with Twitch's sub id. Afterward, for all required subscriptions for active users
	// which still have an id of NULL, subscribe to the related events via the Twitch API and update the sub IDs in the DB
	
	
	// 1. Loop through all of the twitch subs and assign the subscription ID to each {user, subType} value via a map.
	// App-level sub types will map the subscription ID to the type only
	const dbSubsToUpsert = new Set<SlitherEventSubscription>();

	twitchSubs.forEach((twitchSub) => {
		let channelId = '';

		// If sub is disabled on Twitch's end, handle disabled sub and return
		if(twitchSub.status !== 'enabled') {
			handleDisabledSubscription(twitchSub);
			return;
		} 
		// Set channel ID according to sub type
		else if(SlitherEventSub.isAppSubType(twitchSub.type)) { channelId = '.'; } 
		else if(SlitherEventSub.isUserSubType(twitchSub.type)) { channelId = SlitherEventSub.broadcasterOf(twitchSub.condition, twitchSub.type); }
		// Handle [disabled/unsupported] sub and return if the sub type is unsupported
		else {

			// TODO: Elevate error, we have an unexpected event subscription with Twitch
			console.error(`Unexpected event subscription returned by Twitch API, id = ${twitchSub.id}. Investigate.`);
			handleDisabledSubscription(twitchSub);
			return;

		}

		// TODO: Look into hashing object keys in order to prevent this from being O(twitchSubs * dbSubs) = O(n^2)
		// Pull sub ID Slither has in its database for the record matching the given values of [user, type]
		const subIdFromDb = dbSubsMap.entries().find((entry) => {
			return (entry[0].channel_id === channelId && entry[0].type === twitchSub.type);
		})?.[1];

		// If undefined or does not match what Twitch shows, add to Set to be upserted into the EventSubs table
		if(subIdFromDb !== twitchSub.id) {
			
			dbSubsToUpsert.add({
				channel_id: channelId,
				id: twitchSub.id,
				type: twitchSub.type,
				version: SlitherEventSub.versionOf(twitchSub.type)
			});
			
		}
	})

	if(dbSubsToUpsert.size > 0) await eventsubsql.upsertEventSub([...dbSubsToUpsert]);

	// All database eventsubs have been synced to the subscription information received from the Twitch API
	// For any required subs for active users that are still missing from the database, subscribe to the event.
	// The database update will be handled by the /slither/event endpoint after a Twitch webhook callback 
	// verification request.
	const requiredSubs: Set<SlitherEventSubscription> = SlitherEventSub.getAllRequiredSubscriptions(activeUserIds);
	const registeredSubs: Set<SlitherEventSubscription> = await eventsubsql.getSubscriptionsForUsers(activeUserIds.concat(['.']));
	
	// Find the Set difference of Set<{ requiredSubs.channel_id, requiredSubs.type }> - Set<{ registeredSubs.channel_id, registeredSubs.type }>
	requiredSubs.forEach(async (requiredSub) => {
		if(!registeredSubs.values().find((registeredSub) => {
			return registeredSub.channel_id === requiredSub.channel_id && registeredSub.type === registeredSub.type
		})) {

			// If none of the registered subs matches the current required sub being checked, subscribe to it with Twitch
			await subscribeToEvent(requiredSub.type, requiredSub.channel_id);

		}
	});

}

export async function registerNewEventSubscription(challengeReq: WebhookCallbackChallengeRequest): Promise<void> {
	
	if(SlitherEventSub.isAppSubType(challengeReq.subscription.type)) {
		const dbSub = {
			channel_id: '.',
			id: challengeReq.subscription.id,
			type: challengeReq.subscription.type,
			version: SlitherEventSub.versionOf(challengeReq.subscription.type)
		};

		await eventsubsql.upsertEventSub(dbSub);

	// All other events Slither currently subscribes to use a User Access Token
	} else if(SlitherEventSub.isUserSubType(challengeReq.subscription.type)) {
		const twitchId = SlitherEventSub.broadcasterOf(challengeReq.subscription.condition, challengeReq.subscription.type);

		if(!twitchId) {
			console.error(`Error registering Event Subscription: Could not retrieve twitch ID from object condition.`);
			return;
		}
		
		const dbSub = {
			id: challengeReq.subscription.id,
			channel_id: twitchId,
			type: challengeReq.subscription.type,
			version: SlitherEventSub.versionOf(challengeReq.subscription.type)
		};

		await eventsubsql.upsertEventSub(dbSub);
	} else {

		console.error(`Error registering Event Subscription: Unsupported event type: ${challengeReq.subscription.type}`);

	}
}

export async function deregisterEventSubscription(subscription: TwitchEventNotification): Promise<void> {

		await eventsubsql.deleteEventSub(subscription.id);

}

export async function handleDisabledSubscription(subscription: TwitchEventNotification): Promise<void> {

	await unsubscribeFromEvent(subscription);
	await deregisterEventSubscription(subscription);

}

async function fetchAllTwitchSubscriptions(): Promise<Set<TwitchEventNotification> | undefined> {

	const appToken = await getValidatedSlitherAppToken();

	// A set containing all of the Subscription data objects Twitch has for Slither's app token
	const subsFromTwitch = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions`, { method: 'GET',
																		headers: {
																			Authorization: `Bearer ${appToken}`,
																			'Client-Id': twitchConfig.clientId
																		}
																	})
	.then(async (res) => {

		const resWasOk = res.ok;
		const resData = (await res.json()).data as TwitchEventNotification[];
		if(resWasOk) return new Set(resData);
		return undefined;

	});

	return subsFromTwitch;
}

// Subscribe to User event if channelId is provided, otherwise subscribe to App event.
export async function subscribeToEvent(eventType: SubscriptionType, channelId: string): Promise<string | undefined> {

	const appToken = await getValidatedSlitherAppToken();
	const reqHeaders = { 			
			'Authorization': `Bearer ${appToken}`,
			'Client-Id': twitchConfig.clientId,
			'Content-Type': 'application/json'
	};

	let reqBody: CreateSubscriptionRequestBody;
	if(!SlitherEventSub.isAppSubType(eventType) &&
	   !SlitherEventSub.isUserSubType(eventType)) {

		console.error(`Cannot subscribe to unsupported event type: ${eventType}`);
		return undefined;

	}

	reqBody = {

		type: eventType,
		version: SlitherEventSub.versionOf(eventType),
		condition: SlitherEventSub.conditionOf(eventType, channelId),
		transport: SlitherEventSub.subscriptionCreationTransport

	};

	return await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions`, {
		method: 'POST',
		headers: reqHeaders,
		body: JSON.stringify(reqBody)
	}).then(async (res) => {

		const subscribeResponse = await res.json();
		if(res.ok) return subscribeResponse.data.id;
		if(res.status === 409) {
			// TODO: Hit the Twitch API to find the id of the related subscription and register the subscription in the database
			console.error(`Already subscribed to event type ${eventType} for channel id ${channelId}. 409 response received from Twitch.`);
			return undefined;
		}
		// TODO: Elevate this error. We should never have a problem subscribing to an event
		console.error(`Subscribing to event of type ${eventType} failed. Response object: ${JSON.stringify(subscribeResponse)}`);
		return undefined;

	});

}

async function unsubscribeFromEvent(subscription: TwitchEventNotification): Promise<boolean> {

	const appToken = await getValidatedSlitherAppToken();

	return await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscription.id}`, { method: 'DELETE',
																									 headers: {
																										Authorization: `Bearer ${appToken}`,
																										'Client-Id': twitchConfig.clientId
																									 }
																							})
	.then(async (res) => {
		
		// TODO: Elevate error. Something is wrong if we have a subscription ID we can't delete
		if(!res.ok) {
			console.error(	`Unsuccessful deletion of subscription type ${subscription.type}, `,
						  	`authorizer object: ${JSON.stringify(subscription.condition)} `,
						  	`error code ${res.status}`);
		} else {
			console.log(`Successfully deleted subscription id ${subscription.id}`);
		}

		return res.ok;

	})

}