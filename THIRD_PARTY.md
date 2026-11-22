# Third-party data and licences

This repository contains **no third-party source code** beyond normal npm dependencies (see each `package.json`).

| Data                                                                                            | Used for                                                                  | Licence             | Credit                                                          |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------- |
| F1 25 session recordings from [SpeedHQ/RaceIQ](https://github.com/SpeedHQ/RaceIQ)               | Race Engineering: lap comparison (converted files only)                   | AGPL-3.0, data only | "Data: F1 25 session recordings from SpeedHQ/RaceIQ (AGPL-3.0)" |
| Race exports from [linuz90/f1-telemetry-viewer](https://github.com/linuz90/f1-telemetry-viewer) | Race Engineering: strategy and replay (Sakhir, Spa; converted files only) | MIT                 | linuz90/f1-telemetry-viewer                                     |
| [OpenF1](https://openf1.org)                                                                    | Documented fallback only, not shipped                                     | CC BY-NC-SA 4.0     | OpenF1                                                          |

- Converted session files replace player names with fictional handles. Raw recordings are never committed.
- The recording reader and packet parsers are our own code, written from EA's public F1 25 UDP specification. No RaceIQ code is copied or adapted; `scripts/check-licence-guard.sh` checks this in CI.
- Unofficial project. Not affiliated with, endorsed by or connected to Formula 1, the FIA, EA Sports, Codemasters or any team.
