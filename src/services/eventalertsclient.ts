import eventalertssql from '../db/queries/eventalerts.js';;
import twitchsql from '../db/queries/twitchauth.js';
import fs from 'fs';
import { app as appConfig } from '../config.js';

export async function initialize() {

    await eventalertssql.initEventAlerts();
    void initAlertsPathsFS();


}

async function initAlertsPathsFS() {

    const twitchIds = await twitchsql.getActiveChannels();
    twitchIds.forEach((twitchId) => {

        try {
            fs.promises.mkdir(`${appConfig.appPath}/resources/alertmedia/${twitchId}`, { recursive: true});
        } catch(err) {
            console.error(`Error creating alerts media directory for user ${twitchId}: ${err}`);
        }

    });

}

export * as default from './eventalertsclient.js';