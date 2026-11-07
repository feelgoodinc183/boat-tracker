# Phase M0: range and update-rate test

One afternoon on the water with the boards you already have (1× Heltec V4, 2× T-Echo), on stock Meshtastic set up with the racing profiles from [meshtastic-setup.md](meshtastic-setup.md). No TMTRAC code needed.

## What this test answers

1. **How far** does a T-Echo on a dinghy reach the receiver, with the receiver antenna at deck height and on a pole? And from a keelboat, if one is available?
2. **How many positions get lost** at 10-second updates, at normal racing distances?
3. **What happens** when the crew sits on or over the tracker, and during a capsize?
4. **How long** does a T-Echo battery last with GPS on and positions every 10 s?
5. **How busy** does the channel get, as Meshtastic reports it? This checks the capacity sums in PLAN.md section 2.

## Two sessions

| Session | Receiver connected by | What it measures |
|---|---|---|
| **1. Range** | WiFi to a phone hotspot; the Heltec saves a log file | Range and signal margin, using Meshtastic's Range Test messages |
| **2. Racing setup** | Bluetooth to a phone, as on a real race day | Whether 10-second positions arrive, and how many go missing |

The trackers run the racing profile in both sessions; only the receiver changes. That way session 1 also gets fresh positions in its log.

## Roles

