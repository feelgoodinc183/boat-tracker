# Phase H0: range test guide

One afternoon on the water with the boards you already have (1× Heltec V4, 2× T-Echo), using stock Meshtastic firmware. No TMTRAC code needed.

## What this test answers

1. **How far** does a T-Echo on a dinghy reach the gateway, with the gateway antenna at deck height and on a pole?
2. **How many packets get lost** at normal racing distances (under 2 km)?
3. **What happens** when the crew sits on or over the tracker, and during a capsize?
4. **How long** does a T-Echo battery last with GPS on?

Why Meshtastic: its **ShortFast** preset uses exactly the radio settings planned for TMTRAC's own firmware (SF7, 250 kHz bandwidth, coding rate 4/5, checked in Meshtastic's firmware source). So the range we measure is the range we'll get.

## Roles

| Board | Role | Where |
|---|---|---|
| Heltec V4 | **Receiver**, logs every packet to a file | Committee boat (or shore) |
| T-Echo A | **Sender**, the "racing dinghy" | Mounted on a dinghy where a tracker would really go |
| T-Echo B | **Sender**, the "range finder" | On a RIB that drives out until the signal stops |

The receiver has to be the Heltec: Meshtastic can only save the log file on ESP32 boards, and the Heltec is one.

## What to bring

- The three boards, charged, with their antennas.
- A power bank and USB-C cable for the Heltec (it has no battery of its own unless you've fitted one).
- **Two phones with a GPS tracking app** that can export GPX files (one on the dinghy, one on the RIB), in waterproof pouches. These record exactly where each boat was. More reliable than Meshtastic's own position reports, which it sends only every few minutes.
- A third phone for the committee boat with mobile data, used as a WiFi hotspot for the Heltec.
- Dry bags or pouches for the T-Echos (their cases aren't waterproof).
- A pole or boathook to lift the Heltec antenna 3 to 5 m, and tape or cable ties.
- A tape measure for antenna heights, and the notes sheet at the end of this guide.

---

## Before test day (at home, about 1 hour)

### 1. Update firmware
Flash the latest **stable** Meshtastic firmware on all three boards from the official web flasher (flasher.meshtastic.org, in Chrome on a computer). Use the same version on all three.

### 2. Settings on all three boards
In the Meshtastic app (connect to each board in turn):

| Setting | Value | Why |
|---|---|---|
| LoRa → Region | `MY_919` | Malaysia |
| LoRa → Modem preset | `Short Fast` | Same radio settings as TMTRAC firmware |
| LoRa → Override frequency | `920.125` MHz | Keeps the test inside 919 to 923 MHz, where MCMC places no duty-cycle conditions |
| LoRa → TX power | `0` (means "region maximum") | 27 dBm cap for Malaysia. T-Echos top out lower on their own |
| Device → Role | `CLIENT_MUTE` | Stops boards relaying each other's packets, which would make range look better than it is |
| Channel | A new private primary channel, e.g. `tmtrac-test`, with a random key. Share it to all three by QR code | Keeps the test off the public mesh and stops strangers' packets mixing into the log |

### 3. Range Test module

| Setting | Heltec (receiver) | T-Echo A and B (senders) |
|---|---|---|
| Enabled | On | On |
| Sender message interval | `0` (receive only) | `15` seconds |
| Save CSV file | **On** | Off |
| Clear on reboot | **Off** (or a reboot deletes your results) | Off |

Senders stop by themselves after 8 hours. Restart them the morning of the test if you set them up the night before.

### 4. Heltec WiFi
Network → WiFi on, and join it to the **committee boat phone's hotspot**. Do this now, not on the day: changing network settings reboots the board.
- WiFi gives the Heltec the correct time, so the log can be matched with the GPS tracks.
- It lets you open the log on the hotspot phone without rebooting: `http://<heltec-ip>/rangetest.csv` (the IP is on the Heltec's screen).
- On ESP32 boards, WiFi switches Bluetooth off. That's fine; you won't need it on the day.

### 5. Bench check
Put all three on a desk for 2 minutes. Open the CSV link on the hotspot phone. You should see rows from both T-Echos, a new one every 15 s from each. If not, check that all three are on the same channel and preset.

### 6. Battery test (separate day)
With T-Echo B fully charged, GPS on and sending every 15 s, leave it running and note when it switches off. Write down start and end times. Our own firmware will send more often but sleep between sends, so treat this as a rough baseline.

---

## On the water

Note the time at the start and end of every run on the notes sheet. Times matter more than anything else.

### Setup (committee boat)
1. Power the Heltec from the power bank, antenna vertical, in a dry bag with the antenna sticking out.
2. Turn on the hotspot. Check the CSV link opens.
3. Drop a pin on the phone map where the committee boat is anchored. Screenshot it with the coordinates. If the boat swings a lot, take the pin from the middle.
4. Measure the antenna height above the water.

### Run 1: normal racing (30 to 45 min, antenna at deck height)
- T-Echo A on the dinghy, mounted where a tracker would really go (aft deck or base of the mast), antenna up. GPS tracking app running on the dinghy phone.
- Sail normally around a course near the committee boat, out to the distance a real course would be.
- Note times when the crew sits on or over the tracker for a while.

### Run 2: maximum range (antenna at deck height)
- T-Echo B on the RIB, tracking app running.
- Drive away from the committee boat in a straight line at a steady speed, past the furthest your races ever go.
- On the hotspot phone, refresh the CSV. When no new T-Echo B rows have arrived for 2 minutes, call the RIB (VHF or phone). It goes 500 m further, then comes back the same way.

### Run 3: maximum range (antenna on a pole)
- Lift the Heltec antenna as high as practical on the pole. Measure the new height.
- Repeat run 2 on the same line.

### Run 4: capsize (only if conditions are safe)
- With T-Echo A still mounted, capsize the dinghy and hold it over for about 1 minute, then right it.
- Note the time it went over and the time it came up.

### Before leaving the committee boat
**Download the CSV** from `http://<heltec-ip>/rangetest.csv` on the hotspot phone and save it. Only then switch off the Heltec.

Export the GPX tracks from both tracking phones.

---

## After the test

Send me:
1. `rangetest.csv` from the Heltec
2. The two GPX tracks (dinghy and RIB)
3. The notes sheet (a photo is fine)
4. The battery test start and end times

From these I'll work out:
- packet loss against distance
- signal-to-noise against distance, which tells us how much margin there is before the link fails
- the maximum range at each antenna height
- the effect of crew blocking and the capsize

The results go into `docs/phase0-results.md`. They decide the tracker model, the gateway antenna setup, and whether SF7 / 250 kHz is the right setting.

## Notes sheet

| Item | Value |
|---|---|
| Date, venue | |
| Weather, wind, sea state | |
| Committee boat position (lat, lon) | |
| Heltec antenna height, deck (m) | |
| Heltec antenna height, pole (m) | |
| T-Echo A mounting position on dinghy | |
| Dinghy class | |
| Run 1 start / end | |
| Crew-over-tracker times | |
| Run 2 start / turn / end | |
| Run 3 start / turn / end | |
| Capsize over / up times | |
| Anything odd (rain, other boats, board restarts) | |
