# Meshtastic racing profiles (draft)

Settings for every device in a TMTRAC race, using stock Meshtastic firmware. **Draft:** the numbers get confirmed by the Phase M0 test before clubs use them.

Settings names are as they appear in the Meshtastic app and in the firmware's config (`position_broadcast_secs` and so on). They were checked against the Meshtastic firmware source on 2026-11-07 (commit `b2517c1`). Menus move between app versions, but the setting names stay the same.

---

## 1. Settings for every device

| Setting | Value | Why |
|---|---|---|
| LoRa → Region | `MY_919` | Malaysia |
| LoRa → Modem preset | `Short Fast` (SF7, 250 kHz) | Shortest airtime with good range, so more boats fit on a frequency |
| LoRa → Override frequency | The course's frequency (table below) | Keeps every device inside 919 to 923 MHz, where MCMC sets no duty-cycle conditions, and separates the courses |
| LoRa → TX power | `0` (region maximum, 27 dBm) | If a keelboat or shore antenna has more than 2 dBi gain, lower this by the extra gain |
| LoRa → Ignore MQTT | On | Ignores packets that passed through the internet on their way, so outside traffic doesn't take up race airtime |
| Primary channel | The event's channel: name and random 256-bit key from TMTRAC | Encrypts positions, so nobody can read them live and get around the spectator delay |
| Channel → Position precision | Full (32 bits) | Meshtastic otherwise rounds positions, in some defaults to about 90 m or coarser |

| Course | Frequency |
|---|---|
| Course A | 919.875 MHz |
| Course B | 920.875 MHz |
| Course C | 921.875 MHz |
| Coastal / passage races | 922.625 MHz |

**Never use the default public channel for racing.** On it, Meshtastic forces positions to be sent at most once an hour and rounds them to roughly 1 km.

---

## 2. Inshore tracker (dinghies and keelboats on a buoy course)

| Setting | Value | Why |
|---|---|---|
| Device → Role | `TRACKER` | Meshtastic doesn't slow trackers down when the mesh is busy, and lets them send until the channel is 40% busy (other roles stop at 25%) |
| Device → Rebroadcast mode | `NONE` | All boats are in range of the receiver, so relaying only doubles the airtime |
| LoRa → Hop limit | `0`, or the lowest the app allows | Same reason: tells other devices not to pass this tracker's packets on |
| Power → Power saving | **Off** | With power saving on, a Tracker sleeps between sends and clears its GPS position on waking, which would make every fix late or missing |
| Position → GPS mode | Enabled | |
| Position → GPS update interval | `5` seconds | Keeps the position fresh. The default is 2 minutes |
| Position → Broadcast interval | `10` seconds | See PLAN.md section 2 for the capacity sums |
| Position → Smart position | Off | Sends every 10 s whatever the boat is doing, so the server gets a steady track |
| Position → Fixed position | Off | |
| Position → Flags | Timestamp, Sequence number, Speed, Heading | Time and sequence let the server dedupe and count lost packets. Altitude and the rest add airtime for nothing on the water |
| Telemetry → Device metrics interval | `300` seconds | Battery level every 5 minutes for the pre-start check. Negligible airtime |

**Dinghies:** T-Echo in a dry pouch or sealed box, tied on, antenna pointing up, mounted in the same place on every boat (aft deck or base of the mast).

**Keelboats:** powered from the boat's 12 V supply, with an external antenna on the pushpit or higher. Can stay on the boat for the season.

---

## 3. Coastal and passage tracker

Same as the inshore tracker, except:

| Setting | Value | Why |
|---|---|---|
| Override frequency | 922.625 MHz | Coastal channel |
| Device → Rebroadcast mode | `LOCAL_ONLY` | Boats relay each other's positions toward shore, but only on our own channel, so they don't spend airtime on unrelated public traffic |
| LoRa → Hop limit | `3` | Up to 3 relays between a boat and a shore station |
| Position → Broadcast interval | `120` seconds (coastal), up to `300` (long passage) | Plenty for races that last hours or days, and leaves airtime for relaying |
| Power → Power saving | Off on 12 V boats. On is acceptable for battery-only trackers at 300 s | At 5 minutes, the GPS has time to get a fix again after each sleep |

---

## 4. Committee boat receiver (one per course)

| Setting | Value | Why |
|---|---|---|
| Hardware | Heltec V4, external antenna on a pole as high as practical | Antenna height decides dinghy range more than anything else |
| Override frequency | The course's frequency | One receiver hears one course |
| Device → Role | `CLIENT_MUTE` | Receives everything, relays nothing |
| Bluetooth | On, paired with the RO phone running the TMTRAC app | The phone uploads positions, and keeps them when there's no signal |
| Power | Power bank or the committee boat's 12 V | |

---

## 5. Shore station (coastal races)

| Setting | Value | Why |
|---|---|---|
| Hardware | Meshtastic board on a mast on high ground, mains or solar power, outdoor enclosure | Height gives range: from a 30 m hill to a 15 m masthead, the radio horizon is about 40 km |
| Override frequency | 922.625 MHz | Coastal channel |
| Device → Role | `ROUTER` | A well-placed fixed station is exactly what Meshtastic's router role is for |
| Network | WiFi, or Ethernet / a 4G router | Internet for MQTT |
| MQTT → Enabled | On, pointing at the TMTRAC broker (on the Oracle VPS), with its own username and password | tmtrac's bridge reads positions from there |
| MQTT → Encryption enabled | On | Packets stay encrypted with the event key on the broker; tmtrac decrypts them with the key it already holds |
| Channel → Uplink enabled | On, for the race channel only | Sends race positions to MQTT, nothing else |
| Ignore MQTT | On | Never puts internet traffic back on the race frequency |

---

## 6. Before every race

1. Create the event's channel in TMTRAC (name + random key). Load it onto every tracker, receiver and shore station by QR code.
2. Check every tracker shows the right frequency on its screen or in the app.
3. Pre-start check in TMTRAC: every bound tracker heard in the last minute, battery above 50%.
4. After the event, change the key (a new event, a new channel). Old keys are useless to anyone who copied them.

## 7. Firmware version

Clubs should run the version TMTRAC has tested, not "latest". Meshtastic changes how positions are scheduled between releases (for example its rules for busy meshes and for boats that aren't moving). The tested version gets recorded here after Phase M0: **[to be filled in after M0]**.
