# Slither Twitch Helper - v0.0.2

Slither is a remote-hosted Twitch alerts handling application. This is a personal project aimed at learning! It currently features the ability to listen to Twitch EventSub Custom Channel Point Reward Redemption events and display an alert in a browser, similar to StreamElements or StreamLabs, but of course in a limited capacity.

v0.0.2 only triggers one kind of alert for all channel point redeems. Lots of customizability to come!

Thanks for looking. :\)

## Future Plans

v0.1 will be complete when all functionality surrounding EventSub event maintenance is implemented. I still need to handle external subscription changes, such as Twitch revocations, across the application. After this, alert customization will be the focus.

## Features

- 🎉 Real-time Twitch alerts via EventSub
  - Channel Point Redemptions
- 🔒 Secure authentication and authorization with Twitch OAuth and server-issued JWTs
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
├── classes/       # Custom classes for abstraction
├── db/            # Database and Kysely config
    └── queries/   # DB Queries
├── routes/        # Route controllers
├── services/      # Business logic
├── types/         # TypeScript type definitions
└── views/         # EJS templates
    ├── test/      # Test pages
    └── slither/   # Twitch-related pages
public/            # Static assets
```

## License

This project is licensed under the MIT License - see [LICENSE.md](LICENSE.md) for details.

## Acknowledgments

- [Twitch](https://dev.twitch.tv) for their EventSub API and friendly documentation
- [Kysely](https://kysely.dev/) for supporting TypeScript on the DB side
- [Twurple](https://twurple.js.org) for their excellent Twitch API wrapper that initially helped this project get started!