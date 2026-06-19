import eventalertssql from '../db/queries/eventalerts.js';;
import twitchsql from '../db/queries/twitchauth.js';
import fs from 'fs';
import { app as appConfig } from '../config.js';

export async function initialize(): Promise<void> {

    await eventalertssql.initEventAlerts();
    void initAlertsPathsFS();
    await removeUnusedMedia();

}

async function initAlertsPathsFS(): Promise<void> {

    const twitchIds = await twitchsql.getActiveChannels();
    twitchIds.forEach((twitchId) => {

        try {
            fs.promises.mkdir(`${appConfig.appPath}/resources/alertmedia/${twitchId}`, { recursive: true});
        } catch(err) {
            console.error(`Error creating alerts media directory for user ${twitchId}: ${err}`);
        }

    });

}

async function removeUnusedMedia(): Promise<void> {

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce
    const dbMedia = (await eventalertssql.getAllUserMediaData()).reduce((map, item) => {

        const [key, val] = Object.values(item);
        if(!key || !val) return map;
        if(!map.has(val)) { map.set(val, new Set<string>()); }

        map.get(val)?.add(key);
        return map;
    }, new Map<string, Set<string>>());

    if(!dbMedia) return;
    for(const user of dbMedia.keys()) {
        // Array of media filenames stored on server for the given user
        const userStoredMedia = await fs.promises.readdir(`${appConfig.appPath}/resources/alertmedia/${user}`);
        // Set of media filenames actively used in an alert for the given user
        const userActiveMedia = dbMedia.get(user);
        if(!userActiveMedia) continue;

        // Delete all stored media that is not being used in an active alert
        for(const storedFile of userStoredMedia) {
            if(!userActiveMedia.has(storedFile)) {
                try {
                    await fs.promises.unlink(`${appConfig.appPath}/resources/alertmedia/${user}/${storedFile}`);
                } catch (e) {
                    console.error(`Could not delete media file ${user}/${storedFile}`);
                }
            }
        }
    }

}

export * as default from './eventalertsclient.js';