| Board | Role | Where |
|---|---|---|
| Heltec V4 | **Receiver** | Committee boat (or shore) |
| T-Echo A | Tracker, the "racing dinghy" | Mounted on a dinghy where a tracker would really go |
| T-Echo B | Tracker, the "range finder" | On a RIB (or a keelboat's pushpit, see run 3) |

The receiver has to be the Heltec: Meshtastic can only save the range log file on ESP32 boards, and the Heltec is one.

## What to bring

- The three boards, charged, with their antennas.
- A power bank and USB-C cable for the Heltec.
- **Two phones with a GPS tracking app** that can export GPX files (dinghy and RIB), in waterproof pouches. These record exactly where each boat was.
- A third phone for the committee boat with mobile data and the Meshtastic app. It's the WiFi hotspot in session 1 and the Bluetooth receiver in session 2.
- Dry bags or pouches for the T-Echos (their cases aren't waterproof).
- A pole or boathook to lift the Heltec antenna 3 to 5 m, and tape or cable ties.
- A tape measure for antenna heights, and the notes sheet at the end of this guide.

---

## Before test day (at home, about 1 hour)

### 1. Update firmware
Flash the latest **stable** Meshtastic firmware on all three boards from the official web flasher (flasher.meshtastic.org, in Chrome on a computer). Use the same version on all three, and **write the version number on the notes sheet**: it becomes the tested version in the setup guide.

### 2. Settings on all three boards
Section 1 of [meshtastic-setup.md](meshtastic-setup.md), with:
- Override frequency: **919.875 MHz** (course A).
- Channel: a new private primary channel, e.g. `tmtrac-test`, with a random key. Share it to all three by QR code.

### 3. T-Echo A and B: inshore tracker profile
Section 2 of [meshtastic-setup.md](meshtastic-setup.md): Tracker role, rebroadcast off, power saving off, GPS every 5 s, position every 10 s, smart position off, flags Timestamp + Sequence number + Speed + Heading.

Plus the Range Test module:

| Setting | T-Echo A and B |
|---|---|
| Enabled | On |
| Sender message interval | `15` seconds |
| Save CSV file | Off |

### 4. Heltec: receiver

| Setting | Value |
|---|---|
| Device → Role | `CLIENT_MUTE` |
| Range Test → Enabled | On |
| Range Test → Sender message interval | `0` (receive only) |
| Range Test → Save CSV file | **On** |
| Range Test → Clear on reboot | **Off** (or a reboot deletes your results) |
| Network → WiFi | On, joined to the **committee boat phone's hotspot** |

Set WiFi at home, not on the day: changing network settings reboots the board. WiFi gives the Heltec the correct time and lets you open the log on the hotspot phone at `http://<heltec-ip>/rangetest.csv` (the IP is on the Heltec's screen). On ESP32 boards WiFi switches Bluetooth off, which is why session 2 changes it back.

Range Test senders stop by themselves after 8 hours. Set up the evening before at the earliest.

### 5. Bench check
All three on a desk for 2 minutes. Open the CSV link on the hotspot phone: you should see rows from both T-Echos, one every 15 s from each, with their positions filled in. If not, check all three share the channel, preset and frequency.

### 6. Battery test (separate day)
With T-Echo B fully charged and set up as above (positions every 10 s, GPS on), leave it running outdoors with a view of the sky and note when it switches off. This is the real race-day setting, so the result is the real race-day battery life.

---

## On the water: session 1, range

Note the time at the start and end of every run on the notes sheet. Times matter more than anything else.

### Setup (committee boat)
1. Power the Heltec from the power bank, antenna vertical, in a dry bag with the antenna sticking out.
2. Turn on the hotspot. Check the CSV link opens.
3. Drop a pin on the phone map where the committee boat is anchored. Screenshot it with the coordinates. If the boat swings a lot, take the pin from the middle.
4. Measure the antenna height above the water.

### Run 1: normal racing (30 min, antenna at deck height)
- T-Echo A on the dinghy, mounted where a tracker would really go (aft deck or base of the mast), antenna up. GPS tracking app running on the dinghy phone.
- Sail normally around a course near the committee boat, out to the distance a real course would be.
- Note times when the crew sits on or over the tracker for a while.

### Run 2: maximum range (antenna at deck height)
- T-Echo B on the RIB, tracking app running.
- Drive away from the committee boat in a straight line at a steady speed, past the furthest your races ever go.
- Refresh the CSV on the hotspot phone. When no new T-Echo B rows have arrived for 2 minutes, call the RIB (VHF or phone). It goes 500 m further, then comes back the same way.

### Run 3: maximum range (antenna on a pole)
- Lift the Heltec antenna as high as practical on the pole. Measure the new height.
- Repeat run 2 on the same line.
- **If a keelboat is out:** do this run with T-Echo B tied to the keelboat's pushpit instead of on the RIB, and note its height above the water. It gives a first idea of keelboat range.

### Run 4: capsize (only if conditions are safe)
- With T-Echo A still mounted, capsize the dinghy and hold it over for about 1 minute, then right it.
- Note the time it went over and the time it came up.

### End of session 1
1. **Download the CSV** from `http://<heltec-ip>/rangetest.csv` on the hotspot phone and save it.
2. On the Heltec's screen or in the app, note **Channel utilization** and **Air util TX**.

---

## On the water: session 2, racing setup (30 min)

### Switch the receiver to Bluetooth
1. In the Meshtastic app on the committee boat phone, connect to the Heltec over WiFi (by its IP address).
2. Network → WiFi **off**. The Heltec reboots. The saved CSV survives because Clear on reboot is off, but you've downloaded it already anyway.
3. Pair the phone with the Heltec over Bluetooth.

### Run 5: racing with both trackers
- T-Echo A on the dinghy, T-Echo B on the RIB or a second boat, both moving around the course at normal racing distances. Tracking apps running.
- Leave the phone connected to the Heltec, screen on if possible, for 30 minutes.

### End of session 2
1. Note **Channel utilization** and **Air util TX** again.
2. Export the position log for each T-Echo from the Meshtastic app (Nodes → select the node → Position log → Save).
3. Export the GPX tracks from both tracking phones.

---

## After the test

Send me:
1. `rangetest.csv` from session 1
2. The two position logs from session 2
3. The GPX tracks from both tracking phones
4. The notes sheet (a photo is fine)
5. The battery test start and end times

From these I'll work out:
- signal-to-noise against distance, which shows how much margin there is before the link fails
- the maximum range at each antenna height, and from a keelboat if you tested one
- the share of 10-second positions that arrived, using the sequence numbers, and how late they were
- the effect of crew blocking and the capsize
- whether the measured channel use matches the capacity sums for 30 to 50 boats

The results go into `docs/phase0-results.md`, and the tested firmware version and any changed settings go into [meshtastic-setup.md](meshtastic-setup.md).

## Notes sheet

| Item | Value |
|---|---|
| Date, venue | |
| Meshtastic firmware version | |
| Weather, wind, sea state | |
| Committee boat position (lat, lon) | |
| Heltec antenna height, deck (m) | |
| Heltec antenna height, pole (m) | |
| T-Echo A mounting position on dinghy | |
| Dinghy class | |
| Keelboat pushpit height (m), if tested | |
| Run 1 start / end | |
| Crew-over-tracker times | |
| Run 2 start / turn / end | |
| Run 3 start / turn / end | |
| Capsize over / up times | |
| Channel utilization / Air util TX, end of session 1 | |
| Run 5 start / end | |
| Channel utilization / Air util TX, end of session 2 | |
| Anything odd (rain, other boats, board restarts) | |
