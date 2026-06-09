# Virtual Concert Platform

Room-based virtual concert demo built with Vite, Three.js, Web Audio API, Express, Multer, and Socket.IO.

The app is a synchronized playlist streaming system. A room host uploads multiple audio files into a room playlist, selects the shared current track, and controls playback. Audience users can view the playlist and hear the same selected track near the same playback timeline, but they cannot upload, select, or control playback. Audio files are served as HTTP media URLs, loaded through browser progressive media playback, and rendered through a Web Audio spatial speaker graph.

## Install

```bash
npm install
```

## Run The Demo

Start the room server:

```bash
npm run dev:server
```

In a second terminal, start the Vite client:

```bash
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

Keep both terminals running while using rooms, playlist upload, media serving, and playback synchronization.

## Demo Flow

1. Open the client in a browser.
2. Create a room as host, or join the default `HOST` room.
3. Use **Choose Audio** to upload multiple `.mp3`, `.wav`, `.ogg`, or `.m4a` files.
4. Confirm the uploaded tracks appear in the room playlist.
5. Open another browser tab or window and join the same room as audience.
6. Confirm the audience sees the same playlist.
7. As host, select a playlist track.
8. As host, start, pause, and resume playback.
9. Confirm the audience follows the host-controlled selected track and playback state.
10. Move the avatar around the venue to hear distance, stereo placement, occlusion, and venue reverb change.

Audience clients can view the playlist, but only the host can upload, select tracks, and control playback.

## How Streaming Works

- Playlist uploads use `POST /api/rooms/:roomCode/playlist` with multipart field `tracks`.
- The server stores uploaded files under `server/uploads/rooms/<roomCode>/`.
- Track metadata includes generated safe filenames and HTTP media URLs.
- Socket.IO synchronizes room state, playlist metadata, selected `currentTrackId`, and playback timing.
- Raw audio is not sent through Socket.IO.
- Clients load the selected HTTP media URL with an internal `HTMLAudioElement` in `AudioManager.loadUrl()`.
- The browser progressively buffers the media resource; normal playlist playback does not fetch and decode the full file before playback.
- A single `MediaElementAudioSourceNode` feeds the Web Audio graph.
- Dry audio is routed through left/right speaker `PannerNode` routes with distance attenuation, directional cones, per-speaker occlusion low-pass/gain, and master volume.
- A subtle convolver reverb send adds venue ambience without bypassing the master output.
- A non-audible analyser branch drives A-score, diagnostics, audience reaction, lighting, and speaker visuals.

## Audio Architecture

```text
HTMLAudioElement
-> MediaElementAudioSourceNode
-> sourceInput
   -> analyser branch
   -> speaker route: weight gain -> occlusion low-pass -> occlusion gain -> PannerNode -> master gain -> destination
   -> reverb send -> ConvolverNode -> reverb return -> master gain -> destination
```

The listener follows the avatar, and speaker panner positions are updated from the stage speaker anchors. Playback sync is still room-state based: host events carry the selected track and expected timeline, while each client plays its local media element at the synchronized offset.

## Cleanup

Uploaded audio is temporary runtime data. When a dynamic room is destroyed, or when the protected `HOST` room becomes empty, the server removes that room's upload folder:

```text
server/uploads/rooms/<roomCode>/
```

`server/uploads/` is ignored by git and is recreated automatically when needed.

## Optional Production Build

Create a local production build:

```bash
npm run build
```

Serve the built client with the room server:

```bash
npm run start
```

Then open:

```text
http://localhost:3001
```

## Notes

- Local prototype only.
- No login or authentication.
- Host validation is based on current room socket membership.
- No database or cloud deployment.
- Browser autoplay policies may require a user gesture before remote playback starts.
- Playback sync is event-based with drift correction, not sample-accurate synchronization.
- Reverb uses a generated impulse response for local venue ambience; uploaded playlist audio remains progressively loaded media.
