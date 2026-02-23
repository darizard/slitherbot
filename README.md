# SlitherBot Twitch Helper - v0.0.1

SlitherBot is a remote-hosted Twitch alerts handling application. This is a personal project aimed at learning! Its initial commit features the ability to listen to Twitch EventSub events and display an alert in a browser in response to any channel point reward being redeemed, similar to StreamElements or StreamLabs, but of course in an incredibly limited capacity. 

v0.0.1 only works with my channel.

Thanks for looking. :\)

## Features

- 🎉 Real-time Twitch alerts via EventSub
  - Channel Point Redemptions
- 🔒 Secure authentication with Twitch OAuth
- ⚡ Low-latency WebSocket delivery
- 🖥️ Easy OBS integration

## Tech Stack

- Apache2 Web Server with SSL
- Node.js + Express.js
- TypeScript
- EJS templating
- MySQL

### Project Structure

```
src/
├── db/            # Database and Kysely config
    ├── models/    # Data models
    └── queries/   # DB Queries
├── routes/        # Route controllers
├── services/      # Business logic
├── views/         # EJS templates
    ├── test/      # Test pages
    └── twitch/    # Twitch-related pages
└── websocket/     # Internal Websocket Server
public/            # Static assets
```

## License

This project is licensed under the MIT License - see [LICENSE.md](LICENSE.md) for details.

## Acknowledgments

- [Twitch](https://dev.twitch.tv) for their EventSub API and friendly documentation
- [Twurple](https://twurple.js.org) for their excellent Twitch API wrapper
- [Kysely](https://kysely.dev/) for supporting TypeScript on the DB side